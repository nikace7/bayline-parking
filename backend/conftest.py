import pytest
from rest_framework.test import APIClient

from modules.accounts import services
from modules.accounts.models import OrgMember, User
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
    # ponytail: direct insert until the staff invitation service lands with StaffActionToken.
    def create(organisation, email, roles):
        user = User.objects.create_user(email=email, password=PASSWORD, name=email.split("@")[0])
        return OrgMember.objects.create(organisation=organisation, user=user, roles=roles)

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
