"""Separate PostgreSQL connections compete for a real last space and capacity change."""

import threading

import pytest
from django.db import connection

from config.api import ApiError
from modules.parking import services
from modules.parking.models import ParkingSession
from modules.sites import zones
from modules.sites.models import CapacityPool

pytestmark = pytest.mark.django_db(transaction=True)


def race(*calls):
    start = threading.Barrier(len(calls), timeout=15)
    outcomes = []
    errors = []

    def run(call):
        try:
            start.wait()
            call()
            outcomes.append("ok")
        except ApiError as exc:
            outcomes.append(exc.error_code)
        except Exception as exc:
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(call,)) for call in calls]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)
    assert not any(thread.is_alive() for thread in threads)
    assert not errors
    return sorted(outcomes)


def pool_at(gate):
    zone = zones.create_zone(
        location=gate.location,
        actor=gate.owner.user,
        name="Yard",
        pools=[{"vehicle_class": "CAR", "capacity": 1}],
        correlation_id="test",
    )
    return CapacityPool.objects.get(zone=zone)


def entry(gate, pool, plate):
    return lambda: services.admit_vehicle(
        member=gate.operator,
        actor=gate.operator.user,
        location_id=gate.location.pk,
        pool_id=pool.pk,
        plate=plate,
        vehicle_class="CAR",
        correlation_id="race",
    )


def test_only_one_of_four_simultaneous_arrivals_takes_the_last_space(gate):
    pool = pool_at(gate)
    assert race(*(entry(gate, pool, f"BA 1 PA {n}") for n in range(4))) == ["CAPACITY_FULL"] * 3 + [
        "ok"
    ]
    assert ParkingSession.objects.filter(pool=pool, status="PARKED").count() == 1


def test_capacity_reduction_and_admission_share_the_same_lock(gate):
    pool = pool_at(gate)

    def reduce():
        services.change_pool(
            location=gate.location,
            zone_id=pool.zone_id,
            pool_id=pool.pk,
            actor=gate.owner.user,
            expected_revision=1,
            capacity=0,
            correlation_id="race",
        )

    outcomes = race(entry(gate, pool, "BA 2 PA 2002"), reduce)
    pool.refresh_from_db()
    occupied = ParkingSession.objects.filter(pool=pool, status="PARKED").count()
    assert outcomes in [["CAPACITY_FULL", "ok"], ["CAPACITY_IN_USE", "ok"]]
    assert occupied <= pool.capacity


def test_one_pass_place_is_shared_between_bay_and_open_lot_admissions(gate):
    from config import clock
    from modules.parking.tests.test_pass_concurrency import NOW, PLATES, active_pass

    pool = pool_at(gate)
    member_pass = active_pass(gate, PLATES)

    def bay_entry():
        services.admit_vehicle(
            member=gate.operator,
            actor=gate.operator.user,
            location_id=gate.location.pk,
            bay_id=gate.bays["A01"].pk,
            plate=PLATES[1],
            vehicle_class="CAR",
            correlation_id="race",
        )

    with clock.frozen(NOW):
        assert race(entry(gate, pool, PLATES[0]), bay_entry) == ["ok", "ok"]
    assert ParkingSession.objects.count() == 2
    assert ParkingSession.objects.filter(member_pass=member_pass).count() == 1
