"""Parallel entries on one member pass, on separate connections (P09).

The pass row is locked before any bay, so its simultaneous-vehicle limit is counted once even
when both vehicles arrive at the same moment.
"""

import threading
from datetime import UTC, datetime, timedelta

import pytest
from django.db import connection

from config import clock
from modules.accounts import services as accounts
from modules.parking import services as parking
from modules.parking.models import (
    MemberPass,
    MemberPassLocation,
    MemberPassVehicle,
    ParkingSession,
    PassStatus,
)

pytestmark = pytest.mark.django_db(transaction=True)

NOW = datetime(2026, 9, 15, 3, 0, tzinfo=UTC)
PLATES = ["BA 5 PA 5005", "BA 6 PA 6006"]


def active_pass(gate, plates, max_vehicles=1) -> MemberPass:
    organisation = gate.location.organisation
    user = accounts.register_customer(
        name="Asha", email="asha@customer.test", password="race-demo-password-1"
    )
    member_pass = MemberPass.objects.create(
        organisation=organisation,
        customer=accounts.customer_profile(organisation=organisation, user=user),
        reference="RACE0001",
        starts_at=NOW - timedelta(days=1),
        ends_at=NOW + timedelta(days=30),
        max_vehicles=max_vehicles,
        price_paisa=500_000,
        status=PassStatus.ACTIVE,
        activated_at=NOW - timedelta(days=1),
        created_by=gate.owner.user,
    )
    MemberPassLocation.objects.create(
        organisation=organisation, member_pass=member_pass, location=gate.location
    )
    for plate in plates:
        MemberPassVehicle.objects.create(
            organisation=organisation,
            member_pass=member_pass,
            vehicle=parking.observe_vehicle(organisation, plate, "CAR"),
        )
    return member_pass


def race(gate, arrivals):
    """Admits each (bay, plate) at once, each on its own connection."""
    ready = threading.Barrier(len(arrivals), timeout=15)

    def attempt(bay, plate):
        try:
            ready.wait()
            parking.admit_vehicle(
                member=gate.operator,
                actor=gate.operator.user,
                location_id=gate.location.pk,
                bay_id=gate.bays[bay].pk,
                plate=plate,
                vehicle_class="CAR",
                correlation_id="race",
            )
        finally:
            connection.close()

    # The fixture clock is process-wide, so the threads share this frozen time.
    with clock.frozen(NOW):
        threads = [threading.Thread(target=attempt, args=args) for args in arrivals]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()


def test_two_vehicles_arriving_at_once_use_one_pass_place(gate):
    member_pass = active_pass(gate, PLATES)

    race(gate, [("A01", PLATES[0]), ("A02", PLATES[1])])

    sessions = ParkingSession.objects.all()
    assert sessions.count() == 2
    assert sessions.filter(member_pass=member_pass).count() == 1
    assert {session.covered_seconds for session in sessions} == {None, 86_400}


def test_a_pass_for_two_vehicles_covers_both_arrivals(gate):
    member_pass = active_pass(gate, PLATES, max_vehicles=2)

    race(gate, [("A01", PLATES[0]), ("A02", PLATES[1])])

    assert ParkingSession.objects.filter(member_pass=member_pass).count() == 2
