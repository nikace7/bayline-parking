import uuid
from datetime import timedelta

import pytest

from config import clock
from modules.accounts.models import AuditEvent, Customer, Role, User
from modules.billing.models import PaymentEntry
from modules.parking.models import MemberPass

pytestmark = pytest.mark.django_db
CUSTOMERS = "/api/v1/customers"


def key():
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def create(api, headers, **fields):
    return api.post(CUSTOMERS, {"name": "Walk-up member", **fields}, **headers, **key())


def test_staff_can_create_a_customer_without_an_account_and_replay_safely(api, signed_in, owner):
    headers = signed_in(owner)
    count = User.objects.count()
    replay = key()
    body = {"name": "  राम श्रेष्ठ  ", "phone": "9841000000"}
    first = api.post(CUSTOMERS, body, **headers, **replay)
    again = api.post(CUSTOMERS, body, **headers, **replay)
    assert first.status_code == again.status_code == 201
    profile = first.json()["data"]
    assert profile == again.json()["data"]
    assert (profile["name"], profile["email"], profile["hasOnlineAccount"]) == (
        "राम श्रेष्ठ",
        "",
        False,
    )
    assert Customer.objects.get(pk=profile["id"]).user_id is None

    assert Customer.objects.count() == 1
    assert User.objects.count() == count
    audit = AuditEvent.objects.get(action="customer.created")
    assert not any(value in str(audit.summary) for value in ["9841000000", "राम श्रेष्ठ"])


def test_matching_contact_details_never_merge_or_claim_online_accounts(api, signed_in, owner):
    headers = signed_in(owner)
    first = create(api, headers, email=owner.user.email, phone="9841000000")
    second = create(api, headers, email=owner.user.email, phone="9841000000")
    assert first.status_code == second.status_code == 201
    assert first.json()["data"]["id"] != second.json()["data"]["id"]
    assert Customer.objects.filter(user__isnull=True).count() == 2
    assert Customer.objects.filter(user=owner.user).count() == 0


@pytest.mark.parametrize("role", [Role.OPERATOR, Role.CASHIER, Role.AUDITOR])
def test_customer_contacts_and_creation_are_restricted_to_selling_roles(
    api, signed_in, make_member, owner, role
):
    member = make_member(owner.organisation, f"{role.lower()}@customer-role.test", [role])
    headers = signed_in(member)
    assert api.get(CUSTOMERS).status_code == 403
    assert create(api, headers).status_code == 403
    assert Customer.objects.count() == 0


def test_customer_search_and_cursor_pages_stay_in_the_active_organisation(
    api, signed_in, owner, other_owner
):
    create(api, signed_in(other_owner), name="Shared name", phone="9800000000")
    headers = signed_in(owner)
    create(api, headers, name="Shared name one", phone="9800000000")
    create(api, headers, name="Shared name two", phone="9800000000")
    first = api.get(CUSTOMERS, {"search": "9800000000", "limit": 1})
    assert first.status_code == 200
    assert len(first.json()["data"]) == 1
    second = api.get(
        CUSTOMERS,
        {
            "search": "9800000000",
            "limit": 1,
            "cursor": first.json()["page"]["next"],
        },
    )
    assert len(second.json()["data"]) == 1
    assert second.json()["page"]["next"] is None
    rows = first.json()["data"] + second.json()["data"]
    assert {row["name"] for row in rows} == {"Shared name one", "Shared name two"}


def test_customer_creation_validates_contacts_and_requires_retry_identity(api, signed_in, owner):
    headers = signed_in(owner)
    assert create(api, headers, name=" ").status_code == 400
    assert create(api, headers, email="invalid").status_code == 400
    assert api.post(CUSTOMERS, {"name": "Asha"}, **headers).status_code == 428
    assert Customer.objects.count() == 0


def sale_body(gate, customer_id):
    now = clock.now()
    return {
        "customerId": customer_id,
        "locationId": str(gate.location.pk),
        "vehicles": [{"plate": "BA 50 PA 5005", "vehicleClass": "CAR"}],
        "startsAt": now.isoformat(),
        "endsAt": (now + timedelta(days=30)).isoformat(),
        "pricePaisa": 100050,
    }


def test_walk_up_pass_sale_settlement_and_renewal_preserve_customer_identity(api, signed_in, gate):
    headers = signed_in(gate.owner)
    created = create(api, headers, name="Walk-up Asha", phone="9841000000")
    assert created.status_code == 201
    profile = created.json()["data"]
    sold = api.post("/api/v1/memberships", sale_body(gate, profile["id"]), **headers, **key())
    assert sold.status_code == 201, sold.json()
    member_pass = sold.json()["data"]
    assert (
        member_pass["customerName"],
        member_pass["customerPhone"],
        member_pass["customerEmail"],
    ) == (
        "Walk-up Asha",
        "9841000000",
        "",
    )
    assert member_pass["customerId"] == profile["id"]
    assert (
        api.post(
            "/api/v1/shifts/open",
            {
                "locationId": str(gate.location.pk),
                "openingFloatPaisa": 100000,
            },
            **headers,
        ).status_code
        == 201
    )
    paid = api.post(
        f"/api/v1/invoices/{member_pass['invoiceId']}/payments",
        {
            "method": "CASH",
            "amountPaisa": 100050,
        },
        **headers,
        **key(),
    )
    assert paid.status_code == 201
    renewal = api.post(
        f"/api/v1/memberships/{member_pass['id']}/renew",
        {
            "locationId": str(gate.location.pk),
            "endsAt": (clock.now() + timedelta(days=60)).isoformat(),
            "pricePaisa": 120000,
        },
        **headers,
        **key(),
    )
    assert renewal.status_code == 201, renewal.json()
    assert renewal.json()["data"]["customerId"] == profile["id"]
    assert MemberPass.objects.get(pk=member_pass["id"]).status == "ACTIVE"
    assert PaymentEntry.objects.filter(invoice__member_pass_id=member_pass["id"]).count() == 1
    assert Customer.objects.get(pk=profile["id"]).user_id is None
    admitted = api.post(
        "/api/v1/parking/entries",
        {
            "locationId": str(gate.location.pk),
            "bayId": str(gate.bays["A01"].pk),
            "plate": "BA 50 PA 5005",
            "vehicleClass": "CAR",
        },
        **headers,
        **key(),
    )
    assert admitted.status_code == 201
    assert admitted.json()["data"]["memberPassReference"] == member_pass["reference"]


def test_another_organisations_profile_cannot_buy_a_pass_here(api, signed_in, gate, other_owner):
    foreign = create(api, signed_in(other_owner)).json()["data"]["id"]
    headers = signed_in(gate.owner)
    response = api.post("/api/v1/memberships", sale_body(gate, foreign), **headers, **key())
    assert response.status_code == 404
    assert MemberPass.objects.count() == 0


def test_a_sale_requires_exactly_one_customer_selector(api, signed_in, gate):
    headers = signed_in(gate.owner)
    body = sale_body(gate, uuid.uuid4().hex)
    both = api.post(
        "/api/v1/memberships", {**body, "email": "asha@example.test"}, **headers, **key()
    )
    body.pop("customerId")
    neither = api.post("/api/v1/memberships", body, **headers, **key())
    assert both.status_code == neither.status_code == 400
    assert MemberPass.objects.count() == 0


def test_managers_can_create_profiles(api, signed_in, make_member, owner):
    manager = make_member(owner.organisation, "manager@walkup.test", [Role.MANAGER])
    assert create(api, signed_in(manager)).status_code == 201


def test_a_later_online_registration_does_not_claim_a_matching_walk_up_profile(
    api, signed_in, gate, customer
):
    walk_up = create(api, signed_in(gate.owner), email="bina@customer.test").json()["data"]
    headers = customer("bina@customer.test")
    now = clock.now()
    booking = api.post(
        "/api/v1/customer/reservations",
        {
            "locationId": str(gate.location.pk),
            "vehicleClass": "CAR",
            "plate": "BA 60 PA 6006",
            "startsAt": (now + timedelta(hours=1)).isoformat(),
            "endsAt": (now + timedelta(hours=2)).isoformat(),
        },
        **headers,
        **key(),
    )
    assert booking.status_code == 201, booking.json()
    assert Customer.objects.get(pk=walk_up["id"]).user_id is None
    linked = Customer.objects.get(user__email="bina@customer.test")
    assert str(linked.pk) != walk_up["id"]
    assert linked.reservations.get().pk.hex == uuid.UUID(booking.json()["data"]["id"]).hex
