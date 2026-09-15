"""Closing a shift races with cash capture on separate database connections (P15)."""

import threading
import time
from datetime import timedelta

import pytest
from django.db import connection

from config import clock
from config.api import ApiError
from modules.billing import services
from modules.billing.models import PaymentEntry, Receipt
from modules.parking import services as parking

pytestmark = pytest.mark.django_db(transaction=True)

FLOAT = 50_000
# Long enough for the other connection to reach the row lock; ordering never depends on it.
HOLD_SECONDS = 0.5


@pytest.fixture
def due(gate):
    """An open cashier shift and a confirmed invoice with cash due."""
    with clock.frozen(clock.now() - timedelta(hours=1)):
        session = parking.admit_vehicle(
            member=gate.operator,
            actor=gate.operator.user,
            location_id=gate.location.pk,
            bay_id=gate.bays["A01"].pk,
            plate="BA 4 PA 4444",
            vehicle_class="CAR",
            correlation_id="race",
        )
    shift = services.open_shift(
        member=gate.cashier,
        actor=gate.cashier.user,
        location_id=gate.location.pk,
        opening_float_paisa=FLOAT,
        correlation_id="race",
    )
    quote = services.quote_checkout(member=gate.cashier, session_id=session.pk)
    invoice = services.confirm_checkout(
        member=gate.cashier,
        actor=gate.cashier.user,
        session_id=session.pk,
        quote_token=quote.token,
        correlation_id="race",
    )
    return shift, invoice


def hold_locks_after(monkeypatch, action):
    """Pauses the transaction that records `action` while it still holds its row locks."""
    holding = threading.Event()
    record_audit = services.record_audit

    def pausing(**kwargs):
        record_audit(**kwargs)
        if kwargs["action"] == action:
            holding.set()
            time.sleep(HOLD_SECONDS)

    monkeypatch.setattr(services, "record_audit", pausing)
    return holding


def once(event, call):
    def wait_then_call():
        assert event.wait(15)
        call()

    return wait_then_call


def run_together(**calls):
    outcomes = {}

    def run(name, call):
        try:
            call()
            outcomes[name] = "ok"
        except ApiError as exc:
            outcomes[name] = exc.error_code
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=item) for item in calls.items()]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return outcomes


def capture(gate, invoice):
    return lambda: services.capture_cash(
        member=gate.cashier,
        actor=gate.cashier.user,
        invoice_id=invoice.pk,
        amount_paisa=invoice.total_paisa,
        correlation_id="race",
    )


def close(gate, shift):
    return lambda: services.close_shift(
        member=gate.cashier,
        actor=gate.cashier.user,
        shift_id=shift.pk,
        counted_cash_paisa=FLOAT,
        correlation_id="race",
    )


def test_cash_taken_while_the_shift_closes_is_counted(gate, due, monkeypatch):  # P15
    shift, invoice = due
    capture_holds_shift = hold_locks_after(monkeypatch, "payment.captured")

    outcomes = run_together(
        capture=capture(gate, invoice), close=once(capture_holds_shift, close(gate, shift))
    )

    shift.refresh_from_db()
    assert outcomes == {"capture": "ok", "close": "ok"}
    assert shift.expected_cash_paisa == FLOAT + invoice.total_paisa
    assert shift.variance_paisa == -invoice.total_paisa


def test_cash_offered_once_the_close_holds_the_shift_is_refused(gate, due, monkeypatch):  # P15
    shift, invoice = due
    close_holds_shift = hold_locks_after(monkeypatch, "shift.closed")

    outcomes = run_together(
        close=close(gate, shift), capture=once(close_holds_shift, capture(gate, invoice))
    )

    shift.refresh_from_db()
    assert outcomes == {"close": "ok", "capture": "SHIFT_NOT_OPEN"}
    assert (shift.expected_cash_paisa, shift.variance_paisa) == (FLOAT, 0)
    assert not PaymentEntry.objects.exists()
    assert not Receipt.objects.exists()
