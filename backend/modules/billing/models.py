import uuid

from django.db import models
from django.db.models import F, Q

from config import clock
from modules.accounts.models import Organisation, OrgScopedQuerySet, User
from modules.parking.models import ParkingSession
from modules.sites.models import Location, TariffVersion


class Shift(models.Model):
    """Cash accountability. M2 opens shifts; closing, counted cash and variance arrive in M3."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    operator = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    opening_float_paisa = models.PositiveIntegerField()
    opened_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True)
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "operator"],
                condition=Q(closed_at__isnull=True),
                name="shift_one_open_per_operator",
            ),
            models.UniqueConstraint(
                fields=["id", "organisation"], name="shift_id_organisation_unique"
            ),
        ]


class InvoiceStatus(models.TextChoices):
    CONFIRMED = "CONFIRMED"


class CheckoutInvoice(models.Model):
    """Fee snapshot at a frozen cutoff; never edited. The paid amount is derived from the ledger."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    session = models.ForeignKey(ParkingSession, on_delete=models.PROTECT, related_name="+")
    tariff = models.ForeignKey(TariffVersion, on_delete=models.PROTECT, related_name="+")
    cutoff_at = models.DateTimeField()
    billable_seconds = models.PositiveIntegerField()
    blocks = models.PositiveIntegerField()
    base_paisa = models.PositiveIntegerField()
    discount_paisa = models.PositiveIntegerField()
    tax_paisa = models.PositiveIntegerField()
    total_paisa = models.PositiveIntegerField()
    status = models.CharField(
        max_length=16, choices=InvoiceStatus.choices, default=InvoiceStatus.CONFIRMED
    )
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["session"],
                condition=Q(status=InvoiceStatus.CONFIRMED),
                name="invoice_one_confirmed_per_session",
            ),
            models.UniqueConstraint(
                fields=["id", "organisation"], name="invoice_id_organisation_unique"
            ),
            models.CheckConstraint(
                condition=Q(discount_paisa__lte=F("base_paisa"))
                & Q(total_paisa=F("base_paisa") - F("discount_paisa") + F("tax_paisa")),
                name="invoice_totals_add_up",
            ),
        ]


class EntryKind(models.TextChoices):
    CAPTURE = "CAPTURE"


class PaymentMethod(models.TextChoices):
    CASH = "CASH"


class PaymentEntry(models.Model):
    """Append-only ledger row (database trigger). Corrections are new rows, never edits."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    invoice = models.ForeignKey(CheckoutInvoice, on_delete=models.PROTECT, related_name="entries")
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, null=True, related_name="+")
    kind = models.CharField(max_length=16, choices=EntryKind.choices)
    method = models.CharField(max_length=16, choices=PaymentMethod.choices)
    amount_paisa = models.IntegerField()
    received_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(kind=EntryKind.CAPTURE, amount_paisa__gt=0),
                name="entry_capture_positive",
            ),
            models.CheckConstraint(
                condition=Q(method=PaymentMethod.CASH, shift__isnull=False)
                | (~Q(method=PaymentMethod.CASH) & Q(shift__isnull=True)),
                name="entry_shift_exactly_for_cash",
            ),
        ]


class SessionStage(models.TextChoices):
    """A visit's gate stage, derived from its invoice and the ledger at read time; never stored."""

    PARKED = "PARKED"
    CHECKOUT_PENDING = "CHECKOUT_PENDING"
    EXIT_READY = "EXIT_READY"
    EXITED = "EXITED"
