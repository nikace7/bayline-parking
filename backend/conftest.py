import pytest
from rest_framework.test import APIClient

from modules.accounts import services
from modules.accounts.permissions import SESSION_ORG_KEY

PASSWORD = "correct-horse-battery-staple"


@pytest.fixture
def api():
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def csrf():
    def headers_for(client):
        client.get("/api/v1/auth/session")
        return {"HTTP_X_CSRFTOKEN": client.cookies["csrftoken"].value}

    return headers_for


def _register(organisation_name, email):
    return services.register_owner(
        organisation_name=organisation_name,
        name="Owner",
        email=email,
        password=PASSWORD,
        correlation_id="test",
    )


@pytest.fixture
def owner():
    return _register("North Gate Parking", "owner@northgate.test")


@pytest.fixture
def other_owner():
    return _register("Riverside Parking", "owner@riverside.test")


@pytest.fixture
def make_member():
    def create(organisation, email, roles):
        return services.add_member(
            organisation=organisation,
            actor=None,
            email=email,
            name=email.split("@")[0],
            password=PASSWORD,
            roles=roles,
            correlation_id="test",
        )

    return create


@pytest.fixture
def signed_in(api, csrf):
    def sign_in(member):
        api.force_login(member.user)
        session = api.session
        session[SESSION_ORG_KEY] = str(member.organisation_id)
        session.save()
        return csrf(api)

    return sign_in
