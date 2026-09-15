from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction

from config import clock
from modules.accounts.models import Role
from modules.billing import services
from modules.billing.models import Shift
from modules.billing.tests.test_gate_journey import (
    ARRIVAL,
    admit,
    check_out,
    new_key,
    open_shift,
    payments,
)

pytestmark = pytest.mark.django_db

SHIFTS = "/api/v1/shifts"


def take_cash(api, headers, invoice):
    cash = {"method": "CASH", "amountPaisa": invoice["totalPaisa"]}
    response = api.post(payments(invoice["id"]), cash, **headers, **new_key())
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def current_shift_id(api):
    return api.get(f"{SHIFTS}/current").json()["data"]["shift"]["id"]


def test_closing_a_shift_records_expected_counted_and_variance(api, signed_in, gate):
    first = admit(api, signed_in, gate, ARRIVAL)
    second = admit(api, signed_in, gate, ARRIVAL, bay="A02", plate="BA 2 PA 2222")

    with clock.frozen(ARRIVAL + timedelta(minutes=35, seconds=1)):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)  # NPR 1,000 opening float
        payments_taken = [
            take_cash(api, headers, check_out(api, headers, visit)["invoice"])
            for visit in (first, second)
        ]
        shift_id = current_shift_id(api)
        before = api.get(f"{SHIFTS}/{shift_id}/summary").json()["data"]
        closed = api.post(f"{SHIFTS}/{shift_id}/close", {"countedCashPaisa": 119_000}, **headers)
        again = api.post(f"{SHIFTS}/{shift_id}/close", {"countedCashPaisa": 120_000}, **headers)
        current = api.get(f"{SHIFTS}/current").json()["data"]

    assert [payment["receiptNumber"] for payment in payments_taken] == ["NGC-000001", "NGC-000002"]
    assert (before["captureCount"], before["cashCapturedPaisa"], before["expectedCashPaisa"]) == (
        2,
        20_000,
        120_000,
    )
    summary = closed.json()["data"]
    shift = summary["shift"]
    assert (shift["expectedCashPaisa"], shift["countedCashPaisa"], shift["variancePaisa"]) == (
        120_000,
        119_000,
        -1_000,
    )
    assert shift["closedAt"] is not None
    assert summary["expectedCashPaisa"] == 120_000
    assert again.json()["error"]["code"] == "SHIFT_CLOSED"
    assert current["shift"] is None


def test_only_the_holder_closes_a_shift_and_cash_staff_see_only_their_own(
    api, signed_in, gate, make_member, other_owner
):
    second_cashier = make_member(gate.owner.organisation, "cashier2@northgate.test", [Role.CASHIER])

    with clock.frozen(ARRIVAL):
        headers = signed_in(gate.cashier)
        open_shift(api, headers, gate)
        shift_id = current_shift_id(api)
        headers = signed_in(gate.owner)
        owner_close = api.post(f"{SHIFTS}/{shift_id}/close", {"countedCashPaisa": 0}, **headers)
        owner_summary = api.get(f"{SHIFTS}/{shift_id}/summary")
        owner_list = api.get(SHIFTS, {"status": "OPEN"}).json()["data"]
        signed_in(second_cashier)
        colleague_summary = api.get(f"{SHIFTS}/{shift_id}/summary")
        colleague_list = api.get(SHIFTS).json()["data"]
        signed_in(other_owner)
        foreign_summary = api.get(f"{SHIFTS}/{shift_id}/summary")

    assert owner_close.json()["error"]["code"] == "SHIFT_NOT_YOURS"
    assert owner_summary.status_code == 200
    assert [row["id"] for row in owner_list] == [shift_id]
    assert colleague_summary.status_code == 404
    assert colleague_list == []
    assert foreign_summary.status_code == 404


def test_a_closed_shift_is_immutable_and_a_close_needs_its_whole_summary(gate):
    with clock.frozen(ARRIVAL):
        shift = services.open_shift(
            member=gate.cashier,
            actor=gate.cashier.user,
            location_id=gate.location.pk,
            opening_float_paisa=5_000,
            correlation_id="test",
        )
        services.close_shift(
            member=gate.cashier,
            actor=gate.cashier.user,
            shift_id=shift.pk,
            counted_cash_paisa=5_000,
            correlation_id="test",
        )
    still_open = Shift.objects.create(
        organisation=gate.owner.organisation,
        location=gate.location,
        operator=gate.owner.user,
        opening_float_paisa=0,
        opened_at=ARRIVAL,
    )

    with pytest.raises(IntegrityError), transaction.atomic():
        Shift.objects.filter(pk=shift.pk).update(counted_cash_paisa=4_000, variance_paisa=-1_000)
    with pytest.raises(IntegrityError), transaction.atomic():
        Shift.objects.filter(pk=shift.pk).delete()
    with pytest.raises(IntegrityError), transaction.atomic():
        Shift.objects.filter(pk=still_open.pk).update(closed_at=ARRIVAL + timedelta(hours=1))
