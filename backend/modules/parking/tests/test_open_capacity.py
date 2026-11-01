"""Open lots keep capacity until physical exit, independently of checkout or payment."""

import uuid
from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest

from config import clock
from modules.parking.models import ParkingSession

pytestmark = pytest.mark.django_db


def key():
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def create_zone(api, headers, location, capacity=1):
    response = api.post(
        f"/api/v1/locations/{location.pk}/zones",
        {"name": "Motorcycle yard", "pools": [{"vehicleClass": "MOTORBIKE", "capacity": capacity}]},
        format="json",
        **headers,
        **key(),
    )
    assert response.status_code == 201, response.data
    return response.json()["data"]


def admit(api, headers, location, pool, plate="BA 1 PA 1001", **changes):
    body = {
        "locationId": str(location.pk),
        "poolId": pool,
        "plate": plate,
        "vehicleClass": "MOTORBIKE",
    }
    return api.post("/api/v1/parking/entries", body | changes, format="json", **headers, **key())


def test_capacity_lasts_until_exit_and_replay_never_occupies_twice(api, signed_in, gate):
    headers = signed_in(gate.owner)
    zone = create_zone(api, headers, gate.location)
    pool = zone["pools"][0]["id"]
    body = {
        "locationId": str(gate.location.pk),
        "poolId": pool,
        "plate": "BA 1 PA 1001",
        "vehicleClass": "MOTORBIKE",
    }
    replay_key = key()
    first = api.post("/api/v1/parking/entries", body, format="json", **headers, **replay_key)
    assert first.status_code == 201
    visit = first.json()["data"]
    assert visit["bayId"] is None
    assert visit["zoneId"] == zone["id"]
    assert visit["bayLabel"] == "Motorcycle yard"
    assert (
        api.post("/api/v1/parking/entries", body, format="json", **headers, **replay_key).data
        == first.data
    )
    full = admit(api, headers, gate.location, pool, "BA 2 PA 2002")
    assert full.status_code == 409
    assert full.data["error"]["code"] == "CAPACITY_FULL"
    base = f"/api/v1/parking/sessions/{visit['id']}"
    quote = api.post(base + "/quote", {}, format="json", **headers).json()["data"]
    assert (
        api.post(
            base + "/checkout",
            {"quoteToken": quote["quoteToken"]},
            format="json",
            **headers,
            **key(),
        ).status_code
        == 201
    )
    assert admit(api, headers, gate.location, pool, "BA 2 PA 2002").status_code == 409
    assert api.post(base + "/exit", {}, format="json", **headers, **key()).status_code == 200
    assert admit(api, headers, gate.location, pool, "BA 2 PA 2002").status_code == 201
    assert ParkingSession.objects.filter(pool_id=pool, status="PARKED").count() == 1


def test_pool_update_uses_revision_and_cannot_shrink_below_occupancy(api, signed_in, gate):
    headers = signed_in(gate.owner)
    zone = create_zone(api, headers, gate.location, capacity=2)
    pool = zone["pools"][0]
    assert admit(api, headers, gate.location, pool["id"]).status_code == 201
    url = f"/api/v1/locations/{gate.location.pk}/zones/{zone['id']}/pools/{pool['id']}"
    assert api.patch(url, {"capacity": 0}, format="json", **headers).status_code == 428
    assert (
        api.patch(url, {"capacity": 0, "expectedRevision": 1}, format="json", **headers).status_code
        == 409
    )
    changed = api.patch(
        url,
        {"capacity": 3, "expectedRevision": 1, "state": "OUT_OF_SERVICE"},
        format="json",
        **headers,
    )
    assert changed.status_code == 200
    assert changed.json()["data"]["occupied"] == 1
    assert changed.json()["data"]["revision"] == 2
    assert admit(api, headers, gate.location, pool["id"], "BA 3 PA 3003").status_code == 409
    assert (
        api.patch(url, {"capacity": 4, "expectedRevision": 1}, format="json", **headers).status_code
        == 409
    )


def test_pool_scope_class_reservation_and_selector_guards(api, signed_in, gate, other_owner):
    headers = signed_in(gate.owner)
    zone = create_zone(api, headers, gate.location)
    pool = zone["pools"][0]["id"]
    assert admit(api, headers, gate.location, pool, vehicleClass="CAR").status_code == 409
    assert (
        admit(api, headers, gate.location, pool, reservationId=str(uuid.uuid4())).status_code == 400
    )
    assert (
        admit(api, headers, gate.location, pool, bayId=str(gate.bays["M01"].pk)).status_code == 400
    )
    foreign_headers = signed_in(other_owner)
    assert api.get(f"/api/v1/locations/{gate.location.pk}/zones").status_code == 404
    assert admit(api, foreign_headers, gate.location, pool).status_code == 404


def test_operator_can_admit_but_cannot_configure_capacity(api, signed_in, gate):
    headers = signed_in(gate.owner)
    zone = create_zone(api, headers, gate.location)
    headers = signed_in(gate.operator)
    assert api.get(f"/api/v1/locations/{gate.location.pk}/zones").status_code == 200
    response = api.post(
        f"/api/v1/locations/{gate.location.pk}/zones",
        {"name": "Forbidden", "pools": [{"vehicleClass": "CAR", "capacity": 1}]},
        format="json",
        **headers,
    )
    assert response.status_code == 403
    assert admit(api, headers, gate.location, zone["pools"][0]["id"]).status_code == 201


def test_paid_open_lot_receipt_and_reports_use_area_without_bay(api, signed_in, gate):
    headers = signed_in(gate.owner)
    zone = create_zone(api, headers, gate.location)
    entered = clock.now()
    with clock.frozen(entered):
        visit = admit(api, headers, gate.location, zone["pools"][0]["id"]).json()["data"]
    with clock.frozen(entered + timedelta(minutes=10)):
        assert (
            api.post(
                "/api/v1/shifts/open",
                {"locationId": str(gate.location.pk), "openingFloatPaisa": 0},
                **headers,
            ).status_code
            == 201
        )
        base = f"/api/v1/parking/sessions/{visit['id']}"
        quote = api.post(base + "/quote", **headers).json()["data"]
        checkout = api.post(
            base + "/checkout", {"quoteToken": quote["quoteToken"]}, **headers, **key()
        ).json()["data"]
        invoice_id = checkout["invoice"]["id"]
        assert checkout["duePaisa"] == 2000
        paid = api.post(
            f"/api/v1/invoices/{invoice_id}/payments",
            {"method": "CASH", "amountPaisa": 2000},
            **headers,
            **key(),
        )
        assert paid.status_code == 201
        detail = api.get(base).json()["data"]
        receipt = api.get(f"/api/v1/receipts/{detail['receipt']['id']}").json()["data"]
        assert receipt["bayLabel"] == zone["name"]
        assert receipt["vehicleClass"] == "MOTORBIKE"
        day = clock.now().astimezone(ZoneInfo(gate.location.timezone)).date().isoformat()
        params = {"fromDate": day, "toDate": day}
        report = api.get("/api/v1/reports/vehicle-log", params).json()["data"]
        assert report["rows"][0]["bayLabel"] == zone["name"]
        assert report["stillParked"] == 1
        assert api.get(
            "/api/v1/reports/vehicle-log", params | {"format": "pdf"}
        ).content.startswith(b"%PDF")
        assert (
            api.get("/api/v1/reports/vehicle-log", params | {"format": "xlsx"}).status_code == 200
        )


def test_zone_creation_replay_validation_and_multiple_vehicle_classes(api, signed_in, gate):
    headers = signed_in(gate.owner)
    url = f"/api/v1/locations/{gate.location.pk}/zones"
    body = {
        "name": "Shared yard",
        "pools": [
            {"vehicleClass": "CAR", "capacity": 2},
            {"vehicleClass": "MOTORBIKE", "capacity": 10},
        ],
    }
    replay = key()
    first = api.post(url, body, format="json", **headers, **replay)
    assert first.status_code == 201
    assert api.post(url, body, format="json", **headers, **replay).json() == first.json()
    assert api.post(url, body, format="json", **headers, **key()).status_code == 409
    for pools in [[], [{"vehicleClass": "CAR", "capacity": -1}], [body["pools"][0]] * 2]:
        assert (
            api.post(url, body | {"pools": pools}, format="json", **headers, **key()).status_code
            == 400
        )
