"""Customer reservations (blueprint section 4): public availability, holds, confirmation,
cancellation, relocation, staff and customer lists, and the sweep that releases elapsed claims.

Every change to a reservation locks its bay first (two bays in UUID order), so all claims on a bay
are serialised and the `reservation_no_overlap` exclusion constraint is only the final guard.
Lock order: customer account (holds only) -> bays -> reservation -> vehicle -> parking session.
"""

import secrets
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import BooleanField, Case, Count, Exists, OuterRef, Q, QuerySet, Value, When
from rest_framework.exceptions import NotFound, ValidationError

from config import clock
from config.api import ApiError
from config.transactions import conflict_on
from modules.accounts.models import Role, User
from modules.accounts.permissions import ensure_roles
from modules.accounts.services import customer_profile, record_audit
from modules.parking.models import (
    ARRIVAL_CLOSES,
    ARRIVAL_OPENS,
    ParkingSession,
    Reservation,
    ReservationStatus,
    SessionStatus,
)
from modules.parking.services import observe_vehicle
from modules.sites.models import Bay, BayMode, BayState, Location

HOLD_LIFETIME = timedelta(minutes=5)
# Unconfirmed holds one account may keep at once, so nobody can squat on a location's capacity.
MAX_LIVE_HOLDS = 2
# No 0/O or 1/I, which are easy to misread at the gate.
REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
OVERLAP = ("BAY_UNAVAILABLE", "Another reservation already claims that bay for this time.")
MOVABLE = (ReservationStatus.HOLD, ReservationStatus.CONFIRMED)


def public_locations() -> QuerySet[Location]:
    """Enabled locations of every enabled organisation, with their bookable bay count. Public, so
    it carries no plates, customers or occupancy detail."""
    return (
        Location.objects.filter(enabled=True, organisation__enabled=True)
        .select_related("organisation")
        .annotate(
            reservable_bays=Count(
                "bays", filter=Q(bays__mode=BayMode.RESERVABLE, bays__state=BayState.ACTIVE)
            )
        )
        .order_by("name", "pk")
    )


def public_location(location_id) -> Location:
    location = public_locations().filter(pk=location_id).first()
    if location is None:
        raise NotFound()
    return location


def _overstaying(bay, now: datetime) -> QuerySet[ParkingSession]:
    """A vehicle still parked on the bay after its reservation ended (or without one)."""
    return ParkingSession.objects.filter(bay=bay, status=SessionStatus.PARKED).filter(
        Q(reservation__isnull=True) | Q(reservation__ends_at__lte=now)
    )


def free_bays(location, vehicle_class, starts_at, ends_at, now: datetime) -> QuerySet[Bay]:
    """Active reservable bays with no live claim overlapping [starts_at, ends_at) and no vehicle
    overstaying. Lapsed holds and missed arrivals are ignored even before the worker sweeps them."""
    overlapping = Reservation.objects.claiming(now).filter(
        bay=OuterRef("pk"), starts_at__lt=ends_at, ends_at__gt=starts_at
    )
    return (
        Bay.objects.filter(
            location=location,
            mode=BayMode.RESERVABLE,
            state=BayState.ACTIVE,
            vehicle_class=vehicle_class,
        )
        .exclude(Exists(overlapping))
        .exclude(Exists(_overstaying(OuterRef("pk"), now)))
        .order_by("pk")
    )


def availability(*, location_id, vehicle_class, starts_at, ends_at) -> dict:
    location = public_location(location_id)
    now = clock.now()
    return {
        "location_id": location.pk,
        "vehicle_class": vehicle_class,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "available_bays": free_bays(location, vehicle_class, starts_at, ends_at, now).count(),
        "as_of": now,
    }


def _audit(reservation, actor, action, summary, correlation_id) -> None:
    record_audit(
        organisation=reservation.organisation,
        actor=actor,
        action=action,
        entity=reservation,
        summary={"reference": reservation.reference, **summary},
        correlation_id=correlation_id,
    )


@transaction.atomic
def hold_reservation(
    *, user, location_id, vehicle_class, plate, starts_at, ends_at, correlation_id
) -> Reservation:
    """Claims the first free bay for five minutes while the customer confirms."""
    location = public_location(location_id)
    now = clock.now()
    # Counted under the account's row lock, so parallel requests cannot all find room.
    User.objects.select_for_update().get(pk=user.pk)
    live_holds = (
        Reservation.objects.claiming(now)
        .filter(customer__user=user, status=ReservationStatus.HOLD)
        .count()
    )
    if live_holds >= MAX_LIVE_HOLDS:
        raise ApiError(
            409,
            "TOO_MANY_HOLDS",
            "Confirm or cancel your held reservations before holding another.",
        )
    candidates = free_bays(location, vehicle_class, starts_at, ends_at, now)
    for bay_id in list(candidates.values_list("pk", flat=True)):
        bay = Bay.objects.select_for_update().get(pk=bay_id)
        claims = Reservation.objects.filter(bay=bay)
        claims.release_elapsed(now)
        taken = claims.claiming(now).filter(starts_at__lt=ends_at, ends_at__gt=starts_at).exists()
        if taken or bay.mode != BayMode.RESERVABLE or bay.state != BayState.ACTIVE:
            continue  # Changed since the read. Its lock stays held; bays are locked in UUID order.
        vehicle = observe_vehicle(location.organisation, plate, vehicle_class)
        # ponytail: 8-character references collide about once in 10^12 bookings (answers 500).
        with conflict_on({"reservation_no_overlap": OVERLAP}):
            reservation = Reservation.objects.create(
                organisation=location.organisation,
                location=location,
                bay=bay,
                customer=customer_profile(organisation=location.organisation, user=user),
                vehicle=vehicle,
                reference="".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(8)),
                starts_at=starts_at,
                ends_at=ends_at,
                hold_expires_at=now + HOLD_LIFETIME,
                created_by=user,
            )
        summary = {"bay": bay.label, "starts_at": starts_at.isoformat()}
        _audit(reservation, user, "reservation.held", summary, correlation_id)
        return reservation
    raise ApiError(
        409, "NO_BAY_AVAILABLE", "No bay is free for that time. Try another time or vehicle."
    )


def _with_related(queryset: QuerySet[Reservation]) -> QuerySet[Reservation]:
    return queryset.select_related("organisation", "location", "bay", "vehicle", "customer")


def _lock(queryset: QuerySet[Reservation], reservation_id) -> Reservation:
    """Locks the reservation's bay, then the reservation. A relocation between the two reads answers
    a retryable conflict rather than locking out of order."""
    bay_id = queryset.filter(pk=reservation_id).values_list("bay_id", flat=True).first()
    if bay_id is None:
        raise NotFound()
    Bay.objects.select_for_update().get(pk=bay_id)
    reservation = _with_related(queryset).select_for_update(of=("self",)).get(pk=reservation_id)
    if reservation.bay_id != bay_id:
        raise ApiError(
            409,
            "RESERVATION_CHANGED",
            "This reservation just changed. Reload and retry.",
            retryable=True,
        )
    return reservation


def _save(reservation: Reservation, *fields: str) -> None:
    reservation.revision += 1
    reservation.save(update_fields=[*fields, "revision"])


@transaction.atomic
def confirm_reservation(*, user, reservation_id, correlation_id) -> Reservation:
    reservation = _lock(Reservation.objects.filter(customer__user=user), reservation_id)
    if reservation.status != ReservationStatus.HOLD:
        raise ApiError(409, "RESERVATION_NOT_HELD", "This reservation is no longer on hold.")
    if reservation.status_at(clock.now()) == ReservationStatus.EXPIRED:
        raise ApiError(409, "HOLD_EXPIRED", "The hold lapsed. Search again to book this time.")
    reservation.status = ReservationStatus.CONFIRMED
    _save(reservation, "status")
    _audit(reservation, user, "reservation.confirmed", {}, correlation_id)
    return reservation


@transaction.atomic
def cancel_reservation(*, user, member, reservation_id, reason, correlation_id) -> Reservation:
    """Customers cancel their own reservation before check-in. Owners and managers cancel any in
    their organisation, with a reason."""
    scope = Q(customer__user=user)
    if member is not None:
        scope |= Q(organisation=member.organisation)
    reservation = _lock(Reservation.objects.filter(scope), reservation_id)
    by_customer = reservation.customer.user_id == user.pk
    if not by_customer:
        ensure_roles(member, Role.OWNER, Role.MANAGER)
        if not reason:
            raise ValidationError({"reason": ["Say why this reservation is being cancelled."]})
    if reservation.status not in MOVABLE:
        raise ApiError(
            409,
            "RESERVATION_NOT_CANCELLABLE",
            "Only a held or confirmed reservation can be cancelled.",
        )
    reservation.status, reservation.cancel_reason = ReservationStatus.CANCELLED, reason
    _save(reservation, "status", "cancel_reason")
    summary = {"by": "customer" if by_customer else "staff"}
    _audit(reservation, user, "reservation.cancelled", summary, correlation_id)
    return reservation


@transaction.atomic
def relocate_reservation(
    *, member, actor, reservation_id, bay_id, expected_revision, correlation_id
) -> Reservation:
    """Moves a held or confirmed reservation to another free bay, typically when a vehicle overstays
    on its bay. Locks both bays in UUID order, then rechecks both under the locks."""
    scoped = Reservation.objects.for_org(member.organisation)
    current_bay_id = scoped.filter(pk=reservation_id).values_list("bay_id", flat=True).first()
    if current_bay_id is None:
        raise NotFound()
    ensure_roles(member, Role.OWNER, Role.MANAGER)
    if not Bay.objects.for_org(member.organisation).filter(pk=bay_id).exists():
        raise ValidationError({"bay_id": ["Choose a bay at this reservation's location."]})
    bays = {
        bay.pk: bay
        for bay in (
            Bay.objects.select_for_update().get(pk=pk) for pk in sorted({current_bay_id, bay_id})
        )
    }
    reservation = _with_related(scoped).select_for_update(of=("self",)).get(pk=reservation_id)
    if reservation.bay_id != current_bay_id:
        raise ApiError(
            409,
            "RESERVATION_CHANGED",
            "This reservation just changed. Reload and retry.",
            retryable=True,
        )
    if reservation.revision != expected_revision:
        raise ApiError(
            409, "REVISION_CONFLICT", "This reservation changed since you loaded it. Reload."
        )
    if reservation.status not in MOVABLE:
        raise ApiError(
            409, "RESERVATION_NOT_MOVABLE", "Only a held or confirmed reservation can be moved."
        )
    target, now = bays[bay_id], clock.now()
    compatible = (
        target.pk != current_bay_id
        and target.location_id == reservation.location_id
        and target.mode == BayMode.RESERVABLE
        and target.state == BayState.ACTIVE
        and target.vehicle_class == reservation.bay.vehicle_class
    )
    if not compatible:
        raise ApiError(
            409,
            "BAY_INCOMPATIBLE",
            "Choose another active reservable bay for the same vehicle class at this location.",
        )
    claims = Reservation.objects.filter(bay=target)
    claims.release_elapsed(now)
    overlapping = claims.claiming(now).filter(
        starts_at__lt=reservation.ends_at, ends_at__gt=reservation.starts_at
    )
    if overlapping.exists() or _overstaying(target, now).exists():
        raise ApiError(409, *OVERLAP)
    moved_from = reservation.bay.label
    reservation.bay = target
    with conflict_on({"reservation_no_overlap": OVERLAP}):
        _save(reservation, "bay")
    summary = {"from_bay": moved_from, "to_bay": target.label}
    _audit(reservation, actor, "reservation.relocated", summary, correlation_id)
    return reservation


def customer_reservations(user) -> QuerySet[Reservation]:
    return _with_related(Reservation.objects.filter(customer__user=user))


def staff_reservations(member, *, location_id=None, day: date | None = None):
    """The organisation's reservations, each flagged when a vehicle overstays on its bay while the
    reservation still waits to arrive (blueprint section 4: never pretend the bay is free)."""
    organisation = member.organisation
    now = clock.now()
    reservations = _with_related(Reservation.objects.for_org(organisation)).annotate(
        overstay_conflict=Case(
            When(Exists(_overstaying(OuterRef("bay"), now)), status__in=MOVABLE, then=Value(True)),
            default=Value(False),
            output_field=BooleanField(),
        )
    )
    location = None
    if location_id:
        reservations = reservations.filter(location_id=location_id)
        location = Location.objects.for_org(organisation).filter(pk=location_id).first()
    if day:
        zone = ZoneInfo(location.timezone if location else organisation.timezone)
        starts = datetime.combine(day, time.min, zone)
        ends = datetime.combine(day + timedelta(days=1), time.min, zone)
        # A booking starting just after midnight is due at the gate from 23:50 the day before.
        reservations = reservations.filter(starts_at__lt=ends + ARRIVAL_OPENS, ends_at__gt=starts)
    return reservations


def sweep_elapsed(now: datetime, limit: int = 500) -> tuple[int, int]:
    """Worker batch: stores EXPIRED and NO_SHOW for the rows it can lock without waiting, so it
    never queues behind a gate or booking transaction."""
    due = Q(status=ReservationStatus.HOLD, hold_expires_at__lte=now) | Q(
        status=ReservationStatus.CONFIRMED, starts_at__lt=now - ARRIVAL_CLOSES
    )
    with transaction.atomic():
        ids = list(
            Reservation.objects.select_for_update(skip_locked=True)
            .filter(due)
            .values_list("pk", flat=True)[:limit]
        )
        return Reservation.objects.filter(pk__in=ids).release_elapsed(now)
