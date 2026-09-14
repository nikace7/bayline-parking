from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from modules.accounts.models import Organisation, OrgMember
from modules.sites.models import Bay, BayMode, Location, TariffVersion

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


def test_seed_requires_a_demo_password(monkeypatch):
    monkeypatch.delenv("DEMO_PASSWORD", raising=False)

    with pytest.raises(CommandError):
        call_command("seed_demo", stdout=StringIO())
