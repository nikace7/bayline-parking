"""Synthetic demo data built through domain services (blueprint section 8).

Lives in `config` because it spans modules. Each milestone extends it as its services land;
M1 seeds staff, locations, bays and tariffs.
"""

import os
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.accounts import services as accounts
from modules.accounts.models import Role, User
from modules.sites import services as sites
from modules.sites.models import BayMode, VehicleClass

CORRELATION_ID = "seed-demo"
MARKER_EMAIL = "owner@northgate.test"

ORGANISATIONS = [
    {
        "name": "North Gate Parking",
        "domain": "northgate.test",
        "staff": [Role.MANAGER, Role.OPERATOR, Role.CASHIER, Role.AUDITOR],
        "locations": [
            ("North Gate Central", "Durbar Marg, Kathmandu", "27.712000", "85.317800", "NGC"),
            ("North Gate Lalitpur", "Pulchowk, Lalitpur", "27.678000", "85.316000", "NGL"),
        ],
    },
    {
        "name": "Riverside Parking",
        "domain": "riverside.test",
        "staff": [],
        "locations": [
            ("Riverside Bhaktapur", "Suryabinayak, Bhaktapur", "27.667000", "85.428000", "RVB"),
        ],
    },
]

# Per location: 12 walk-in bays (8 car, 4 motorbike) and 6 reservable car bays.
BAYS = [
    *[(f"A{n:02}", VehicleClass.CAR, BayMode.WALK_IN) for n in range(1, 9)],
    *[(f"M{n:02}", VehicleClass.MOTORBIKE, BayMode.WALK_IN) for n in range(1, 5)],
    *[(f"R{n:02}", VehicleClass.CAR, BayMode.RESERVABLE) for n in range(1, 7)],
]

# Blueprint demo pricing: five free minutes, then paisa per started 30-minute block; no cap or tax.
TARIFFS = {VehicleClass.CAR: 5_000, VehicleClass.MOTORBIKE: 2_000}


class Command(BaseCommand):
    help = "Seed synthetic North Gate and Riverside demo data. Rerunning changes nothing."

    def handle(self, *args, **options):
        password = os.environ.get("DEMO_PASSWORD", "")
        if len(password) < 12:
            raise CommandError(
                "Set DEMO_PASSWORD (12+ characters) in .env; `pnpm setup:local` adds one."
            )
        if User.objects.filter(email=MARKER_EMAIL).exists():
            self.stdout.write("Demo data already present; nothing changed.")
            return
        with transaction.atomic():
            for spec in ORGANISATIONS:
                self._seed_organisation(spec, password)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded demo data. Sign in as {MARKER_EMAIL} with DEMO_PASSWORD from .env."
            )
        )

    def _seed_organisation(self, spec, password):
        domain = spec["domain"]
        owner = accounts.register_owner(
            organisation_name=spec["name"],
            name="Demo Owner",
            email=f"owner@{domain}",
            password=password,
            correlation_id=CORRELATION_ID,
        )
        organisation, actor = owner.organisation, owner.user
        for role in spec["staff"]:
            accounts.add_member(
                organisation=organisation,
                actor=actor,
                email=f"{role.lower()}@{domain}",
                name=f"Demo {role.title()}",
                password=password,
                roles=[role],
                correlation_id=CORRELATION_ID,
            )
        for name, address, latitude, longitude, prefix in spec["locations"]:
            location = sites.create_location(
                organisation=organisation,
                actor=actor,
                name=name,
                address=address,
                latitude=Decimal(latitude),
                longitude=Decimal(longitude),
                receipt_prefix=prefix,
                correlation_id=CORRELATION_ID,
            )
            for label, vehicle_class, mode in BAYS:
                sites.create_bay(
                    location=location,
                    actor=actor,
                    label=label,
                    vehicle_class=vehicle_class,
                    mode=mode,
                    correlation_id=CORRELATION_ID,
                )
            for vehicle_class, block_paisa in TARIFFS.items():
                sites.publish_tariff(
                    location=location,
                    actor=actor,
                    vehicle_class=vehicle_class,
                    grace_seconds=300,
                    block_seconds=1800,
                    block_paisa=block_paisa,
                    daily_cap_paisa=None,
                    tax_bps=0,
                    correlation_id=CORRELATION_ID,
                )
