"""Gate entry and exit, and bay changes guarded by occupancy and reservations (blueprint section 4).

Lock order: member pass -> customer account (holds only) -> bays (UUID ascending) -> reservation
-> vehicle -> parking session -> invoice -> shift -> receipt counter.
"""

from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import NotFound

from config import clock
from config.api import ApiError
from config.transactions import conflict_on
from modules.accounts.services import record_audit
from modules.parking import passes
from modules.parking.models import (
    ParkingSession,
    Reservation,
    ReservationStatus,
    SessionStatus,
    Vehicle,
    display_plate,
    normalize_plate,
)
from modules.sites import services as sites
from modules.sites.models import Bay, BayMode, BayState, Location
from modules.sites.services import ensure_can_operate, tariff_at

OCCUPIED = ("BAY_UNAVAILABLE", "The selected bay is occupied.")


@transaction.atomic
def admit_vehicle(
    *,
    member,
    actor,
    location_id,
    bay_id,
    plate,
    vehicle_class,
    correlation_id,
    reservation_id=None,
) -> ParkingSession:
    """Blueprint section 4 entry. Locks any covering member pass, then the bay, then the
    reservation being checked in, then touches the vehicle and inserts the session; the partial
    unique constraints are the final guard against a second occupant. Walk-ins use WALK_IN bays;
    reservations check in at their RESERVABLE bay."""
    organisation = member.organisation
    location = Location.objects.for_org(organisation).filter(pk=location_id, enabled=True).first()
    if location is None:
        raise NotFound()
    ensure_can_operate(member, location)
    now = clock.now()
    # First lock in the global order: a pass is claimed before any bay, so two entries on one
    # pass cannot both find room under its simultaneous-vehicle limit.
    entitlement = passes.lock_entitlement(
        organisation=organisation, location=location, plate=plate, now=now
    )
    bay = (
        Bay.objects.for_org(organisation)
        .select_for_update()
        .filter(pk=bay_id, location=location)
        .first()
    )
    if bay is None:
        raise NotFound()
    if bay.state != BayState.ACTIVE:
        raise ApiError(409, "BAY_UNAVAILABLE", f"Bay {bay.label} is out of service.")
    if bay.mode == BayMode.RESERVABLE and reservation_id is None:
        raise ApiError(
            409, "BAY_UNAVAILABLE", f"Bay {bay.label} is kept for reservations. Check one in."
        )
    if bay.mode == BayMode.WALK_IN and reservation_id is not None:
        raise ApiError(409, "BAY_UNAVAILABLE", "Reservations check in at reservable bays.")
    if bay.vehicle_class != vehicle_class:
        raise ApiError(
            409,
            "VEHICLE_CLASS_MISMATCH",
            f"Bay {bay.label} takes {bay.get_vehicle_class_display().lower()}s only.",
        )
    # An overstaying vehicle stays the occupant: a reservation never makes a second one (P08).
    if ParkingSession.objects.filter(bay=bay, status=SessionStatus.PARKED).exists():
        raise ApiError(409, *OCCUPIED)

    tariff = tariff_at(location, bay.vehicle_class, now)
    if tariff is None:
        raise ApiError(409, "TARIFF_MISSING", "No tariff is in force for this vehicle class here.")
    reservation = _arriving(bay, reservation_id, plate, now) if reservation_id else None
    vehicle = observe_vehicle(organisation, plate, vehicle_class)
    with conflict_on(
        {
            "session_one_parked_per_bay": OCCUPIED,
            "session_one_parked_per_vehicle": (
                "VEHICLE_ALREADY_PARKED",
                "This vehicle is already parked.",
            ),
        }
    ):
        session = ParkingSession.objects.create(
            organisation=organisation,
            location=location,
            bay=bay,
            vehicle=vehicle,
            tariff=tariff,
            reservation=reservation,
            member_pass=entitlement,
            covered_seconds=entitlement.covered_seconds if entitlement else None,
            entered_at=now,
            entered_by=actor,
        )
    summary = {"bay": bay.label, "tariff_id": str(tariff.pk)}
    if entitlement:
        summary["member_pass"] = entitlement.reference
    if reservation:
        reservation.status = ReservationStatus.CHECKED_IN
        reservation.revision += 1
        reservation.save(update_fields=["status", "revision"])
        summary["reservation"] = reservation.reference
    record_audit(
        organisation=organisation,
        actor=actor,
        action="parking.entered",
        entity=session,
        summary=summary,
        correlation_id=correlation_id,
    )
    return session


def _arriving(bay: Bay, reservation_id, plate, now) -> Reservation:
    """Check-in rules under the bay lock: a confirmed reservation for this bay and plate, inside
    its arrival window, and no other reservation claiming the bay before it starts."""
    reservation = (
        Reservation.objects.filter(pk=reservation_id, bay=bay)
        .select_related("vehicle")
        .select_for_update(of=("self",))
        .first()
    )
    if reservation is None:
        if Reservation.objects.filter(pk=reservation_id, organisation=bay.organisation_id).exists():
            raise ApiError(409, "RESERVATION_BAY_MISMATCH", "This reservation is for another bay.")
        raise NotFound()
    if reservation.status != ReservationStatus.CONFIRMED:
        raise ApiError(
            409, "RESERVATION_NOT_CONFIRMED", "Only a confirmed reservation can check in."
        )
    if not reservation.arrival_opens_at <= now <= reservation.arrival_closes_at:
        raise ApiError(
            409,
            "OUTSIDE_ARRIVAL_WINDOW",
            "Check-in opens 10 minutes before the reservation starts and closes 15 minutes after.",
        )
    if normalize_plate(plate) != reservation.vehicle.normalized_plate:
        raise ApiError(409, "PLATE_MISMATCH", "This plate does not match the reservation.")
    claims = Reservation.objects.filter(bay=bay)
    claims.release_elapsed(now)
    claimed_before_start = (
        claims.claiming(now)
        .exclude(pk=reservation.pk)
        .filter(starts_at__lt=reservation.starts_at, ends_at__gt=now)
    )
    if now < reservation.starts_at and claimed_before_start.exists():
        raise ApiError(
            409, "BAY_CLAIMED", "Another reservation claims this bay until this one starts."
        )
    return reservation


def observe_vehicle(organisation, plate, vehicle_class) -> Vehicle:
    """Matching uses the normalised plate; the latest sighting sets the display plate and class."""
    shown = display_plate(plate)
    vehicle, created = Vehicle.objects.get_or_create(
        organisation=organisation,
        normalized_plate=normalize_plate(plate),
        defaults={"plate": shown, "vehicle_class": vehicle_class},
    )
    if not created and (vehicle.plate, vehicle.vehicle_class) != (shown, vehicle_class):
        vehicle.plate, vehicle.vehicle_class = shown, vehicle_class
        vehicle.save(update_fields=["plate", "vehicle_class"])
    return vehicle


def lock_session(organisation, session_id) -> ParkingSession:
    session = (
        ParkingSession.objects.for_org(organisation)
        .select_related("location", "bay", "vehicle", "tariff")
        .select_for_update(of=("self",))
        .filter(pk=session_id)
        .first()
    )
    if session is None:
        raise NotFound()
    return session


def record_exit(session: ParkingSession, *, actor, at) -> None:
    """Physical exit. The caller holds the session lock and has verified settlement. A checked-in
    reservation completes here; no other writer changes a checked-in reservation."""
    session.status = SessionStatus.EXITED
    session.exited_at = at
    session.exited_by = actor
    session.save(update_fields=["status", "exited_at", "exited_by"])
    if session.reservation_id:
        Reservation.objects.filter(
            pk=session.reservation_id, status=ReservationStatus.CHECKED_IN
        ).update(status=ReservationStatus.COMPLETED, revision=F("revision") + 1)


@transaction.atomic
def change_bay(*, location, actor, bay_id, expected_revision, mode, state, correlation_id) -> Bay:
    """A bay's mode or service state changes only while nothing uses it: no vehicle parked and no
    reservation still claiming it (blueprint section 4)."""
    bay = (
        Bay.objects.for_org(location.organisation)
        .select_for_update()
        .filter(pk=bay_id, location=location)
        .first()
    )
    if bay is None:
        raise NotFound()
    if bay.revision != expected_revision:
        raise ApiError(
            409, "REVISION_CONFLICT", "This bay changed since you loaded it. Reload and retry."
        )
    changes = {
        field: value
        for field, value in (("mode", mode), ("state", state))
        if value is not None and value != getattr(bay, field)
    }
    if not changes:
        return bay
    now = clock.now()
    claims = Reservation.objects.filter(bay=bay)
    claims.release_elapsed(now)
    parked = ParkingSession.objects.filter(bay=bay, status=SessionStatus.PARKED).exists()
    if parked or claims.claiming(now).exists():
        raise ApiError(
            409,
            "BAY_IN_USE",
            "A parked vehicle or a reservation still uses this bay. Move or cancel it first.",
        )
    return sites.update_bay(
        bay, location=location, actor=actor, changes=changes, correlation_id=correlation_id
    )
