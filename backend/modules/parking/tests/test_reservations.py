"""Customer reservations: holds, confirmation, cancellation, access and discovery (P07)."""

import uuid
from datetime import UTC, datetime, timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from config import clock
from modules.accounts.models import IdempotencyRecord, Role
from modules.parking.models import Reservation, ReservationStatus

pytestmark = pytest.mark.django_db

NOW = datetime(2026, 9, 15, 3, 0, tzinfo=UTC)
PASSWORD = "correct-horse-battery-staple"
MINE = "/api/v1/customer/reservations"
STAFF = "/api/v1/reservations"


def key():
    return {"HTTP_IDEMPOTENCY_KEY": uuid.uuid4().hex}


def action(reservation, verb):
    return f"/api/v1/reservations/{reservation['id']}/{verb}"


def booking(gate, start, minutes=60, plate="BA 2 PA 2002"):
    return {
        "locationId": str(gate.location.pk),
        "vehicleClass": "CAR",
        "plate": plate,
        "startsAt": start.isoformat(),
        "endsAt": (start + timedelta(minutes=minutes)).isoformat(),
    }


def hold(api, headers, gate, start, **kwargs):
    response = api.post(MINE, booking(gate, start, **kwargs), **headers, **key())
    assert response.status_code == 201, response.json()
    return response.json()["data"]


def book(api, headers, gate, start, **kwargs):
    """Holds and confirms; returns the confirmed reservation."""
    held = hold(api, headers, gate, start, **kwargs)
    response = api.post(action(held, "confirm"), **headers, **key())
    assert response.status_code == 200, response.json()
    return response.json()["data"]


def code(response):
    return response.json()["error"]["code"]


def test_customer_holds_confirms_and_lists_a_reservation(api, customer, gate):
    start = NOW + timedelta(hours=1)
    with clock.frozen(NOW):
        headers = customer()
        same_key = key()
        held = api.post(MINE, booking(gate, start), **headers, **same_key)
        replayed = api.post(MINE, booking(gate, start), **headers, **same_key)
        confirmed = api.post(action(held.json()["data"], "confirm"), **headers, **key())
        mine = api.get(MINE).json()["data"]

    data = held.json()["data"]
    assert (held.status_code, replayed.json()) == (201, held.json())
    assert (data["status"], data["bayLabel"], data["holdExpiresAt"]) == (
        "HOLD",
        "R01",
        "2026-09-15T03:05:00Z",
    )
    assert (data["arrivalOpensAt"], data["arrivalClosesAt"]) == (
        "2026-09-15T03:50:00Z",
        "2026-09-15T04:15:00Z",
    )
    assert confirmed.json()["data"]["status"] == "CONFIRMED"
    assert [item["reference"] for item in mine] == [data["reference"]]
    assert Reservation.objects.count() == 1


def test_reservation_times_are_validated(api, customer, gate):
    with clock.frozen(NOW):
        headers = customer()
        past = api.post(MINE, booking(gate, NOW - timedelta(minutes=1)), **headers, **key())
        later = NOW + timedelta(hours=1)
        short = api.post(MINE, booking(gate, later, minutes=29), **headers, **key())
        long = api.post(MINE, booking(gate, later, minutes=12 * 60 + 1), **headers, **key())

    assert past.json()["error"]["fieldErrors"] == {"startsAt": ["Choose a start in the future."]}
    assert short.json()["error"]["fieldErrors"] == {
        "endsAt": ["A reservation lasts at least 30 minutes."]
    }
    assert long.json()["error"]["fieldErrors"] == {
        "endsAt": ["A reservation lasts at most 12 hours."]
    }
    assert not Reservation.objects.exists()


def test_overlapping_claims_are_refused_until_a_hold_lapses(api, customer, gate):  # P07
    start = NOW + timedelta(hours=2)
    with clock.frozen(NOW):
        first = hold(api, customer("asha@customer.test"), gate, start)
        headers = customer("bina@customer.test")
        overlapping = api.post(
            MINE,
            booking(gate, start + timedelta(minutes=30), plate="BA 3 PA 3003"),
            **headers,
            **key(),
        )
        adjacent = hold(api, headers, gate, start + timedelta(hours=1), plate="BA 3 PA 3003")

    # Nothing has swept the lapsed hold; the next claim on the bay releases it under the bay lock.
    with clock.frozen(NOW + timedelta(minutes=5)):
        retaken = hold(api, customer("bina@customer.test"), gate, start, plate="BA 4 PA 4004")
        late = api.post(action(first, "confirm"), **customer("asha@customer.test"), **key())

    assert code(overlapping) == "NO_BAY_AVAILABLE"
    assert (adjacent["bayLabel"], retaken["bayLabel"]) == ("R01", "R01")
    assert code(late) == "RESERVATION_NOT_HELD"
    assert Reservation.objects.get(pk=first["id"]).status == ReservationStatus.EXPIRED


def test_a_lapsed_hold_cannot_be_confirmed_before_the_worker_runs(api, customer, gate):  # P07
    with clock.frozen(NOW):
        held = hold(api, customer(), gate, NOW + timedelta(hours=1))

    with clock.frozen(NOW + timedelta(minutes=5, seconds=1)):
        headers = customer()
        confirm = api.post(action(held, "confirm"), **headers, **key())
        shown = api.get(f"{MINE}/{held['id']}").json()["data"]

    assert code(confirm) == "HOLD_EXPIRED"
    assert shown["status"] == "EXPIRED"
    assert Reservation.objects.get(pk=held["id"]).status == ReservationStatus.HOLD


def test_one_account_keeps_at_most_two_unconfirmed_holds(api, customer, gate):
    with clock.frozen(NOW):
        headers = customer()
        for hours in (1, 3):
            hold(api, headers, gate, NOW + timedelta(hours=hours))
        third = api.post(MINE, booking(gate, NOW + timedelta(hours=5)), **headers, **key())

    assert code(third) == "TOO_MANY_HOLDS"


def test_cancellation_follows_ownership_and_roles(
    api, customer, signed_in, gate, make_member, other_owner
):
    manager = make_member(gate.owner.organisation, "manager@northgate.test", [Role.MANAGER])
    with clock.frozen(NOW):
        mine = book(api, customer("asha@customer.test"), gate, NOW + timedelta(hours=1))
        headers = customer("bina@customer.test")
        stranger_read = api.get(f"{MINE}/{mine['id']}")
        stranger_cancel = api.post(action(mine, "cancel"), {}, **headers)
        headers = signed_in(gate.operator)
        operator_cancel = api.post(action(mine, "cancel"), {"reason": "Bay closed"}, **headers)
        headers = signed_in(other_owner)
        foreign_list = api.get(STAFF).json()["data"]
        foreign_cancel = api.post(action(mine, "cancel"), {"reason": "Bay closed"}, **headers)
        headers = signed_in(manager)
        without_reason = api.post(action(mine, "cancel"), {}, **headers)
        headers = customer("asha@customer.test")
        cancelled = api.post(action(mine, "cancel"), {}, **headers)
        again = api.post(action(mine, "cancel"), {}, **headers)

    assert (stranger_read.status_code, stranger_cancel.status_code) == (404, 404)
    assert operator_cancel.status_code == 403
    assert (foreign_list, foreign_cancel.status_code) == ([], 404)
    assert without_reason.json()["error"]["fieldErrors"] == {
        "reason": ["Say why this reservation is being cancelled."]
    }
    assert cancelled.json()["data"]["status"] == "CANCELLED"
    assert code(again) == "RESERVATION_NOT_CANCELLABLE"


def test_public_discovery_shows_free_bays_but_no_personal_details(api, customer, gate):
    start = NOW + timedelta(hours=1)
    with clock.frozen(NOW):
        book(api, customer(), gate, start)
        api.logout()
        locations = api.get("/api/v1/public/locations").json()["data"]
        url = f"/api/v1/public/locations/{gate.location.pk}/availability"

        def free(begins):
            query = {
                "vehicleClass": "CAR",
                "startsAt": begins.isoformat(),
                "endsAt": (begins + timedelta(hours=1)).isoformat(),
            }
            return api.get(url, query).json()["data"]

        taken, later = free(start), free(start + timedelta(hours=1))

    assert [(item["name"], item["reservableBays"]) for item in locations] == [
        ("North Gate Central", 1)
    ]
    assert set(locations[0]) == {
        "id",
        "name",
        "organisationName",
        "address",
        "latitude",
        "longitude",
        "timezone",
        "reservableBays",
    }
    assert (taken["availableBays"], later["availableBays"]) == (0, 1)
    assert set(taken) == {
        "locationId",
        "vehicleClass",
        "startsAt",
        "endsAt",
        "availableBays",
        "asOf",
    }


def test_customers_register_without_staff_access(api, csrf):
    url = "/api/v1/auth/customer/register"
    body = {"name": "Asha", "email": "Asha@Customer.test", "password": PASSWORD}

    created = api.post(url, body, **csrf(api))
    duplicate = api.post(url, body, **csrf(api))
    without_csrf = APIClient(enforce_csrf_checks=True).post(
        url, {**body, "email": "bina@customer.test"}
    )

    session = created.json()["data"]
    assert created.status_code == 201
    assert (session["user"]["email"], session["memberships"]) == ("asha@customer.test", [])
    assert code(duplicate) == "EMAIL_IN_USE"
    assert without_csrf.status_code == 403


def test_worker_releases_lapsed_claims_and_purges_replay_records(api, customer, gate):
    with clock.frozen(NOW):
        headers = customer()
        lapsing = hold(api, headers, gate, NOW + timedelta(hours=1))
        missed = book(api, headers, gate, NOW + timedelta(hours=2))
        upcoming = book(api, headers, gate, NOW + timedelta(hours=6))

    with clock.frozen(NOW + timedelta(hours=2, minutes=16)):
        call_command("worker", "--once", stdout=StringIO())
    statuses = dict(Reservation.objects.values_list("id", "status"))
    replays_after_sweep = IdempotencyRecord.objects.count()
    with clock.frozen(NOW + timedelta(days=7)):
        call_command("worker", "--once", stdout=StringIO())

    assert statuses == {
        uuid.UUID(lapsing["id"]): ReservationStatus.EXPIRED,
        uuid.UUID(missed["id"]): ReservationStatus.NO_SHOW,
        uuid.UUID(upcoming["id"]): ReservationStatus.CONFIRMED,
    }
    assert replays_after_sweep == 5
    assert not IdempotencyRecord.objects.exists()
