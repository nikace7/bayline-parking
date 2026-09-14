from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from config import clock
from modules.accounts import services
from modules.accounts.models import Role
from modules.accounts.permissions import SESSION_ORG_KEY
from modules.sites import services as sites
from modules.sites.models import BayMode, VehicleClass

PASSWORD = "correct-horse-battery-staple"
TARIFFS_FROM = datetime(2026, 1, 1, tzinfo=UTC)


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


@pytest.fixture
def gate(owner, make_member):
    """North Gate Central: walk-in car bays A01/A02, walk-in motorbike bay M01, reservable car bay
    R01, tariffs in force since 2026 (car NPR 50, motorbike NPR 20 per started 30 minutes after five
    free minutes), and an assigned operator and cashier."""
    organisation, actor = owner.organisation, owner.user
    location = sites.create_location(
        organisation=organisation,
        actor=actor,
        name="North Gate Central",
        address="Durbar Marg, Kathmandu",
        latitude=Decimal("27.712000"),
        longitude=Decimal("85.317800"),
        receipt_prefix="NGC",
        correlation_id="test",
    )
    bays = {
        label: sites.create_bay(
            location=location,
            actor=actor,
            label=label,
            vehicle_class=vehicle_class,
            mode=mode,
            correlation_id="test",
        )
        for label, vehicle_class, mode in [
            ("A01", VehicleClass.CAR, BayMode.WALK_IN),
            ("A02", VehicleClass.CAR, BayMode.WALK_IN),
            ("M01", VehicleClass.MOTORBIKE, BayMode.WALK_IN),
            ("R01", VehicleClass.CAR, BayMode.RESERVABLE),
        ]
    }
    with clock.frozen(TARIFFS_FROM):
        for vehicle_class, block_paisa in [
            (VehicleClass.CAR, 5000),
            (VehicleClass.MOTORBIKE, 2000),
        ]:
            sites.publish_tariff(
                location=location,
                actor=actor,
                vehicle_class=vehicle_class,
                grace_seconds=300,
                block_seconds=1800,
                block_paisa=block_paisa,
                daily_cap_paisa=None,
                tax_bps=0,
                correlation_id="test",
            )
    operator = make_member(organisation, "operator@northgate.test", [Role.OPERATOR])
    cashier = make_member(organisation, "cashier@northgate.test", [Role.CASHIER])
    for member in (operator, cashier):
        sites.assign_member(location=location, member=member, actor=actor, correlation_id="test")
    return SimpleNamespace(
        location=location, bays=bays, owner=owner, operator=operator, cashier=cashier
    )
