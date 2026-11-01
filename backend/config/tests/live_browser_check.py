"""Opt-in: pnpm test:live. Excluded from normal pytest discovery by the filename."""

import os
import secrets
import shutil
import subprocess
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command

from modules.accounts.models import Customer, OrgMember, User
from modules.billing.models import PaymentEntry, PrintEvent, Shift
from modules.parking.models import MemberPass, ParkingSession, Reservation
from modules.sites import services as sites
from modules.sites.models import Location, VehicleClass

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.django_db(transaction=True)
def test_real_browser_journeys(settings, live_server, monkeypatch):
    """Use a separate PostgreSQL database, real sessions/CSRF and the built React UI."""
    assert (ROOT / "apps/web/dist/index.html").is_file(), "Run pnpm build first."
    node = shutil.which("node")
    assert node, "Install Node 24+ before running browser checks."
    settings.ROOT_URLCONF = "config.tests.browser_urls"
    settings.CSRF_TRUSTED_ORIGINS = [live_server.url]
    settings.APP_ORIGIN = live_server.url
    settings.SESSION_COOKIE_SECURE = settings.CSRF_COOKIE_SECURE = False
    password = f"Live-browser-{secrets.token_urlsafe(18)}"
    monkeypatch.setenv("DEMO_PASSWORD", password)
    call_command("seed_demo", stdout=StringIO())
    location = Location.objects.get(receipt_prefix="NGC")
    owner = OrgMember.objects.get(user__email="owner@northgate.test")
    # No five-minute sleep: a test-only tariff makes a one-second walk-in billable.
    sites.publish_tariff(
        location=location,
        actor=owner.user,
        vehicle_class=VehicleClass.CAR,
        grace_seconds=0,
        block_seconds=1800,
        block_paisa=5000,
        daily_cap_paisa=None,
        tax_bps=0,
        correlation_id="live-browser-fixture",
    )
    result = subprocess.run(
        [
            node,
            "node_modules/@playwright/test/cli.js",
            "test",
            "--config",
            "playwright.live.config.ts",
        ],
        cwd=ROOT / "apps/web",
        env={**os.environ, "BAYLINE_E2E_ORIGIN": live_server.url, "BAYLINE_E2E_PASSWORD": password},
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    print(result.stdout)

    # Reload from PostgreSQL: browser assertions alone could miss duplicate or lost ledger writes.
    visit = ParkingSession.objects.get(vehicle__normalized_plate="BA11PA1111")
    assert visit.exited_at is not None
    assert list(
        PaymentEntry.objects.filter(invoice__session=visit).values_list("amount_paisa", flat=True)
    ) == [5000]
    assert PrintEvent.objects.filter(receipt__invoice__session=visit).count() == 2
    passes = MemberPass.objects.filter(permitted_vehicles__vehicle__normalized_plate="BA20PA2002")
    assert list(passes.order_by("price_paisa").values_list("price_paisa", "status")) == [
        (100050, "ACTIVE"),
        (120000, "ACTIVE"),
    ]
    assert PaymentEntry.objects.filter(invoice__member_pass__in=passes).count() == 2
    closed = Shift.objects.get(operator=owner.user, closed_at__isnull=False)
    assert (closed.expected_cash_paisa, closed.counted_cash_paisa, closed.variance_paisa) == (
        320050,
        320050,
        0,
    )
    assert closed.closed_at is not None
    assert Reservation.objects.get(vehicle__normalized_plate="BA30PA3003").status == "CANCELLED"
    walk_up = Customer.objects.get(name="Walk-up browser member")
    assert (walk_up.user_id, walk_up.email, walk_up.phone) == (None, "", "")
    assert not User.objects.filter(name=walk_up.name).exists()
    member_pass = MemberPass.objects.get(customer=walk_up)
    assert (member_pass.price_paisa, member_pass.status) == (50000, "ACTIVE")
    assert list(
        PaymentEntry.objects.filter(invoice__member_pass=member_pass).values_list(
            "amount_paisa", flat=True
        )
    ) == [50000]
