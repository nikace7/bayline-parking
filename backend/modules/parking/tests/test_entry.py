import uuid

import pytest

from modules.accounts.models import AuditEvent, Role
from modules.parking.models import ParkingSession, SessionStatus
from modules.sites.services import tariff_at

pytestmark = pytest.mark.django_db

ENTRIES = "/api/v1/parking/entries"


def entry(gate, bay="A01", plate="BA 12 PA 3456", vehicle_class="CAR"):
    return {
        "locationId": str(gate.location.pk),
        "bayId": str(gate.bays[bay].pk),
        "plate": plate,
        "vehicleClass": vehicle_class,
    }


def new_key():
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def test_operator_admits_a_vehicle_with_the_tariff_in_force(api, signed_in, gate):
    headers = signed_in(gate.operator)

    response = api.post(ENTRIES, entry(gate, plate="  ba 12   pa 3456 "), **headers, **new_key())

    assert response.status_code == 201
    data = response.json()["data"]
    assert (data["bayLabel"], data["plate"], data["status"]) == ("A01", "ba 12 pa 3456", "PARKED")
    session = ParkingSession.objects.get(pk=data["id"])
    assert session.tariff == tariff_at(gate.location, "CAR", session.entered_at)
    assert AuditEvent.objects.filter(action="parking.entered", entity_id=session.pk).exists()


def test_entry_requires_an_idempotency_key(api, signed_in, gate):
    headers = signed_in(gate.operator)

    response = api.post(ENTRIES, entry(gate), **headers)

    assert response.status_code == 428
    assert response.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"
    assert not ParkingSession.objects.exists()


def test_a_replayed_entry_returns_the_first_result_without_a_second_session(api, signed_in, gate):
    headers = signed_in(gate.operator)
    key = new_key()

    first = api.post(ENTRIES, entry(gate), **headers, **key)
    replay = api.post(ENTRIES, entry(gate), **headers, **key)
    reused = api.post(ENTRIES, entry(gate, bay="A02", plate="BA 1 PA 1"), **headers, **key)

    assert (first.status_code, replay.status_code) == (201, 201)
    assert replay.json() == first.json()
    assert replay["Idempotent-Replayed"] == "true"
    assert reused.status_code == 409
    assert reused.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    assert ParkingSession.objects.count() == 1


def test_occupied_bay_and_already_parked_plate_are_conflicts(api, signed_in, gate):
    headers = signed_in(gate.operator)
    assert api.post(ENTRIES, entry(gate), **headers, **new_key()).status_code == 201

    occupied = api.post(ENTRIES, entry(gate, plate="BA 7 PA 7777"), **headers, **new_key())
    # Same plate typed without spaces and in lower case.
    same_plate = api.post(
        ENTRIES, entry(gate, bay="A02", plate="ba12pa3456"), **headers, **new_key()
    )

    assert occupied.json()["error"]["code"] == "BAY_UNAVAILABLE"
    assert same_plate.json()["error"]["code"] == "VEHICLE_ALREADY_PARKED"
    assert ParkingSession.objects.filter(status=SessionStatus.PARKED).count() == 1


def test_bay_must_take_walk_in_vehicles_of_that_class(api, signed_in, gate):
    headers = signed_in(gate.operator)

    motorbike_in_car_bay = api.post(
        ENTRIES, entry(gate, vehicle_class="MOTORBIKE"), **headers, **new_key()
    )
    reservable_bay = api.post(ENTRIES, entry(gate, bay="R01"), **headers, **new_key())

    assert motorbike_in_car_bay.json()["error"]["code"] == "VEHICLE_CLASS_MISMATCH"
    assert reservable_bay.json()["error"]["code"] == "BAY_UNAVAILABLE"


def test_entry_follows_roles_and_location_assignments(api, signed_in, gate, make_member):
    unassigned = make_member(gate.owner.organisation, "new@northgate.test", [Role.OPERATOR])

    headers = signed_in(gate.cashier)
    wrong_role = api.post(ENTRIES, entry(gate), **headers, **new_key())
    headers = signed_in(unassigned)
    not_assigned = api.post(ENTRIES, entry(gate), **headers, **new_key())

    assert (wrong_role.status_code, wrong_role.json()["error"]["code"]) == (
        403,
        "PERMISSION_DENIED",
    )
    assert (not_assigned.status_code, not_assigned.json()["error"]["code"]) == (
        403,
        "LOCATION_NOT_ASSIGNED",
    )


def test_other_organisation_location_is_not_found(api, signed_in, gate, other_owner):
    headers = signed_in(other_owner)

    response = api.post(ENTRIES, entry(gate), **headers, **new_key())

    assert response.status_code == 404
