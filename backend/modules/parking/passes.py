"""Member pass entitlement at the gate (blueprint section 4).

The pass row is the first lock in the global order: entry takes it before any bay, so the
simultaneous-vehicle limit is counted against a row no other entry can change meanwhile.
"""

from datetime import datetime

from modules.parking.models import (
    MemberPass,
    MemberPassLocation,
    MemberPassVehicle,
    ParkingSession,
    SessionStatus,
    normalize_plate,
)


def lock_entitlement(*, organisation, location, plate: str, now: datetime) -> MemberPass | None:
    """The pass covering this plate at this location now, locked until the entry commits.

    None means the visit pays the tariff like any other. A pass already covering as many parked
    vehicles as its entitlement allows is one of those cases: the vehicle is admitted and
    charged, never turned away, and the members screen shows the pass state before entry."""
    admitted = MemberPassVehicle.objects.filter(
        vehicle__normalized_plate=normalize_plate(plate)
    ).values("member_pass")
    here = MemberPassLocation.objects.filter(location=location).values("member_pass")
    member_pass = (
        MemberPass.objects.for_org(organisation)
        .current(now)
        .filter(pk__in=admitted)
        .filter(pk__in=here)
        # The pass that runs out first is used first.
        .order_by("ends_at")
        .select_for_update()
        .first()
    )
    if member_pass is None:
        return None
    parked = ParkingSession.objects.filter(
        member_pass=member_pass, status=SessionStatus.PARKED
    ).count()
    return None if parked >= member_pass.max_vehicles else member_pass
