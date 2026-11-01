from io import StringIO

import pytest
from django.core.management import call_command
from django.db import connection
from django.db.migrations.exceptions import IrreversibleError
from django.db.migrations.executor import MigrationExecutor

from modules.accounts.models import Customer
from modules.billing.models import Receipt
from modules.parking.models import MemberPass, Reservation


@pytest.mark.django_db(transaction=True)
def test_existing_profiles_and_financial_links_survive_contact_migration(monkeypatch):
    monkeypatch.setenv("DEMO_PASSWORD", "synthetic-migration-password")
    call_command("seed_demo", stdout=StringIO())
    identities = {
        "customers": set(Customer.objects.values_list("pk", flat=True)),
        "passes": set(MemberPass.objects.values_list("pk", flat=True)),
        "reservations": set(Reservation.objects.values_list("pk", flat=True)),
        "receipts": set(Receipt.objects.values_list("pk", flat=True)),
    }
    executor = MigrationExecutor(connection)
    try:
        executor.migrate([("accounts", "0004_customer")])
        old = executor.loader.project_state([("accounts", "0004_customer")]).apps
        PreviousCustomer = old.get_model("accounts", "Customer")
        first = PreviousCustomer.objects.first()
        first.name = "Organisation-specific name"
        first.save(update_fields=["name"])
        executor = MigrationExecutor(connection)
        executor.migrate([("accounts", "0006_backfill_customer_contacts")])
        profiles = Customer.objects.select_related("user")
        assert set(profiles.values_list("pk", flat=True)) == identities["customers"]
        assert all(profile.email == profile.user.email for profile in profiles)
        assert Customer.objects.get(pk=first.pk).name == "Organisation-specific name"
        assert set(MemberPass.objects.values_list("pk", flat=True)) == identities["passes"]
        assert set(Reservation.objects.values_list("pk", flat=True)) == identities["reservations"]
        assert set(Receipt.objects.values_list("pk", flat=True)) == identities["receipts"]
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())


@pytest.mark.django_db(transaction=True)
def test_rollback_cannot_remove_contacts_from_unlinked_profiles(owner):
    profile = Customer.objects.create(
        organisation=owner.organisation, name="Walk-up", phone="9800000000"
    )
    try:
        with pytest.raises(IrreversibleError):
            MigrationExecutor(connection).migrate([("accounts", "0004_customer")])
        stored = Customer.objects.get(pk=profile.pk)
        assert (stored.name, stored.phone, stored.user_id) == ("Walk-up", "9800000000", None)
    finally:
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
