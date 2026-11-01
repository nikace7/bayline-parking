"""Member passes: the sale, the renewal and the staff list (blueprint sections 4 and 6).

A sale stores immutable price and validity terms with a MEMBERSHIP invoice; the pass starts
entitling visits only when that invoice is settled, in `services.capture_cash`. A renewal is a
new pass continuing the old one, so a visit already pinned to the old pass is never altered.
"""

import secrets

from django.db import models, transaction
from django.db.models import OuterRef, QuerySet, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework.exceptions import NotFound

from config import clock
from config.api import ApiError
from modules.accounts.models import Customer, User, normalize_email
from modules.accounts.services import customer_profile, record_audit
from modules.billing.models import (
    CheckoutInvoice,
    InvoicePurpose,
    InvoiceStatus,
    PaymentEntry,
)
from modules.parking.models import (
    MemberPass,
    MemberPassLocation,
    MemberPassVehicle,
    PassStatus,
    normalize_plate,
)
from modules.parking.reservations import REFERENCE_ALPHABET
from modules.parking.services import observe_vehicle
from modules.sites.models import Location
from modules.sites.services import ensure_can_operate


def _reference() -> str:
    # ponytail: 8-character references collide about once in 10^12 sales (answers 500).
    return "".join(secrets.choice(REFERENCE_ALPHABET) for _ in range(8))


def _locations(organisation, location_ids) -> list[Location]:
    found = list(Location.objects.for_org(organisation).filter(pk__in=location_ids, enabled=True))
    if len(found) != len(set(location_ids)):
        raise NotFound()
    return found


@transaction.atomic
def sell_pass(
    *,
    member,
    actor,
    email=None,
    customer_id=None,
    location_id,
    permitted_location_ids,
    vehicles,
    starts_at,
    ends_at,
    price_paisa,
    max_vehicles,
    correlation_id,
) -> MemberPass:
    """Sell to a scoped profile or an existing online account; settlement activates entitlement."""
    if (email is None) == (customer_id is None):
        raise ApiError(
            400, "CUSTOMER_SELECTOR_REQUIRED", "Choose a profile or an online account email."
        )
    organisation = member.organisation
    location = Location.objects.for_org(organisation).filter(pk=location_id, enabled=True).first()
    if location is None:
        raise NotFound()
    ensure_can_operate(member, location)
    if customer_id is not None:
        profile = Customer.objects.for_org(organisation).filter(pk=customer_id).first()
        if profile is None:
            raise NotFound()
    else:
        user = User.objects.filter(email=normalize_email(email), is_active=True).first()
        if user is None:
            raise ApiError(
                409,
                "CUSTOMER_UNKNOWN",
                "No online account uses this email. Choose or create a customer profile instead.",
            )
        profile = customer_profile(organisation=organisation, user=user)
    permitted = _locations(organisation, permitted_location_ids or [location_id])
    member_pass = MemberPass.objects.create(
        organisation=organisation,
        customer=profile,
        reference=_reference(),
        starts_at=starts_at,
        ends_at=ends_at,
        max_vehicles=max_vehicles,
        price_paisa=price_paisa,
        created_by=actor,
    )
    _attach(member_pass, permitted=permitted, vehicles=vehicles)
    invoice = _sale_invoice(member_pass, location=location, actor=actor)
    _audit(
        member_pass,
        member=member,
        actor=actor,
        action="membership.sold",
        summary={"invoice_id": str(invoice.pk), "price_paisa": price_paisa},
        correlation_id=correlation_id,
    )
    return member_pass


@transaction.atomic
def renew_pass(
    *, member, actor, pass_id, location_id, starts_at, ends_at, price_paisa, correlation_id
) -> MemberPass:
    """A renewal is a new pass starting at the later of the old expiry and the proposed start,
    with the same entitlement, plates and locations. The old pass keeps the visits it covered."""
    organisation = member.organisation
    previous = (
        MemberPass.objects.for_org(organisation)
        .select_for_update(of=("self",))
        .filter(pk=pass_id)
        .first()
    )
    if previous is None:
        raise NotFound()
    if previous.status != PassStatus.ACTIVE:
        raise ApiError(409, "PASS_NOT_ACTIVE", "Only a settled, uncancelled pass can be renewed.")
    location = Location.objects.for_org(organisation).filter(pk=location_id, enabled=True).first()
    if location is None:
        raise NotFound()
    ensure_can_operate(member, location)
    starts = max(previous.ends_at, starts_at or clock.now())
    if ends_at <= starts:
        raise ApiError(
            409,
            "PASS_INTERVAL_INVALID",
            "A renewal must end after the pass it continues.",
        )
    renewal = MemberPass.objects.create(
        organisation=organisation,
        customer_id=previous.customer_id,
        reference=_reference(),
        starts_at=starts,
        ends_at=ends_at,
        covered_seconds=previous.covered_seconds,
        max_vehicles=previous.max_vehicles,
        price_paisa=price_paisa,
        renews=previous,
        created_by=actor,
    )
    MemberPassLocation.objects.bulk_create(
        MemberPassLocation(
            organisation_id=organisation.pk, member_pass=renewal, location_id=row.location_id
        )
        for row in previous.permitted_locations.all()
    )
    MemberPassVehicle.objects.bulk_create(
        MemberPassVehicle(
            organisation_id=organisation.pk, member_pass=renewal, vehicle_id=row.vehicle_id
        )
        for row in previous.permitted_vehicles.all()
    )
    invoice = _sale_invoice(renewal, location=location, actor=actor)
    _audit(
        renewal,
        member=member,
        actor=actor,
        action="membership.renewed",
        summary={
            "invoice_id": str(invoice.pk),
            "price_paisa": price_paisa,
            "renews": previous.reference,
        },
        correlation_id=correlation_id,
    )
    return renewal


def _attach(member_pass: MemberPass, *, permitted, vehicles) -> None:
    organisation = member_pass.organisation
    MemberPassLocation.objects.bulk_create(
        MemberPassLocation(organisation=organisation, member_pass=member_pass, location=location)
        for location in permitted
    )
    MemberPassVehicle.objects.bulk_create(
        MemberPassVehicle(
            organisation=organisation,
            member_pass=member_pass,
            vehicle=observe_vehicle(organisation, spec["plate"], spec["vehicle_class"]),
        )
        for spec in vehicles
    )


def _sale_invoice(member_pass: MemberPass, *, location, actor) -> CheckoutInvoice:
    """A MEMBERSHIP invoice prices the sale itself: no session, no tariff and no billable time."""
    return CheckoutInvoice.objects.create(
        organisation_id=member_pass.organisation_id,
        location=location,
        purpose=InvoicePurpose.MEMBERSHIP,
        member_pass=member_pass,
        cutoff_at=clock.now(),
        billable_seconds=0,
        blocks=0,
        base_paisa=member_pass.price_paisa,
        discount_paisa=0,
        tax_paisa=0,
        total_paisa=member_pass.price_paisa,
        created_by=actor,
    )


def _audit(member_pass, *, member, actor, action, summary, correlation_id) -> None:
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action=action,
        entity=member_pass,
        summary={
            "reference": member_pass.reference,
            "starts_at": member_pass.starts_at.isoformat(),
            "ends_at": member_pass.ends_at.isoformat(),
            **summary,
        },
        correlation_id=correlation_id,
    )


def passes_visible_to(member, *, plate=None, location_id=None) -> QuerySet[MemberPass]:
    """Every pass in the organisation, annotated with what its sale still owes."""
    invoice = CheckoutInvoice.objects.filter(
        member_pass=OuterRef("pk"), status=InvoiceStatus.CONFIRMED
    )
    paid = (
        PaymentEntry.objects.filter(
            invoice__member_pass=OuterRef("pk"), invoice__status=InvoiceStatus.CONFIRMED
        )
        .values("invoice__member_pass")
        .annotate(total=Sum("amount_paisa"))
        .values("total")
    )
    passes = (
        MemberPass.objects.for_org(member.organisation)
        .select_related("customer")
        .prefetch_related("permitted_vehicles__vehicle", "permitted_locations__location")
        .annotate(
            invoice_id=Subquery(invoice.values("pk")[:1]),
            invoice_total_paisa=Subquery(
                invoice.values("total_paisa")[:1], output_field=models.IntegerField()
            ),
            paid_paisa=Coalesce(Subquery(paid, output_field=models.IntegerField()), 0),
        )
    )
    if plate:
        # A subquery rather than a join, so a pass with several plates is listed once.
        passes = passes.filter(
            pk__in=MemberPassVehicle.objects.filter(
                vehicle__normalized_plate__contains=normalize_plate(plate)
            ).values("member_pass")
        )
    if location_id:
        passes = passes.filter(
            pk__in=MemberPassLocation.objects.filter(location_id=location_id).values("member_pass")
        )
    return passes
