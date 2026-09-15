"""Reserved arrivals at the gate: the arrival window, overstay and relocation (P08), and bay changes
guarded by occupancy and reservations."""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from config import clock
from modules.accounts.models import Role
from modules.billing.tests.test_gate_journey import check_out, new_key, open_shift, visit
from modules.billing.tests.test_shift_close import take_cash
from modules.parking.models import ParkingSession, Reservation, ReservationStatus, SessionStatus
from modules.parking.tests.test_reservations import NOW, STAFF, action, book, code, key
from modules.sites import services as sites
from modules.sites.models import BayMode, VehicleClass

pytestmark = pytest.mark.django_db

ENTRIES = "/api/v1/parking/entries"


def check_in(api, headers, gate, reservation, plate="BA 2 PA 2002", bay_id=None):
    body = {
        "locationId": str(gate.location.pk),
        "bayId": bay_id or reservation["bayId"],
        "plate": plate,
        "vehicleClass": "CAR",
        "reservationId": reservation["id"],
    }
    return api.post(ENTRIES, body, **headers, **key())


def test_reserved_vehicle_checks_in_and_its_exit_completes_the_reservation(
    api, customer, signed_in, gate
):
    start = NOW + timedelta(hours=1)
    with clock.frozen(NOW):
        reservation = book(api, customer(), gate, start)

    with clock.frozen(start - timedelta(minutes=10)):
        entered = check_in(api, signed_in(gate.operator), gate, reservation)
    session_id = entered.json()["data"]["id"]
    with clock.frozen(start + timedelta(minutes=50)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        take_cash(api, headers, check_out(api, headers, session_id)["invoice"])
        exited = api.post(visit(session_id, "exit"), **signed_in(gate.operator), **new_key())

    assert entered.status_code == 201
    assert ParkingSession.objects.get(pk=session_id).reservation_id == uuid.UUID(reservation["id"])
    assert exited.status_code == 200
    assert Reservation.objects.get(pk=reservation["id"]).status == ReservationStatus.COMPLETED


def test_check_in_follows_the_arrival_window_plate_and_bay(api, customer, signed_in, gate):
    start = NOW + timedelta(hours=1)
    with clock.frozen(NOW):
        reservation = book(api, customer(), gate, start)

    with clock.frozen(start - timedelta(minutes=10, seconds=1)):
        too_early = check_in(api, signed_in(gate.operator), gate, reservation)
    with clock.frozen(start + timedelta(minutes=15, seconds=1)):
        too_late = check_in(api, signed_in(gate.operator), gate, reservation)
    with clock.frozen(start + timedelta(minutes=15)):
        headers = signed_in(gate.operator)
        wrong_plate = check_in(api, headers, gate, reservation, plate="BA 9 PA 9999")
        walk_in_bay = check_in(api, headers, gate, reservation, bay_id=str(gate.bays["A01"].pk))
        unreserved = api.post(
            ENTRIES,
            {
                "locationId": str(gate.location.pk),
                "bayId": reservation["bayId"],
                "plate": "BA 5 PA 5005",
                "vehicleClass": "CAR",
            },
            **headers,
            **key(),
        )
        on_time = check_in(api, headers, gate, reservation)
        cancel_after_arrival = api.post(action(reservation, "cancel"), {}, **customer())

    assert code(too_early) == code(too_late) == "OUTSIDE_ARRIVAL_WINDOW"
    assert code(wrong_plate) == "PLATE_MISMATCH"
    assert code(walk_in_bay) == code(unreserved) == "BAY_UNAVAILABLE"
    assert on_time.status_code == 201
    assert code(cancel_after_arrival) == "RESERVATION_NOT_CANCELLABLE"


def test_early_arrival_waits_while_another_reservation_claims_the_bay(
    api, customer, signed_in, gate
):
    start = NOW + timedelta(hours=1)
    with clock.frozen(NOW):
        reservation = book(api, customer(), gate, start)
    booked = Reservation.objects.get(pk=reservation["id"])
    # Bookings last at least 30 minutes, so only data like this short claim reaches the rule.
    Reservation.objects.create(
        organisation=booked.organisation,
        location=booked.location,
        bay=booked.bay,
        customer=booked.customer,
        vehicle=booked.vehicle,
        reference="EARLY234",
        starts_at=start - timedelta(minutes=20),
        ends_at=start,
        status=ReservationStatus.CONFIRMED,
        created_by=booked.created_by,
    )

    with clock.frozen(start - timedelta(minutes=10)):
        early = check_in(api, signed_in(gate.operator), gate, reservation)

    assert code(early) == "BAY_CLAIMED"


def test_overstay_flags_the_next_reservation_and_relocation_rechecks_both_bays(  # P08
    api, customer, signed_in, gate, make_member
):
    sites.create_bay(
        location=gate.location,
        actor=gate.owner.user,
        label="R02",
        vehicle_class=VehicleClass.CAR,
        mode=BayMode.RESERVABLE,
        correlation_id="test",
    )
    manager = make_member(gate.owner.organisation, "manager@northgate.test", [Role.MANAGER])
    first_start = NOW + timedelta(hours=1)
    second_start = first_start + timedelta(hours=1)
    with clock.frozen(NOW):
        first = book(api, customer("asha@customer.test"), gate, first_start)
        second = book(api, customer("bina@customer.test"), gate, second_start, plate="BA 3 PA 3003")
        third = book(api, customer("cara@customer.test"), gate, second_start, plate="BA 4 PA 4004")
    with clock.frozen(first_start):
        assert check_in(api, signed_in(gate.operator), gate, first).status_code == 201

    # Asha's vehicle stays past her hour and into Bina's arrival window.
    move = {"bayId": third["bayId"], "expectedRevision": second["revision"]}
    with clock.frozen(second_start + timedelta(minutes=5)):
        headers = signed_in(gate.operator)
        blocked = check_in(api, headers, gate, second, plate="BA 3 PA 3003")
        location = {"locationId": str(gate.location.pk)}
        listed = {item["id"]: item for item in api.get(STAFF, location).json()["data"]}
        by_operator = api.post(action(second, "relocate"), move, **headers)
        headers = signed_in(manager)
        no_revision = api.post(action(second, "relocate"), {"bayId": third["bayId"]}, **headers)
        onto_claimed_bay = api.post(action(second, "relocate"), move, **headers)
        api.post(action(third, "cancel"), {}, **customer("cara@customer.test"))
        headers = signed_in(manager)
        stale = api.post(
            action(second, "relocate"),
            {**move, "expectedRevision": move["expectedRevision"] - 1},
            **headers,
        )
        moved = api.post(action(second, "relocate"), move, **headers)
        arrived = check_in(
            api, signed_in(gate.operator), gate, moved.json()["data"], plate="BA 3 PA 3003"
        )

    assert second["bayId"] == first["bayId"] != third["bayId"]
    assert code(blocked) == "BAY_UNAVAILABLE"
    parked_on_first_bay = ParkingSession.objects.filter(
        bay_id=first["bayId"], status=SessionStatus.PARKED
    )
    assert parked_on_first_bay.count() == 1
    conflicts = [listed[item["id"]]["conflict"] for item in (first, second, third)]
    assert conflicts == [False, True, False]
    assert by_operator.status_code == 403
    assert no_revision.status_code == 428
    assert code(onto_claimed_bay) == "BAY_UNAVAILABLE"
    assert code(stale) == "REVISION_CONFLICT"
    assert (moved.status_code, moved.json()["data"]["bayId"]) == (200, third["bayId"])
    assert arrived.status_code == 201


def test_staff_board_lists_a_booking_due_before_local_midnight(api, customer, signed_in, gate):
    sites.create_bay(
        location=gate.location,
        actor=gate.owner.user,
        label="R02",
        vehicle_class=VehicleClass.CAR,
        mode=BayMode.RESERVABLE,
        correlation_id="test",
    )
    midnight = datetime(2026, 9, 16, tzinfo=ZoneInfo(gate.location.timezone))
    with clock.frozen(NOW):
        due = book(api, customer("asha@customer.test"), gate, midnight + timedelta(minutes=5))
        book(
            api,
            customer("bina@customer.test"),
            gate,
            midnight + timedelta(minutes=10),
            plate="BA 3 PA 3003",
        )
        signed_in(gate.operator)
        board = {"locationId": str(gate.location.pk), "date": "2026-09-15"}
        listed = [item["id"] for item in api.get(STAFF, board).json()["data"]]

    # Check-in for 00:05 opens at 23:55 the day before; for 00:10 it opens at midnight.
    assert listed == [due["id"]]


def test_bay_mode_changes_only_when_nothing_uses_the_bay(api, customer, signed_in, gate):
    url = f"/api/v1/locations/{gate.location.pk}/bays/{gate.bays['R01'].pk}"
    with clock.frozen(NOW):
        reservation = book(api, customer(), gate, NOW + timedelta(hours=1))
        headers = signed_in(gate.owner)
        missing_revision = api.patch(url, {"mode": "WALK_IN"}, **headers)
        in_use = api.patch(url, {"mode": "WALK_IN", "expectedRevision": 1}, **headers)
        api.post(action(reservation, "cancel"), {"reason": "Bay repainting"}, **headers)
        changed = api.patch(url, {"mode": "WALK_IN", "expectedRevision": 1}, **headers)
        stale = api.patch(url, {"state": "OUT_OF_SERVICE", "expectedRevision": 1}, **headers)
        headers = signed_in(gate.operator)
        by_operator = api.patch(url, {"state": "OUT_OF_SERVICE", "expectedRevision": 2}, **headers)

    assert missing_revision.status_code == 428
    assert code(in_use) == "BAY_IN_USE"
    bay = changed.json()["data"]
    assert (changed.status_code, bay["mode"], bay["revision"]) == (200, "WALK_IN", 2)
    assert code(stale) == "REVISION_CONFLICT"
    assert by_operator.status_code == 403
