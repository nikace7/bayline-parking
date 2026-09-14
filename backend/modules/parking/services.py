from django.db import transaction
from rest_framework.exceptions import NotFound

from config import clock
from config.api import ApiError
from config.transactions import conflict_on
from modules.accounts.services import record_audit
from modules.parking.models import (
    ParkingSession,
    SessionStatus,
    Vehicle,
    display_plate,
    normalize_plate,
)
from modules.sites.models import Bay, BayMode, BayState, Location
from modules.sites.services import ensure_can_operate, tariff_at

OCCUPIED = ("BAY_UNAVAILABLE", "The selected bay is occupied.")


@transaction.atomic
def admit_vehicle(
    *, member, actor, location_id, bay_id, plate, vehicle_class, correlation_id
) -> ParkingSession:
    """Blueprint section 4 entry. Locks the bay, then touches the vehicle, then inserts the session;
    the partial unique constraints are the final guard against a second occupant."""
    organisation = member.organisation
    location = Location.objects.for_org(organisation).filter(pk=location_id, enabled=True).first()
    if location is None:
        raise NotFound()
    ensure_can_operate(member, location)
    bay = (
        Bay.objects.for_org(organisation)
        .select_for_update()
        .filter(pk=bay_id, location=location)
        .first()
    )
    if bay is None:
        raise NotFound()
    if bay.mode != BayMode.WALK_IN or bay.state != BayState.ACTIVE:
        raise ApiError(409, "BAY_UNAVAILABLE", "This bay does not take walk-in vehicles right now.")
    if bay.vehicle_class != vehicle_class:
        raise ApiError(
            409,
            "VEHICLE_CLASS_MISMATCH",
            f"Bay {bay.label} takes {bay.get_vehicle_class_display().lower()}s only.",
        )
    if ParkingSession.objects.filter(bay=bay, status=SessionStatus.PARKED).exists():
        raise ApiError(409, *OCCUPIED)

    now = clock.now()
    tariff = tariff_at(location, bay.vehicle_class, now)
    if tariff is None:
        raise ApiError(409, "TARIFF_MISSING", "No tariff is in force for this vehicle class here.")
    vehicle = _observe_vehicle(organisation, plate, vehicle_class)
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
            entered_at=now,
            entered_by=actor,
        )
    record_audit(
        organisation=organisation,
        actor=actor,
        action="parking.entered",
        entity=session,
        summary={"bay": bay.label, "tariff_id": str(tariff.pk)},
        correlation_id=correlation_id,
    )
    return session


def _observe_vehicle(organisation, plate, vehicle_class) -> Vehicle:
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
    """Physical exit. The caller holds the session lock and has verified settlement."""
    session.status = SessionStatus.EXITED
    session.exited_at = at
    session.exited_by = actor
    session.save(update_fields=["status", "exited_at", "exited_by"])
