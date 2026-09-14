from contextlib import contextmanager
from datetime import datetime

from django.db import IntegrityError, transaction
from django.db.models import Case, Exists, OuterRef, QuerySet, Value, When

from config import clock
from config.api import ApiError
from modules.accounts.services import record_audit
from modules.sites.models import Bay, Location, TariffStatus, TariffVersion


@contextmanager
def _conflict_on(constraint: str, code: str, message: str):
    """Turns one named unique constraint into a 409; any other integrity failure still raises."""
    try:
        with transaction.atomic():
            yield
    except IntegrityError as exc:
        diag = getattr(exc.__cause__, "diag", None)
        if getattr(diag, "constraint_name", None) != constraint:
            raise
        raise ApiError(409, code, message) from exc


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
    with _conflict_on(
        "location_receipt_prefix_unique",
        "RECEIPT_PREFIX_TAKEN",
        "Another location already uses this receipt prefix.",
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
    with _conflict_on(
        "bay_label_unique", "BAY_LABEL_TAKEN", "This location already has a bay with that label."
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
    with _conflict_on(
        "tariff_one_version_per_instant",
        "TARIFF_VERSION_EXISTS",
        "A version for this vehicle class already starts at that time.",
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
