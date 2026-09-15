from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction

from config import clock
from modules.billing import services
from modules.billing.models import PrintEvent, Receipt
from modules.billing.tests.test_gate_journey import (
    ARRIVAL,
    admit,
    check_out,
    new_key,
    open_shift,
    payments,
    visit,
)
from modules.billing.tests.test_shift_close import take_cash

pytestmark = pytest.mark.django_db

RECEIPTS = "/api/v1/receipts"
BROWSER = {"printerPath": "BROWSER"}


def test_a_reprint_keeps_the_receipt_number_and_counts_copies(
    api, signed_in, gate, other_owner
):  # P17, P01
    session_id = admit(api, signed_in, gate, ARRIVAL)

    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        payment = take_cash(api, headers, check_out(api, headers, session_id)["invoice"])
        receipt_url = f"{RECEIPTS}/{payment['receiptId']}"
        prints = [api.post(f"{receipt_url}/print-events", BROWSER, **headers) for _ in range(2)]
        receipt = api.get(receipt_url).json()["data"]
        detail = api.get(visit(session_id)).json()["data"]
        foreign_headers = signed_in(other_owner)
        foreign_read = api.get(receipt_url)
        foreign_print = api.post(f"{receipt_url}/print-events", BROWSER, **foreign_headers)

    assert [response.json()["data"]["copyNumber"] for response in prints] == [1, 2]
    assert (receipt["number"], receipt["printedCopies"], receipt["plate"]) == (
        "NGC-000001",
        2,
        "BA 12 PA 3456",
    )
    assert receipt["amountPaisa"] == receipt["invoice"]["totalPaisa"] > 0
    assert detail["receipt"] == {"id": payment["receiptId"], "number": "NGC-000001"}
    assert (foreign_read.status_code, foreign_print.status_code) == (404, 404)
    assert Receipt.objects.count() == 1
    assert PrintEvent.objects.count() == 2

    with pytest.raises(IntegrityError), transaction.atomic():
        Receipt.objects.update(number="NGC-999999")
    with pytest.raises(IntegrityError), transaction.atomic():
        PrintEvent.objects.all().delete()


def test_a_capture_rolled_back_after_numbering_leaves_no_gap(api, signed_in, gate, monkeypatch):
    session_id = admit(api, signed_in, gate, ARRIVAL)
    record_audit = services.record_audit

    def fail_after_numbering(**kwargs):
        if kwargs["action"] == "payment.captured":
            raise RuntimeError("connection lost after the receipt was numbered")
        return record_audit(**kwargs)

    with clock.frozen(ARRIVAL + timedelta(hours=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        invoice = check_out(api, headers, session_id)["invoice"]
        cash = {"method": "CASH", "amountPaisa": invoice["totalPaisa"]}
        monkeypatch.setattr(services, "record_audit", fail_after_numbering)
        failed = api.post(payments(invoice["id"]), cash, **headers, **new_key())
        monkeypatch.undo()
        paid = api.post(payments(invoice["id"]), cash, **headers, **new_key())

    assert failed.status_code == 500
    assert paid.json()["data"]["receiptNumber"] == "NGC-000001"
