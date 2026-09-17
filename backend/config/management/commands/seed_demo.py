"""Synthetic demo data built through domain services (blueprint section 8).

Lives in `config` because it spans modules. Each milestone extends it as its services land:
M1 seeds staff, locations, bays and tariffs; M2 assigns gate staff to locations; M3 adds a cash day
at North Gate Central with a closed and an open shift; M4 adds customers and reservations; M5 adds
member passes.
"""

import os
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from config import clock
from modules.accounts import services as accounts
from modules.accounts.models import OrgMember, Role, User
from modules.billing import memberships
from modules.billing import services as billing
from modules.billing.models import CheckoutInvoice, Shift
from modules.parking import reservations
from modules.parking import services as parking
from modules.parking.models import MemberPass
from modules.sites import services as sites
from modules.sites.models import Bay, BayMode, Location, LocationAssignment, VehicleClass

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

# Blueprint cash fixture: NPR 1,000 float + NPR 300 taken = NPR 1,300 expected; NPR 1,280 counted is
# a variance of −NPR 20. Its NPR 50 refund waits for refunds (M6), so captures total 300, not 350.
OPENING_FLOAT_PAISA = 100_000
COUNTED_CASH_PAISA = 128_000
# The cash day starts this long before the seed runs, so visits carry fees and none is in future.
CASH_DAY_OFFSET = timedelta(hours=4)
MONTHLY_PASS_PAISA = 500_000


class Command(BaseCommand):
    help = "Seed synthetic North Gate and Riverside demo data. Rerunning changes nothing."

    def handle(self, *args, **options):
        password = os.environ.get("DEMO_PASSWORD", "")
        if len(password) < 12:
            raise CommandError(
                "Set DEMO_PASSWORD (12+ characters) in .env; `pnpm setup:local` adds one."
            )
        if User.objects.filter(email=MARKER_EMAIL).exists():
            self.stdout.write("Demo organisations already present.")
        else:
            with transaction.atomic():
                for spec in ORGANISATIONS:
                    self._seed_organisation(spec, password)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Seeded demo data. Sign in as {MARKER_EMAIL} with DEMO_PASSWORD from .env."
                )
            )
        if assigned := self._assign_gate_staff():
            self.stdout.write(f"Added {assigned} gate staff location assignment(s).")
        if self._seed_cash_day():
            self.stdout.write(
                "Added a North Gate Central cash day: 8 visits, 2 shifts, 4 receipts."
            )
        if self._seed_reservations(password):
            self.stdout.write(
                "Added 2 customer accounts and 3 reservations, one waiting on an overstay."
            )
        if self._seed_passes():
            self.stdout.write("Added 2 member passes: one settled and one awaiting payment.")

    @transaction.atomic
    def _seed_reservations(self, password) -> bool:
        """Two customers' bookings at North Gate Central on the fixture clock: a vehicle still
        parked after its reservation ended, the next booking for that bay flagged as a conflict to
        relocate, and a missed arrival swept to no-show. Runs once, also on databases seeded
        before M4."""
        if User.objects.filter(email="asha@customer.test").exists():
            return False
        staff = OrgMember.objects.select_related("organisation", "user")
        operator = staff.filter(user__email="operator@northgate.test").first()
        if operator is None:
            return False
        location = Location.objects.for_org(operator.organisation).get(receipt_prefix="NGC")
        asha, bina = (
            accounts.register_customer(name=name, email=email, password=password)
            for name, email in (("Asha", "asha@customer.test"), ("Bina", "bina@customer.test"))
        )
        now = clock.now().replace(second=0, microsecond=0)
        tag = {"correlation_id": CORRELATION_ID}

        def book(user, plate, starts_at):
            with clock.frozen(now - timedelta(minutes=150)):
                held = reservations.hold_reservation(
                    user=user,
                    location_id=location.pk,
                    vehicle_class=VehicleClass.CAR,
                    plate=plate,
                    starts_at=starts_at,
                    ends_at=starts_at + timedelta(hours=1),
                    **tag,
                )
                return reservations.confirm_reservation(user=user, reservation_id=held.pk, **tag)

        # Bays go to the first free one, so Asha and Bina's upcoming booking share a bay.
        overstaying = book(asha, "BA 8 PA 8008", now - timedelta(minutes=90))
        book(bina, "बा ९ च ९००९", now - timedelta(minutes=120))  # never arrives
        book(bina, "बा ९ च ९००९", now + timedelta(minutes=20))
        with clock.frozen(overstaying.arrival_opens_at + timedelta(minutes=5)):
            parking.admit_vehicle(
                member=operator,
                actor=operator.user,
                location_id=location.pk,
                bay_id=overstaying.bay_id,
                plate="BA 8 PA 8008",
                vehicle_class=VehicleClass.CAR,
                reservation_id=overstaying.pk,
                **tag,
            )
        reservations.sweep_elapsed(now)
        return True

    def _assign_gate_staff(self) -> int:
        """Operators and cashiers act only at assigned locations. Idempotent, so databases seeded
        before M2 gain the assignments too. Only synthetic `.test` accounts are touched."""
        created = 0
        gate_staff = OrgMember.objects.select_related("organisation").filter(
            roles__overlap=[Role.OPERATOR, Role.CASHIER], user__email__endswith=".test"
        )
        for member in gate_staff:
            for location in Location.objects.for_org(member.organisation):
                if LocationAssignment.objects.filter(location=location, member=member).exists():
                    continue
                sites.assign_member(
                    location=location, member=member, actor=None, correlation_id=CORRELATION_ID
                )
                created += 1
        return created

    @transaction.atomic
    def _seed_cash_day(self) -> bool:
        """A North Gate Central day run through the gate and cash services on the fixture clock:
        three paid visits on a shift closed NPR 20 short, then an open shift with one visit ready to
        exit, one awaiting cash and three parked. Runs once, also on databases seeded before M3."""
        staff = OrgMember.objects.select_related("organisation", "user")
        cashier = staff.filter(user__email="cashier@northgate.test").first()
        if cashier is None or Shift.objects.filter(operator=cashier.user).exists():
            return False
        operator = staff.get(user__email="operator@northgate.test")
        location = Location.objects.for_org(cashier.organisation).get(receipt_prefix="NGC")
        start = clock.now().replace(second=0, microsecond=0) - CASH_DAY_OFFSET
        tag = {"correlation_id": CORRELATION_ID}

        def at(minutes):
            return clock.frozen(start + timedelta(minutes=minutes))

        def admit(minutes, label, plate, vehicle_class=VehicleClass.CAR):
            bay = Bay.objects.get(location=location, label=label)
            with at(minutes):
                return parking.admit_vehicle(
                    member=operator,
                    actor=operator.user,
                    location_id=location.pk,
                    bay_id=bay.pk,
                    plate=plate,
                    vehicle_class=vehicle_class,
                    **tag,
                )

        def check_out(minutes, visit):
            with at(minutes):
                quote = billing.quote_checkout(member=cashier, session_id=visit.pk)
                return billing.confirm_checkout(
                    member=cashier,
                    actor=cashier.user,
                    session_id=visit.pk,
                    quote_token=quote.token,
                    **tag,
                )

        def take_cash(minutes, visit):
            invoice = check_out(minutes, visit)
            with at(minutes):
                billing.capture_cash(
                    member=cashier,
                    actor=cashier.user,
                    invoice_id=invoice.pk,
                    amount_paisa=invoice.total_paisa,
                    **tag,
                )

        def leave(minutes, visit):
            with at(minutes):
                billing.exit_vehicle(
                    member=operator, actor=operator.user, session_id=visit.pk, **tag
                )

        def open_shift(minutes):
            with at(minutes):
                return billing.open_shift(
                    member=cashier,
                    actor=cashier.user,
                    location_id=location.pk,
                    opening_float_paisa=OPENING_FLOAT_PAISA,
                    **tag,
                )

        # Car fee: five free minutes, then NPR 50 per started 30 minutes.
        shift = open_shift(0)
        a01 = admit(10, "A01", "BA 1 PA 1001")
        a02 = admit(20, "A02", "बा २ प ४५६७")
        a03 = admit(40, "A03", "BA 3 PA 3003")
        a04 = admit(60, "A04", "BA 4 PA 4004")
        take_cash(75, a01)  # 65 minutes: NPR 100
        take_cash(75, a03)  # 35 minutes: NPR 50
        leave(78, a01)
        leave(78, a03)
        take_cash(115, a02)  # 95 minutes: NPR 150
        leave(118, a02)
        m01 = admit(120, "M01", "BA 5 PA 5005", VehicleClass.MOTORBIKE)
        with at(150):
            billing.close_shift(
                member=cashier,
                actor=cashier.user,
                shift_id=shift.pk,
                counted_cash_paisa=COUNTED_CASH_PAISA,
                **tag,
            )
        open_shift(155)
        take_cash(160, a04)  # 100 minutes: NPR 200, ready to exit
        check_out(170, m01)  # 50 minutes: NPR 40 for a motorbike, awaiting cash
        admit(180, "A05", "BA 6 PA 6006")
        admit(190, "M02", "BA 7 PA 7007", VehicleClass.MOTORBIKE)
        admit(200, "A06", "बा ८ च ८००८")
        return True

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
                    # All demo tariffs start a day early so the backdated cash day finds one.
                    effective_from=clock.now() - timedelta(days=1),
                )

    @transaction.atomic
    def _seed_passes(self) -> bool:
        """One settled monthly pass for Asha covering both North Gate locations, and one still
        awaiting payment for Bina. The settled sale is taken on the cashier's open shift, so it
        appears in the day's cash. Runs once, also on databases seeded before M5."""
        if MemberPass.objects.exists():
            return False
        staff = OrgMember.objects.select_related("organisation", "user")
        owner = staff.filter(user__email=MARKER_EMAIL).first()
        cashier = staff.filter(user__email="cashier@northgate.test").first()
        if owner is None or cashier is None:
            return False
        if not User.objects.filter(email="asha@customer.test").exists():
            return False
        locations = list(Location.objects.for_org(owner.organisation).order_by("receipt_prefix"))
        central = next(location for location in locations if location.receipt_prefix == "NGC")
        now = clock.now().replace(second=0, microsecond=0)

        def sell(email, plate):
            return memberships.sell_pass(
                member=owner,
                actor=owner.user,
                email=email,
                location_id=central.pk,
                permitted_location_ids=[location.pk for location in locations],
                vehicles=[{"plate": plate, "vehicle_class": VehicleClass.CAR}],
                starts_at=now - timedelta(days=5),
                ends_at=now + timedelta(days=25),
                price_paisa=MONTHLY_PASS_PAISA,
                max_vehicles=1,
                correlation_id=CORRELATION_ID,
            )

        settled = sell("asha@customer.test", "BA 7 PA 7007")
        invoice = CheckoutInvoice.objects.get(member_pass=settled)
        billing.capture_cash(
            member=cashier,
            actor=cashier.user,
            invoice_id=invoice.pk,
            amount_paisa=invoice.total_paisa,
            correlation_id=CORRELATION_ID,
        )
        sell("bina@customer.test", "बा ९ च ९००९")
        return True
