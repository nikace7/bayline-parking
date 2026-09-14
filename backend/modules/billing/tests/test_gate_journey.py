import uuid
from datetime import UTC, datetime, timedelta

import pytest
from django.db import IntegrityError, transaction

from config import clock
from modules.accounts.models import IdempotencyRecord
from modules.billing.models import CheckoutInvoice, PaymentEntry, Shift
from modules.parking import services as parking
from modules.sites import services as sites
from modules.sites.models import VehicleClass

pytestmark = pytest.mark.django_db

ENTRIES = "/api/v1/parking/entries"
OPEN_SHIFT = "/api/v1/shifts/open"
ARRIVAL = datetime(2026, 9, 14, 3, 0, tzinfo=UTC)


def new_key():
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def visit(session_id, action=""):
    return f"/api/v1/parking/sessions/{session_id}" + (f"/{action}" if action else "")


def payments(invoice_id):
    return f"/api/v1/invoices/{invoice_id}/payments"


def entry(gate, bay="A01", plate="BA 12 PA 3456"):
    return {
        "locationId": str(gate.location.pk),
        "bayId": str(gate.bays[bay].pk),
        "plate": plate,
        "vehicleClass": "CAR",
    }


def admit(api, signed_in, gate, at, **kwargs):
    with clock.frozen(at):
        headers = signed_in(gate.operator)
        response = api.post(ENTRIES, entry(gate, **kwargs), **headers, **new_key())
    assert response.status_code == 201, response.json()
    return response.json()["data"]["id"]


def check_out(api, headers, session_id):
    quote = api.post(visit(session_id, "quote"), **headers).json()["data"]
    response = api.post(
        visit(session_id, "checkout"), {"quoteToken": quote["quoteToken"]}, **headers, **new_key()
    )
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def open_shift(api, headers, gate):
    body = {"locationId": str(gate.location.pk), "openingFloatPaisa": 100_000}
    assert api.post(OPEN_SHIFT, body, **headers).status_code == 201


def test_cash_journey_from_entry_to_exit(api, signed_in, gate):
    session_id = admit(api, signed_in, gate, ARRIVAL)

    with clock.frozen(ARRIVAL + timedelta(minutes=35, seconds=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        quote = api.post(visit(session_id, "quote"), **headers).json()["data"]
        assert (quote["billableSeconds"], quote["blocks"], quote["totalPaisa"]) == (1801, 2, 10000)
        checkout = api.post(
            visit(session_id, "checkout"),
            {"quoteToken": quote["quoteToken"]},
            **headers,
            **new_key(),
        )
        pending = checkout.json()["data"]
        assert (pending["stage"], pending["duePaisa"]) == ("CHECKOUT_PENDING", 10000)

        invoice = pending["invoice"]["id"]
        short = api.post(
            payments(invoice), {"method": "CASH", "amountPaisa": 9000}, **headers, **new_key()
        )
        paid = api.post(
            payments(invoice), {"method": "CASH", "amountPaisa": 10000}, **headers, **new_key()
        )
        assert short.json()["error"]["code"] == "AMOUNT_MISMATCH"
        assert paid.status_code == 201

    with clock.frozen(ARRIVAL + timedelta(minutes=41)):
        headers = signed_in(gate.operator)
        # Settlement alone never records the physical exit (P14).
        ready = api.get(visit(session_id)).json()["data"]
        assert (ready["status"], ready["stage"], ready["duePaisa"]) == ("PARKED", "EXIT_READY", 0)
        exited = api.post(visit(session_id, "exit"), **headers, **new_key())
        again = api.post(visit(session_id, "exit"), **headers, **new_key())
        next_car = api.post(ENTRIES, entry(gate, plate="BA 5 PA 5555"), **headers, **new_key())

    assert (exited.status_code, exited.json()["data"]["stage"]) == (200, "EXITED")
    assert again.json()["error"]["code"] == "SESSION_NOT_PARKED"
    assert next_car.status_code == 201  # the bay was released exactly once


def test_free_stay_still_records_a_zero_invoice_before_exit(api, signed_in, gate):
    session_id = admit(api, signed_in, gate, ARRIVAL)

    with clock.frozen(ARRIVAL + timedelta(minutes=4)):
        headers = signed_in(gate.operator)
        before_checkout = api.post(visit(session_id, "exit"), **headers, **new_key())
        settled = check_out(api, headers, session_id)
        exited = api.post(visit(session_id, "exit"), **headers, **new_key())

    assert before_checkout.json()["error"]["code"] == "CHECKOUT_REQUIRED"
    assert (settled["stage"], settled["invoice"]["totalPaisa"]) == ("EXIT_READY", 0)
    assert exited.status_code == 200


def test_exit_is_refused_while_payment_is_due(api, signed_in, gate):
    session_id = admit(api, signed_in, gate, ARRIVAL)

    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.operator)
        check_out(api, headers, session_id)
        response = api.post(visit(session_id, "exit"), **headers, **new_key())

    assert response.json()["error"]["code"] == "PAYMENT_DUE"


def test_quote_expires_after_two_minutes_and_cannot_be_moved_or_forged(api, signed_in, gate):
    first = admit(api, signed_in, gate, ARRIVAL)
    second = admit(api, signed_in, gate, ARRIVAL, bay="A02", plate="BA 2 PA 2222")
    quoted_at = ARRIVAL + timedelta(minutes=10)

    with clock.frozen(quoted_at):
        headers = signed_in(gate.cashier)
        token = api.post(visit(first, "quote"), **headers).json()["data"]["quoteToken"]
        other_visit = api.post(
            visit(second, "checkout"), {"quoteToken": token}, **headers, **new_key()
        )
        forged = api.post(
            visit(first, "checkout"), {"quoteToken": token[:-2] + "xx"}, **headers, **new_key()
        )
    with clock.frozen(quoted_at + timedelta(seconds=121)):
        headers = signed_in(gate.cashier)
        expired = api.post(visit(first, "checkout"), {"quoteToken": token}, **headers, **new_key())

    assert other_visit.json()["error"]["code"] == "QUOTE_INVALID"
    assert forged.json()["error"]["code"] == "QUOTE_INVALID"
    assert expired.json()["error"] == {
        "code": "QUOTE_EXPIRED",
        "message": "This quote has expired. Request a new one.",
        "fieldErrors": {},
        "retryable": True,
    }
    assert not CheckoutInvoice.objects.exists()


def test_tariff_published_after_entry_does_not_reprice_the_visit(api, signed_in, gate):  # P05
    session_id = admit(api, signed_in, gate, ARRIVAL)
    with clock.frozen(ARRIVAL + timedelta(minutes=1)):
        sites.publish_tariff(
            location=gate.location,
            actor=gate.owner.user,
            vehicle_class=VehicleClass.CAR,
            grace_seconds=0,
            block_seconds=900,
            block_paisa=9000,
            daily_cap_paisa=None,
            tax_bps=1300,
            correlation_id="test",
        )

    with clock.frozen(ARRIVAL + timedelta(minutes=35, seconds=1)):
        headers = signed_in(gate.cashier)
        invoice = check_out(api, headers, session_id)["invoice"]

    assert invoice["totalPaisa"] == 10000


def test_cash_needs_the_cashier_role_and_an_open_shift_at_the_location(api, signed_in, gate):
    session_id = admit(api, signed_in, gate, ARRIVAL)

    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.operator)
        invoice = check_out(api, headers, session_id)["invoice"]
        cash = {"method": "CASH", "amountPaisa": invoice["totalPaisa"]}
        operator_cash = api.post(payments(invoice["id"]), cash, **headers, **new_key())
        headers = signed_in(gate.cashier)
        no_shift = api.post(payments(invoice["id"]), cash, **headers, **new_key())

    assert operator_cash.json()["error"]["code"] == "PERMISSION_DENIED"
    assert no_shift.json()["error"]["code"] == "SHIFT_NOT_OPEN"
    assert not PaymentEntry.objects.exists()


def test_duplicate_cash_request_has_one_financial_effect(api, signed_in, gate):  # P06
    session_id = admit(api, signed_in, gate, ARRIVAL)

    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        invoice = check_out(api, headers, session_id)["invoice"]
        cash = {"method": "CASH", "amountPaisa": invoice["totalPaisa"]}
        key = new_key()
        first = api.post(payments(invoice["id"]), cash, **headers, **key)
        replay = api.post(payments(invoice["id"]), cash, **headers, **key)
        fresh_key = api.post(payments(invoice["id"]), cash, **headers, **new_key())

    assert (first.status_code, replay.status_code) == (201, 201)
    assert replay.json() == first.json()
    assert replay["Idempotent-Replayed"] == "true"
    assert fresh_key.json()["error"]["code"] == "INVOICE_SETTLED"
    assert PaymentEntry.objects.count() == 1


def test_a_crash_before_the_idempotency_record_is_saved_leaves_nothing_behind(
    api, signed_in, gate, monkeypatch
):  # P06
    session_id = admit(api, signed_in, gate, ARRIVAL)
    original_save = IdempotencyRecord.save
    crashes = []

    def crash_once_when_storing_the_response(record, *args, **kwargs):
        if kwargs.get("update_fields") and not crashes:
            crashes.append(record.operation)
            raise RuntimeError("process died after the business write")
        return original_save(record, *args, **kwargs)

    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        invoice = check_out(api, headers, session_id)["invoice"]
        cash = {"method": "CASH", "amountPaisa": invoice["totalPaisa"]}
        key = new_key()
        monkeypatch.setattr(IdempotencyRecord, "save", crash_once_when_storing_the_response)
        crashed = api.post(payments(invoice["id"]), cash, **headers, **key)
        retried = api.post(payments(invoice["id"]), cash, **headers, **key)

    assert crashes == ["billing.cash"]
    assert crashed.status_code == 500
    assert retried.status_code == 201
    assert "Idempotent-Replayed" not in retried
    assert PaymentEntry.objects.count() == 1


def test_visits_list_by_location_and_status_within_the_organisation(
    api, signed_in, gate, other_owner
):
    parked = admit(api, signed_in, gate, ARRIVAL)
    admit(api, signed_in, gate, ARRIVAL, bay="A02", plate="BA 2 PA 2222")
    signed_in(gate.operator)

    rows = api.get(
        "/api/v1/parking/sessions", {"locationId": str(gate.location.pk), "status": "PARKED"}
    ).json()["data"]
    signed_in(other_owner)
    foreign_list = api.get("/api/v1/parking/sessions").json()["data"]
    foreign_detail = api.get(visit(parked))

    assert sorted(row["bayLabel"] for row in rows) == ["A01", "A02"]
    assert {row["stage"] for row in rows} == {"PARKED"}
    assert foreign_list == []
    assert foreign_detail.status_code == 404


def test_database_rejects_money_rows_that_mix_organisations(gate, other_owner):  # P28
    with clock.frozen(ARRIVAL):
        session = parking.admit_vehicle(
            member=gate.operator,
            actor=gate.operator.user,
            location_id=gate.location.pk,
            bay_id=gate.bays["A01"].pk,
            plate="BA 3 PA 3333",
            vehicle_class="CAR",
            correlation_id="test",
        )
    foreign = other_owner.organisation
    zero_invoice = {
        "tariff": session.tariff,
        "cutoff_at": ARRIVAL,
        "billable_seconds": 0,
        "blocks": 0,
        "base_paisa": 0,
        "discount_paisa": 0,
        "tax_paisa": 0,
        "total_paisa": 0,
    }

    with pytest.raises(IntegrityError), transaction.atomic():
        CheckoutInvoice.objects.create(
            organisation=foreign, session=session, created_by=other_owner.user, **zero_invoice
        )

    invoice = CheckoutInvoice.objects.create(
        organisation=gate.owner.organisation,
        session=session,
        created_by=gate.owner.user,
        **zero_invoice,
    )
    foreign_shift = Shift.objects.create(
        organisation=foreign,
        location=gate.location,
        operator=other_owner.user,
        opening_float_paisa=0,
        opened_at=ARRIVAL,
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentEntry.objects.create(
            organisation=gate.owner.organisation,
            invoice=invoice,
            shift=foreign_shift,
            kind="CAPTURE",
            method="CASH",
            amount_paisa=100,
            received_by=gate.owner.user,
        )


def test_ledger_entries_cannot_be_edited_or_deleted(api, signed_in, gate):
    session_id = admit(api, signed_in, gate, ARRIVAL)
    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        invoice = check_out(api, headers, session_id)["invoice"]
        api.post(
            payments(invoice["id"]),
            {"method": "CASH", "amountPaisa": invoice["totalPaisa"]},
            **headers,
            **new_key(),
        )
    entry = PaymentEntry.objects.get()

    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentEntry.objects.filter(pk=entry.pk).update(amount_paisa=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        PaymentEntry.objects.filter(pk=entry.pk).delete()
