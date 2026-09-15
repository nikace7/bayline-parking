from collections import Counter
from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from modules.accounts.models import Organisation, OrgMember
from modules.billing import services as billing
from modules.billing.models import Receipt, SessionStage, Shift
from modules.sites.models import Bay, BayMode, Location, LocationAssignment, TariffVersion

pytestmark = pytest.mark.django_db


def test_seed_builds_demo_data_once(monkeypatch):
    monkeypatch.setenv("DEMO_PASSWORD", "synthetic-demo-password")

    call_command("seed_demo", stdout=StringIO())
    call_command("seed_demo", stdout=StringIO())

    assert Organisation.objects.count() == 2
    assert OrgMember.objects.count() == 6
    assert Location.objects.count() == 3
    assert Bay.objects.filter(mode=BayMode.WALK_IN).count() == 36
    assert Bay.objects.filter(mode=BayMode.RESERVABLE).count() == 18
    assert TariffVersion.objects.count() == 6
    # Operator and cashier at both North Gate locations, added once.
    assert LocationAssignment.objects.count() == 4
    # Blueprint cash fixture, run through the gate and shift services once.
    closed, still_open = Shift.objects.order_by("opened_at")
    assert (
        closed.opening_float_paisa,
        closed.expected_cash_paisa,
        closed.counted_cash_paisa,
        closed.variance_paisa,
    ) == (100_000, 130_000, 128_000, -2_000)
    assert still_open.closed_at is None
    assert list(Receipt.objects.order_by("sequence").values_list("number", flat=True)) == [
        "NGC-000001",
        "NGC-000002",
        "NGC-000003",
        "NGC-000004",
    ]
    north_gate = Organisation.objects.get(name="North Gate Parking")
    visits = billing.sessions_with_settlement(north_gate)
    assert Counter(billing.stage_of(visit) for visit in visits) == {
        SessionStage.EXITED: 3,
        SessionStage.EXIT_READY: 1,
        SessionStage.CHECKOUT_PENDING: 1,
        SessionStage.PARKED: 3,
    }


def test_seed_requires_a_demo_password(monkeypatch):
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)

    with pytest.raises(CommandError):
        call_command("seed_demo", stdout=StringIO())
