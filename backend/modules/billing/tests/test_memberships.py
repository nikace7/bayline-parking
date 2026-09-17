"""Member passes: the sale, settlement, covered visits, the vehicle limit and renewal (P09)."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from django.db import IntegrityError, transaction

from config import clock
from modules.billing.models import CheckoutInvoice, InvoicePurpose
from modules.parking.models import MemberPass, ParkingSession, PassStatus

pytestmark = pytest.mark.django_db

SOLD = datetime(2026, 9, 14, 3, 0, tzinfo=UTC)
MEMBERSHIPS = "/api/v1/memberships"
ENTRIES = "/api/v1/parking/entries"
PLATE = "BA 5 PA 5005"


def new_key():
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def payments(invoice_id):
    return f"/api/v1/invoices/{invoice_id}/payments"


def sale_body(gate, **overrides):
    return {
        "email": "asha@customer.test",
        "locationId": str(gate.location.pk),
        "vehicles": [{"plate": PLATE, "vehicleClass": "CAR"}],
        "startsAt": SOLD.isoformat(),
        "endsAt": (SOLD + timedelta(days=30)).isoformat(),
        "pricePaisa": 500_000,
        **overrides,
    }


def sell(api, headers, gate, **overrides):
    response = api.post(MEMBERSHIPS, sale_body(gate, **overrides), **headers, **new_key())
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def open_shift(api, headers, gate):
    body = {"locationId": str(gate.location.pk), "openingFloatPaisa": 100_000}
    assert api.post("/api/v1/shifts/open", body, **headers).status_code == 201


def settle(api, headers, member_pass):
    body = {"method": "CASH", "amountPaisa": member_pass["totalPaisa"]}
    response = api.post(payments(member_pass["invoiceId"]), body, **headers, **new_key())
    assert response.status_code == 201, response.json()


def sold_and_settled(api, customer, signed_in, gate, at=SOLD, **overrides):
    """A member account, a pass sold to it and its invoice paid: the pass is then ACTIVE."""
    with clock.frozen(at):
        customer("asha@customer.test")
        headers = signed_in(gate.owner)
        member_pass = sell(api, headers, gate, **overrides)
        open_shift(api, headers, gate)
        settle(api, headers, member_pass)
    return member_pass


def admit(api, headers, gate, at, bay="A01", plate=PLATE):
    body = {
        "locationId": str(gate.location.pk),
        "bayId": str(gate.bays[bay].pk),
        "plate": plate,
        "vehicleClass": "CAR",
    }
    with clock.frozen(at):
        response = api.post(ENTRIES, body, **headers, **new_key())
    assert response.status_code == 201, response.json()
    return response.json()["data"]["id"]


def quote_total(api, headers, session_id, at):
    with clock.frozen(at):
        response = api.post(f"/api/v1/parking/sessions/{session_id}/quote", **headers)
    assert response.status_code == 200, response.json()
    return response.json()["data"]["totalPaisa"]


def code(response):
    return response.json()["error"]["code"]


def test_a_sold_pass_waits_for_its_invoice_before_it_entitles_anything(
    api, customer, signed_in, gate
):
    with clock.frozen(SOLD):
        customer("asha@customer.test")
        headers = signed_in(gate.owner)
        member_pass = sell(api, headers, gate)
        unpaid = MemberPass.objects.get(pk=member_pass["id"])
        open_shift(api, headers, gate)
        settle(api, headers, member_pass)
        listed = api.get(MEMBERSHIPS, {"plate": "ba5pa5005"}).json()["data"]

    invoice = CheckoutInvoice.objects.get(member_pass_id=member_pass["id"])
    assert (member_pass["status"], member_pass["duePaisa"]) == ("PENDING", 500_000)
    assert (unpaid.status, unpaid.activated_at) == (PassStatus.PENDING, None)
    assert (invoice.purpose, invoice.session_id, invoice.tariff_id) == (
        InvoicePurpose.MEMBERSHIP,
        None,
        None,
    )
    assert [(row["status"], row["duePaisa"], row["plates"]) for row in listed] == [
        ("ACTIVE", 0, [PLATE])
    ]


def test_a_covered_visit_is_free_for_the_pass_day_and_charged_after_it(
    api, customer, signed_in, gate
):
    sold_and_settled(api, customer, signed_in, gate)
    arrival = SOLD + timedelta(hours=1)
    session_id = admit(api, signed_in(gate.operator), gate, arrival)

    headers = signed_in(gate.cashier)
    inside = quote_total(api, headers, session_id, arrival + timedelta(hours=23))
    # Excess starts exactly one covered day after entry, with no second grace allowance.
    after = quote_total(api, headers, session_id, arrival + timedelta(hours=24, minutes=35))

    assert (inside, after) == (0, 10_000)
    assert ParkingSession.objects.get(pk=session_id).covered_seconds == 86_400


def test_a_second_vehicle_beyond_the_entitlement_parks_and_pays(api, customer, signed_in, gate):
    second = "BA 6 PA 6006"
    sold_and_settled(
        api,
        customer,
        signed_in,
        gate,
        vehicles=[
            {"plate": PLATE, "vehicleClass": "CAR"},
            {"plate": second, "vehicleClass": "CAR"},
        ],
    )
    arrival = SOLD + timedelta(hours=1)
    operator = signed_in(gate.operator)
    covered = admit(api, operator, gate, arrival)
    charged = admit(api, operator, gate, arrival, bay="A02", plate=second)

    headers = signed_in(gate.cashier)
    at = arrival + timedelta(minutes=35)

    # The pass admits both plates but covers one at a time, so the second visit is never refused.
    assert (quote_total(api, headers, covered, at), quote_total(api, headers, charged, at)) == (
        0,
        5_000,
    )
    assert ParkingSession.objects.get(pk=charged).member_pass_id is None


def test_a_renewal_starts_when_the_pass_it_continues_runs_out(api, customer, signed_in, gate):
    member_pass = sold_and_settled(api, customer, signed_in, gate)
    expiry = SOLD + timedelta(days=30)

    with clock.frozen(SOLD + timedelta(days=25)):
        headers = signed_in(gate.owner)
        body = {
            "locationId": str(gate.location.pk),
            "endsAt": (expiry + timedelta(days=30)).isoformat(),
            "pricePaisa": 500_000,
        }
        response = api.post(
            f"{MEMBERSHIPS}/{member_pass['id']}/renew", body, **headers, **new_key()
        )

    renewal = response.json()["data"]
    previous = MemberPass.objects.get(pk=member_pass["id"])
    assert response.status_code == 201, renewal
    # The renewal picks up at the old expiry, so an already pinned visit keeps its own pass.
    assert renewal["startsAt"] == expiry.isoformat().replace("+00:00", "Z")
    assert (renewal["status"], renewal["plates"]) == ("PENDING", [PLATE])
    assert (previous.status, previous.ends_at) == (PassStatus.ACTIVE, expiry)


def test_an_unsettled_pass_cannot_be_renewed(api, customer, signed_in, gate):
    with clock.frozen(SOLD):
        customer("asha@customer.test")
        headers = signed_in(gate.owner)
        member_pass = sell(api, headers, gate)
        body = {
            "locationId": str(gate.location.pk),
            "endsAt": (SOLD + timedelta(days=60)).isoformat(),
            "pricePaisa": 500_000,
        }
        response = api.post(
            f"{MEMBERSHIPS}/{member_pass['id']}/renew", body, **headers, **new_key()
        )

    assert (response.status_code, code(response)) == (409, "PASS_NOT_ACTIVE")


def test_a_pass_needs_an_account_and_a_role_that_may_sell_it(api, signed_in, gate):
    with clock.frozen(SOLD):
        owner = signed_in(gate.owner)
        unknown = api.post(MEMBERSHIPS, sale_body(gate), **owner, **new_key())
        operator = signed_in(gate.operator)
        refused = api.post(MEMBERSHIPS, sale_body(gate), **operator, **new_key())

    assert (unknown.status_code, code(unknown)) == (409, "CUSTOMER_UNKNOWN")
    assert refused.status_code == 403
    assert MemberPass.objects.count() == 0


def test_another_organisation_cannot_see_the_pass(api, customer, signed_in, gate, other_owner):
    sold_and_settled(api, customer, signed_in, gate)

    with clock.frozen(SOLD):
        signed_in(other_owner)
        listed = api.get(MEMBERSHIPS).json()["data"]

    assert listed == []


def test_the_database_refuses_an_invoice_that_mixes_a_visit_and_a_pass(
    api, customer, signed_in, gate
):
    member_pass = sold_and_settled(api, customer, signed_in, gate)
    session_id = admit(api, signed_in(gate.operator), gate, SOLD + timedelta(hours=1))

    with pytest.raises(IntegrityError), transaction.atomic():
        CheckoutInvoice.objects.create(
            organisation_id=gate.location.organisation_id,
            location=gate.location,
            purpose=InvoicePurpose.MEMBERSHIP,
            member_pass_id=member_pass["id"],
            session_id=session_id,
            cutoff_at=SOLD,
            billable_seconds=0,
            blocks=0,
            base_paisa=1,
            discount_paisa=0,
            tax_paisa=0,
            total_paisa=1,
            created_by=gate.owner.user,
        )
