import uuid

from django.db import models
from django.db.models import F, Q

from config import clock
from modules.accounts.models import Organisation, OrgScopedQuerySet, User
from modules.parking.models import MemberPass, ParkingSession
from modules.sites.models import Location, TariffVersion


class ShiftStatus(models.TextChoices):
    """Derived from `closed_at`; never stored."""

    OPEN = "OPEN"
    CLOSED = "CLOSED"


class Shift(models.Model):
    """Cash accountability. Closing stores the counted, expected and variance summary; the row is
    immutable from then on (database trigger)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    operator = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    opening_float_paisa = models.PositiveIntegerField()
    opened_at = models.DateTimeField()
    closed_at = models.DateTimeField(null=True)
    closed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, related_name="+")
    counted_cash_paisa = models.PositiveIntegerField(null=True)
    expected_cash_paisa = models.IntegerField(null=True)
    variance_paisa = models.IntegerField(null=True)
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
            # Every column is tested for NULL explicitly: a CHECK that evaluates to NULL passes.
            models.CheckConstraint(
                condition=Q(
                    closed_at__isnull=True,
                    closed_by__isnull=True,
                    counted_cash_paisa__isnull=True,
                    expected_cash_paisa__isnull=True,
                    variance_paisa__isnull=True,
                )
                | Q(
                    closed_at__isnull=False,
                    closed_at__gte=F("opened_at"),
                    closed_by__isnull=False,
                    counted_cash_paisa__isnull=False,
                    expected_cash_paisa__isnull=False,
                    variance_paisa__isnull=False,
                    variance_paisa=F("counted_cash_paisa") - F("expected_cash_paisa"),
                ),
                name="shift_close_summary_complete",
            ),
        ]


class InvoiceStatus(models.TextChoices):
    CONFIRMED = "CONFIRMED"


class InvoicePurpose(models.TextChoices):
    """A parking visit or the sale of a member pass; the two never mix on one invoice."""

    PARKING = "PARKING"
    MEMBERSHIP = "MEMBERSHIP"


class CheckoutInvoice(models.Model):
    """Fee snapshot at a frozen cutoff; never edited. The paid amount is derived from the ledger."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    purpose = models.CharField(
        max_length=16, choices=InvoicePurpose.choices, default=InvoicePurpose.PARKING
    )
    # A PARKING invoice prices exactly one visit; a MEMBERSHIP invoice sells exactly one pass.
    session = models.ForeignKey(
        ParkingSession, null=True, on_delete=models.PROTECT, related_name="+"
    )
    tariff = models.ForeignKey(TariffVersion, null=True, on_delete=models.PROTECT, related_name="+")
    member_pass = models.ForeignKey(
        MemberPass, null=True, on_delete=models.PROTECT, related_name="invoices"
    )
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
            models.UniqueConstraint(
                fields=["member_pass"],
                condition=Q(status=InvoiceStatus.CONFIRMED),
                name="invoice_one_confirmed_per_pass",
            ),
            models.CheckConstraint(
                condition=Q(discount_paisa__lte=F("base_paisa"))
                & Q(total_paisa=F("base_paisa") - F("discount_paisa") + F("tax_paisa")),
                name="invoice_totals_add_up",
            ),
            # A PARKING invoice prices one visit and a MEMBERSHIP invoice sells one pass; the
            # database refuses every other combination (blueprint section 4).
            models.CheckConstraint(
                condition=Q(
                    purpose=InvoicePurpose.PARKING,
                    session__isnull=False,
                    tariff__isnull=False,
                    member_pass__isnull=True,
                )
                | Q(
                    purpose=InvoicePurpose.MEMBERSHIP,
                    session__isnull=True,
                    tariff__isnull=True,
                    member_pass__isnull=False,
                ),
                name="invoice_purpose_references_match",
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


class Receipt(models.Model):
    """Immutable (database trigger). One per capture, numbered from the location's counter inside
    the capture transaction, so a rolled-back capture never uses up a number."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    invoice = models.ForeignKey(CheckoutInvoice, on_delete=models.PROTECT, related_name="receipts")
    payment = models.OneToOneField(PaymentEntry, on_delete=models.PROTECT, related_name="receipt")
    sequence = models.PositiveIntegerField()
    number = models.CharField(max_length=24)
    issued_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    issued_at = models.DateTimeField()

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["location", "sequence"], name="receipt_sequence_unique"
            ),
            models.UniqueConstraint(
                fields=["id", "organisation"], name="receipt_id_organisation_unique"
            ),
        ]


class PrinterPath(models.TextChoices):
    BROWSER = "BROWSER"
    ANDROID_POS = "ANDROID_POS"


class PrintEvent(models.Model):
    """A requested print, not proof that paper came out (blueprint section 6). Append-only; copy 1
    is the original and later copies reprint the same receipt number."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(Organisation, on_delete=models.PROTECT, related_name="+")
    receipt = models.ForeignKey(Receipt, on_delete=models.PROTECT, related_name="print_events")
    copy_number = models.PositiveIntegerField()
    printer_path = models.CharField(max_length=16, choices=PrinterPath.choices)
    requested_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(default=clock.now, editable=False)

    objects = OrgScopedQuerySet.as_manager()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["receipt", "copy_number"], name="print_copy_unique"),
            models.CheckConstraint(
                condition=Q(copy_number__gte=1, printer_path__in=PrinterPath.values),
                name="print_event_valid",
            ),
        ]


class SessionStage(models.TextChoices):
    """A visit's gate stage, derived from its invoice and the ledger at read time; never stored."""

    PARKED = "PARKED"
    CHECKOUT_PENDING = "CHECKOUT_PENDING"
    EXIT_READY = "EXIT_READY"
    EXITED = "EXITED"
