"""Parallel holds on separate connections (P07): the last bay, and one account's hold limit."""

import threading
from datetime import UTC, datetime, timedelta

import pytest
from django.db import connection

from config import clock
from config.api import ApiError
from modules.accounts import services as accounts
from modules.parking import reservations
from modules.parking.models import Reservation

pytestmark = pytest.mark.django_db(transaction=True)

NOW = datetime(2026, 9, 15, 3, 0, tzinfo=UTC)


def customer(n):
    return accounts.register_customer(
        name=f"Customer {n}", email=f"c{n}@customer.test", password="race-demo-password-1"
    )


def race(gate, attempts):
    """Starts each (user, plate, start) hold at once on its own connection; returns the outcomes."""
    ready = threading.Barrier(len(attempts), timeout=15)
    outcomes = []

    def attempt(user, plate, start):
        try:
            ready.wait()
            reservations.hold_reservation(
                user=user,
                location_id=gate.location.pk,
                vehicle_class="CAR",
                plate=plate,
                starts_at=start,
                ends_at=start + timedelta(hours=1),
                correlation_id="race",
            )
            outcomes.append("held")
        except ApiError as exc:
            outcomes.append(exc.error_code)
        finally:
            connection.close()

    # The fixture clock is process-wide, so the threads share this frozen time.
    with clock.frozen(NOW):
        threads = [threading.Thread(target=attempt, args=args) for args in attempts]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
    return sorted(outcomes)


def test_two_customers_racing_for_the_last_bay_get_one_hold(gate):
    start = NOW + timedelta(hours=1)
    attempts = [(customer(n), f"BA 1 PA {n}", start) for n in range(2)]

    assert race(gate, attempts) == ["NO_BAY_AVAILABLE", "held"]
    assert Reservation.objects.count() == 1


def test_parallel_holds_from_one_account_stop_at_the_limit(gate):
    user = customer(0)
    # Hours apart, so every hold finds a bay and only the account limit can refuse one.
    attempts = [(user, "BA 1 PA 1001", NOW + timedelta(hours=1 + 2 * n)) for n in range(3)]

    assert race(gate, attempts) == ["TOO_MANY_HOLDS", "held", "held"]
    assert Reservation.objects.count() == 2
