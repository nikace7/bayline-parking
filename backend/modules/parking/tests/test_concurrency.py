"""Races on separate database connections (blueprint section 9: no sequential calls pretending
to race)."""

import threading

import pytest
from django.db import connection, transaction

from config.api import ApiError
from config.transactions import retry_on_conflict
from modules.parking import services
from modules.parking.models import ParkingSession, SessionStatus
from modules.sites.models import Bay

pytestmark = pytest.mark.django_db(transaction=True)


def admission(gate, bay, plate):
    return lambda: services.admit_vehicle(
        member=gate.operator,
        actor=gate.operator.user,
        location_id=gate.location.pk,
        bay_id=gate.bays[bay].pk,
        plate=plate,
        vehicle_class="CAR",
        correlation_id="race",
    )


def race(*calls):
    """Starts every call at the same moment on its own connection; returns sorted outcomes."""
    start = threading.Barrier(len(calls), timeout=15)
    outcomes = []

    def run(call):
        try:
            start.wait()
            call()
            outcomes.append("admitted")
        except ApiError as exc:
            outcomes.append(exc.error_code)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(call,)) for call in calls]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return sorted(outcomes)


def test_simultaneous_admissions_to_one_bay_leave_one_occupant(gate):  # P02
    outcomes = race(*(admission(gate, "A01", f"BA 1 PA {n}") for n in range(4)))

    assert outcomes == ["BAY_UNAVAILABLE"] * 3 + ["admitted"]
    assert (
        ParkingSession.objects.filter(bay=gate.bays["A01"], status=SessionStatus.PARKED).count()
        == 1
    )


def test_one_plate_racing_into_two_bays_parks_once(gate):  # P03
    outcomes = race(admission(gate, "A01", "BA 9 PA 9999"), admission(gate, "A02", "ba9pa9999"))

    assert outcomes == ["VEHICLE_ALREADY_PARKED", "admitted"]
    assert ParkingSession.objects.filter(status=SessionStatus.PARKED).count() == 1


def test_deadlock_victim_is_retried_to_one_consistent_outcome(gate):  # P29
    # The two transactions deliberately break the global lock order to force a real deadlock.
    both_hold_one_lock = threading.Barrier(2, timeout=15)
    attempts, errors = [], []

    def lock_both(name, first, second):
        @retry_on_conflict
        def body():
            attempts.append(name)
            with transaction.atomic():
                Bay.objects.select_for_update().get(pk=first.pk)
                if attempts.count(name) == 1:
                    both_hold_one_lock.wait()
                Bay.objects.select_for_update().get(pk=second.pk)

        try:
            body()
        except Exception as exc:  # surfaced through the assertion below
            errors.append(exc)
        finally:
            connection.close()

    a01, a02 = gate.bays["A01"], gate.bays["A02"]
    threads = [
        threading.Thread(target=lock_both, args=("forward", a01, a02)),
        threading.Thread(target=lock_both, args=("reverse", a02, a01)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert len(attempts) == 3  # one transaction was chosen as the deadlock victim and rerun once
