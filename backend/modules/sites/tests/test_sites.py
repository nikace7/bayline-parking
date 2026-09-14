from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from config import clock
from modules.accounts.models import AuditEvent, Role
from modules.sites import services
from modules.sites.models import BayMode, TariffVersion, VehicleClass

pytestmark = pytest.mark.django_db

LOCATIONS = "/api/v1/locations"
BAY = {"label": "A01", "vehicleClass": "CAR", "mode": "WALK_IN"}
CAR_TARIFF = {
    "vehicleClass": "CAR",
    "graceSeconds": 300,
    "blockSeconds": 1800,
    "blockPaisa": 5000,
    "dailyCapPaisa": None,
    "taxBps": 0,
}


def location_body(prefix):
    return {
        "name": f"{prefix} Deck",
        "address": "Durbar Marg, Kathmandu",
        "latitude": 27.7172,
        "longitude": 85.324,
        "receiptPrefix": prefix,
    }


@pytest.fixture
def make_location():
    def create(member, prefix="NGC"):
        return services.create_location(
            organisation=member.organisation,
            actor=member.user,
            name=f"{prefix} Deck",
            address="Durbar Marg, Kathmandu",
            latitude=Decimal("27.717200"),
            longitude=Decimal("85.324000"),
            receipt_prefix=prefix,
            correlation_id="test",
        )

    return create


def publish(location, actor, **terms):
    defaults = {
        "vehicle_class": VehicleClass.CAR,
        "grace_seconds": 300,
        "block_seconds": 1800,
        "block_paisa": 5000,
        "daily_cap_paisa": None,
        "tax_bps": 0,
    }
    return services.publish_tariff(
        location=location, actor=actor, correlation_id="test", **(defaults | terms)
    )


def test_locations_are_scoped_to_the_active_organisation(
    api, signed_in, owner, other_owner, make_location
):
    make_location(other_owner, "RVB")
    headers = signed_in(owner)

    created = api.post(LOCATIONS, location_body("NGC"), **headers)

    assert created.status_code == 201
    assert created.json()["data"]["timezone"] == "Asia/Kathmandu"
    assert [row["receiptPrefix"] for row in api.get(LOCATIONS).json()["data"]] == ["NGC"]


def test_other_organisation_location_is_not_found(
    api, signed_in, owner, other_owner, make_location
):
    foreign = make_location(other_owner, "RVB")
    headers = signed_in(owner)

    for child in ("bays", "tariffs"):
        url = f"{LOCATIONS}/{foreign.pk}/{child}"
        assert api.get(url).status_code == 404
        response = api.post(url, {}, **headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


def test_managers_set_up_bays_and_tariffs_but_not_locations(
    api, signed_in, owner, make_member, make_location
):
    location = make_location(owner)
    manager = make_member(owner.organisation, "manager@northgate.test", [Role.MANAGER])
    headers = signed_in(manager)

    assert api.post(LOCATIONS, location_body("NGL"), **headers).status_code == 403
    assert api.post(f"{LOCATIONS}/{location.pk}/bays", BAY, **headers).status_code == 201
    assert api.post(f"{LOCATIONS}/{location.pk}/tariffs", CAR_TARIFF, **headers).status_code == 201


def test_gate_staff_read_setup_but_cannot_change_it(
    api, signed_in, owner, make_member, make_location
):
    location = make_location(owner)
    gate = make_member(owner.organisation, "gate@northgate.test", [Role.OPERATOR, Role.CASHIER])
    headers = signed_in(gate)
    tariffs = f"{LOCATIONS}/{location.pk}/tariffs"

    assert api.get(LOCATIONS).status_code == 200
    assert api.get(tariffs).status_code == 200
    denied = api.post(tariffs, CAR_TARIFF, **headers)
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "PERMISSION_DENIED"


def test_receipt_prefix_and_bay_label_conflicts(api, signed_in, owner, make_location):
    location = make_location(owner, "NGC")
    headers = signed_in(owner)
    bays = f"{LOCATIONS}/{location.pk}/bays"

    prefix = api.post(LOCATIONS, location_body("NGC"), **headers)
    assert prefix.status_code == 409
    assert prefix.json()["error"]["code"] == "RECEIPT_PREFIX_TAKEN"

    assert api.post(bays, BAY, **headers).status_code == 201
    label = api.post(bays, BAY, **headers)
    assert label.status_code == 409
    assert label.json()["error"]["code"] == "BAY_LABEL_TAKEN"


def test_bays_list_in_label_order(api, signed_in, owner, make_location):
    location = make_location(owner)
    for label in ("R01", "A02", "A01"):
        services.create_bay(
            location=location,
            actor=owner.user,
            label=label,
            vehicle_class=VehicleClass.CAR,
            mode=BayMode.WALK_IN,
            correlation_id="test",
        )
    signed_in(owner)

    rows = api.get(f"{LOCATIONS}/{location.pk}/bays").json()["data"]

    assert [row["label"] for row in rows] == ["A01", "A02", "R01"]


def test_tariff_terms_are_validated(api, signed_in, owner, make_location):
    location = make_location(owner)
    headers = signed_in(owner)
    tariffs = f"{LOCATIONS}/{location.pk}/tariffs"

    uneven = api.post(tariffs, {**CAR_TARIFF, "blockSeconds": 1000}, **headers)
    backdated = api.post(
        tariffs, {**CAR_TARIFF, "effectiveFrom": "2020-01-01T00:00:00Z"}, **headers
    )

    assert uneven.status_code == backdated.status_code == 400
    assert "blockSeconds" in uneven.json()["error"]["fieldErrors"]
    assert "effectiveFrom" in backdated.json()["error"]["fieldErrors"]


def test_versions_take_effect_by_time_and_never_reprice_the_past(
    api, signed_in, owner, make_location
):
    location = make_location(owner)
    opened = datetime(2026, 9, 14, 3, 0, tzinfo=UTC)
    with clock.frozen(opened):
        first = publish(location, owner.user)
    later = opened + timedelta(hours=2)
    with clock.frozen(later):
        second = publish(location, owner.user, block_paisa=6000)
        scheduled = publish(
            location, owner.user, block_paisa=7000, effective_from=later + timedelta(days=1)
        )
        signed_in(owner)
        rows = api.get(f"{LOCATIONS}/{location.pk}/tariffs").json()["data"]

    assert {row["id"]: row["status"] for row in rows} == {
        str(first.pk): "SUPERSEDED",
        str(second.pk): "CURRENT",
        str(scheduled.pk): "SCHEDULED",
    }
    assert services.tariff_at(location, VehicleClass.CAR, opened + timedelta(hours=1)) == first
    assert services.tariff_at(location, VehicleClass.CAR, later) == second
    assert services.tariff_at(location, VehicleClass.MOTORBIKE, later) is None
    assert AuditEvent.objects.filter(action="tariff.published").count() == 3


def test_database_guards_tariff_versions(owner, make_location):
    location = make_location(owner)
    tariff = publish(location, owner.user)

    with pytest.raises(IntegrityError), transaction.atomic():
        TariffVersion.objects.filter(pk=tariff.pk).update(block_paisa=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        TariffVersion.objects.filter(pk=tariff.pk).delete()
    # 86400 % 1000 != 0: a block would straddle the 24-hour cap boundary.
    with pytest.raises(IntegrityError), transaction.atomic():
        TariffVersion.objects.create(
            organisation=owner.organisation,
            location=location,
            vehicle_class=VehicleClass.MOTORBIKE,
            effective_from=clock.now(),
            grace_seconds=0,
            block_seconds=1000,
            block_paisa=100,
            tax_bps=0,
            created_by=owner.user,
        )
