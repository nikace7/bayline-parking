"""Zone setup and capacity reads; occupancy guards belong to parking."""

from django.db import transaction
from django.db.models import Count, Q

from config.transactions import conflict_on
from modules.accounts.services import record_audit
from modules.sites.models import CapacityPool, ParkingZone, ZoneMode


def visible_pools(organisation):
    return CapacityPool.objects.for_org(organisation).annotate(
        occupied=Count("sessions", filter=Q(sessions__status="PARKED"))
    )


@transaction.atomic
def create_zone(*, location, actor, name, pools, correlation_id):
    with conflict_on(
        {
            "zone_name_unique": (
                "ZONE_NAME_TAKEN",
                "This location already has a zone with that name.",
            )
        }
    ):
        zone = ParkingZone.objects.create(
            organisation=location.organisation,
            location=location,
            name=name,
            mode=ZoneMode.OPEN_CAPACITY,
        )
    for pool in pools:
        CapacityPool.objects.create(organisation=location.organisation, zone=zone, **pool)
    record_audit(
        organisation=location.organisation,
        actor=actor,
        action="zone.created",
        entity=zone,
        summary={"name": name, "pools": pools},
        correlation_id=correlation_id,
    )
    return zone


def update_pool(pool, *, actor, changes, correlation_id):
    for field, value in changes.items():
        setattr(pool, field, value)
    pool.revision += 1
    pool.save(update_fields=[*changes, "revision"])
    record_audit(
        organisation=pool.organisation,
        actor=actor,
        action="capacity.updated",
        entity=pool,
        summary=changes,
        correlation_id=correlation_id,
    )
    return pool
