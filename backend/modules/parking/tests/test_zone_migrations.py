from io import StringIO

import pytest
from django.core.management import call_command
from django.db import connection
from django.db.migrations.exceptions import IrreversibleError
from django.db.migrations.executor import MigrationExecutor

from modules.billing.models import PaymentEntry, Receipt
from modules.parking import services
from modules.parking.models import ParkingSession
from modules.sites import zones
from modules.sites.models import Bay, CapacityPool


@pytest.mark.django_db(transaction=True)
def test_historical_bay_visits_and_money_survive_zone_backfill(monkeypatch):
    monkeypatch.setenv("DEMO_PASSWORD", "synthetic-zone-migration")
    call_command("seed_demo", stdout=StringIO())
    ids = {
        model: set(model.objects.values_list("pk", flat=True))
        for model in [Bay, ParkingSession, Receipt, PaymentEntry]
    }
    try:
        executor = MigrationExecutor(connection)
        executor.migrate([("parking", "0003_member_passes"), ("sites", "0005_bay_revision")])
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        for model, expected in ids.items():
            assert set(model.objects.values_list("pk", flat=True)) == expected
        for visit in ParkingSession.objects.select_related("bay"):
            assert visit.zone_id == visit.bay.zone_id
            assert visit.pool_id is None
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())


@pytest.mark.django_db(transaction=True)
def test_rollback_refuses_to_invent_bays_for_open_lot_history(gate):
    zone = zones.create_zone(
        location=gate.location,
        actor=gate.owner.user,
        name="Yard",
        pools=[{"vehicle_class": "CAR", "capacity": 1}],
        correlation_id="test",
    )
    pool = CapacityPool.objects.get(zone=zone)
    visit = services.admit_vehicle(
        member=gate.owner,
        actor=gate.owner.user,
        location_id=gate.location.pk,
        pool_id=pool.pk,
        plate="BA 3 PA 3003",
        vehicle_class="CAR",
        correlation_id="test",
    )
    try:
        with pytest.raises(IrreversibleError):
            MigrationExecutor(connection).migrate([("parking", "0003_member_passes")])
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
    assert ParkingSession.objects.get(pk=visit.pk).pool_id == pool.pk
