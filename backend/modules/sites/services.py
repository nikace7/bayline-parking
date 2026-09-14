from datetime import datetime

from django.db import transaction
from django.db.models import Case, Exists, OuterRef, QuerySet, Value, When

from config import clock
from config.api import ApiError
from config.transactions import conflict_on
from modules.accounts.models import OrgMember, Role
from modules.accounts.services import record_audit
from modules.sites.models import (
    Bay,
    Location,
    LocationAssignment,
    TariffStatus,
    TariffVersion,
)


@transaction.atomic
def create_location(
    *,
    organisation,
    actor,
    name,
    address,
    latitude,
    longitude,
    receipt_prefix,
    correlation_id,
) -> Location:
    with conflict_on(
        {
            "location_receipt_prefix_unique": (
                "RECEIPT_PREFIX_TAKEN",
                "Another location already uses this receipt prefix.",
            )
        }
    ):
        location = Location.objects.create(
            organisation=organisation,
            name=name,
            address=address,
            latitude=latitude,
            longitude=longitude,
            receipt_prefix=receipt_prefix,
            timezone=organisation.timezone,
        )
    record_audit(
        organisation=organisation,
        actor=actor,
        action="location.created",
        entity=location,
        summary={"name": name, "receipt_prefix": receipt_prefix},
        correlation_id=correlation_id,
    )
    return location


@transaction.atomic
def create_bay(*, location, actor, label, vehicle_class, mode, correlation_id) -> Bay:
    with conflict_on(
        {
            "bay_label_unique": (
                "BAY_LABEL_TAKEN",
                "This location already has a bay with that label.",
            )
        }
    ):
        bay = Bay.objects.create(
            organisation_id=location.organisation_id,
            location=location,
            label=label,
            vehicle_class=vehicle_class,
            mode=mode,
        )
    record_audit(
        organisation=location.organisation,
        actor=actor,
        action="bay.created",
        entity=bay,
        summary={"label": label, "vehicle_class": vehicle_class, "mode": mode},
        correlation_id=correlation_id,
    )
    return bay


@transaction.atomic
def assign_member(*, location, member, actor, correlation_id) -> LocationAssignment:
    if member.organisation_id != location.organisation_id:
        raise ValueError("A member can only be assigned within their own organisation.")
    with conflict_on(
        {
            "assignment_unique": (
                "ALREADY_ASSIGNED",
                "This staff member is already assigned to the location.",
            )
        }
    ):
        assignment = LocationAssignment.objects.create(
            organisation_id=location.organisation_id, location=location, member=member
        )
    record_audit(
        organisation=location.organisation,
        actor=actor,
        action="location.member_assigned",
        entity=assignment,
        summary={"member_id": str(member.pk)},
        correlation_id=correlation_id,
    )
    return assignment


def ensure_can_operate(member: OrgMember, location: Location) -> None:
    """Owners act at every location; other staff only where they are assigned."""
    if Role.OWNER in member.roles:
        return
    if not LocationAssignment.objects.filter(location=location, member=member).exists():
        raise ApiError(403, "LOCATION_NOT_ASSIGNED", "You are not assigned to this location.")


@transaction.atomic
def publish_tariff(
    *,
    location,
    actor,
    vehicle_class,
    grace_seconds,
    block_seconds,
    block_paisa,
    daily_cap_paisa,
    tax_bps,
    correlation_id,
    effective_from=None,
) -> TariffVersion:
    with conflict_on(
        {
            "tariff_one_version_per_instant": (
                "TARIFF_VERSION_EXISTS",
                "A version for this vehicle class already starts at that time.",
            )
        }
    ):
        tariff = TariffVersion.objects.create(
            organisation_id=location.organisation_id,
            location=location,
            vehicle_class=vehicle_class,
            effective_from=effective_from or clock.now(),
            grace_seconds=grace_seconds,
            block_seconds=block_seconds,
            block_paisa=block_paisa,
            daily_cap_paisa=daily_cap_paisa,
            tax_bps=tax_bps,
            created_by=actor,
        )
    record_audit(
        organisation=location.organisation,
        actor=actor,
        action="tariff.published",
        entity=tariff,
        summary={
            "vehicle_class": vehicle_class,
            "effective_from": tariff.effective_from.isoformat(),
            "block_paisa": block_paisa,
        },
        correlation_id=correlation_id,
    )
    return tariff_versions(location, clock.now()).get(pk=tariff.pk)


def tariff_versions(location: Location, now: datetime) -> QuerySet[TariffVersion]:
    """Every version for the location, labelled by whether it is in force at `now`."""
    later_in_force = TariffVersion.objects.filter(
        location=OuterRef("location"),
        vehicle_class=OuterRef("vehicle_class"),
        effective_from__gt=OuterRef("effective_from"),
        effective_from__lte=now,
    )
    return (
        TariffVersion.objects.for_org(location.organisation_id)
        .filter(location=location)
        .annotate(
            status=Case(
                When(effective_from__gt=now, then=Value(TariffStatus.SCHEDULED)),
                When(Exists(later_in_force), then=Value(TariffStatus.SUPERSEDED)),
                default=Value(TariffStatus.CURRENT),
            )
        )
    )


def tariff_at(location: Location, vehicle_class: str, at: datetime) -> TariffVersion | None:
    """The version in force at `at`. Entry pins this, never a browser-selected rate."""
    return (
        TariffVersion.objects.filter(
            location=location, vehicle_class=vehicle_class, effective_from__lte=at
        )
        .order_by("-effective_from")
        .first()
    )
