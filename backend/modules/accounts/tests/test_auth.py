import pytest

from conftest import PASSWORD
from modules.accounts.models import AuditEvent, Organisation, Role

pytestmark = pytest.mark.django_db

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
SESSION = "/api/v1/auth/session"


def registration(**overrides):
    return {
        "organisationName": "North Gate Parking",
        "name": "Asha Owner",
        "email": "Owner@NorthGate.test",
        "password": PASSWORD,
        **overrides,
    }


def test_register_creates_owner_organisation_and_session(api, csrf):
    response = api.post(REGISTER, registration(), **csrf(api))

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["user"]["email"] == "owner@northgate.test"
    [membership] = body["memberships"]
    assert membership["organisationName"] == "North Gate Parking"
    assert membership["roles"] == [Role.OWNER]
    assert body["activeOrganisationId"] == membership["organisationId"]
    assert AuditEvent.objects.filter(action="organisation.registered").count() == 1
    assert api.get(SESSION).json()["data"]["user"]["email"] == "owner@northgate.test"


def test_register_requires_csrf_token_even_when_anonymous(api):
    response = api.post(REGISTER, registration())

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PERMISSION_DENIED"
    assert not Organisation.objects.exists()


def test_register_rejects_foreign_origin(api, csrf):
    response = api.post(REGISTER, registration(), HTTP_ORIGIN="http://evil.test", **csrf(api))

    assert response.status_code == 403
    assert not Organisation.objects.exists()


def test_duplicate_email_leaves_no_second_organisation(api, csrf, owner):
    response = api.post(REGISTER, registration(organisationName="Second Org"), **csrf(api))

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "EMAIL_IN_USE"
    assert Organisation.objects.count() == 1


def test_weak_password_reports_field_error(api, csrf):
    response = api.post(REGISTER, registration(password="short"), **csrf(api))

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_FAILED"
    assert "password" in error["fieldErrors"]


def test_login_checks_password_and_restores_active_organisation(api, csrf, owner):
    headers = csrf(api)

    bad = api.post(
        LOGIN, {"email": "owner@northgate.test", "password": "wrong-pass-123"}, **headers
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert bad.json()["requestId"]

    good = api.post(LOGIN, {"email": "OWNER@northgate.test", "password": PASSWORD}, **headers)
    assert good.status_code == 200
    assert good.json()["data"]["activeOrganisationId"] == str(owner.organisation_id)


def test_logout_ends_session(api, signed_in, owner):
    headers = signed_in(owner)

    assert api.post("/api/v1/auth/logout", **headers).status_code == 204
    assert api.get(SESSION).json()["data"]["user"] is None


def test_cannot_switch_to_organisation_without_membership(api, signed_in, owner, other_owner):
    headers = signed_in(owner)

    response = api.patch(
        SESSION, {"activeOrganisationId": str(other_owner.organisation_id)}, **headers
    )

    assert response.status_code == 404


def test_login_throttle_ignores_spoofed_forwarded_for(api, csrf, owner):
    headers = csrf(api)
    wrong = {"email": "owner@northgate.test", "password": "wrong-pass-123"}

    for attempt in range(10):
        forged = f"203.0.113.{attempt}"
        response = api.post(LOGIN, wrong, HTTP_X_FORWARDED_FOR=forged, **headers)
        assert response.status_code == 401

    blocked = api.post(LOGIN, wrong, HTTP_X_FORWARDED_FOR="198.51.100.7", **headers)

    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "THROTTLED"
    assert blocked.json()["error"]["retryable"] is True
