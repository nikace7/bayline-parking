"""Shifts, checkout, cash settlement, receipts and exit (blueprint sections 4 and 5).

Global lock order: member pass -> capacity pool -> bays -> parking session -> invoice
-> shift -> receipt counter. Writers take their subset in that order to avoid lock cycles.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.core import signing
from django.db import models, transaction
from django.db.models import Count, OuterRef, Q, QuerySet, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework.exceptions import NotFound

from config import clock
from config.api import ApiError
from config.transactions import conflict_on
from modules.accounts.models import Role
from modules.accounts.services import record_audit
from modules.billing.models import (
    CheckoutInvoice,
    EntryKind,
    InvoiceStatus,
    PaymentEntry,
    PaymentMethod,
    PrintEvent,
    Receipt,
    SessionStage,
    Shift,
)
from modules.parking import services as parking
from modules.parking.models import MemberPass, ParkingSession, PassStatus, SessionStatus
from modules.sites.models import Location
from modules.sites.services import ensure_can_operate, next_receipt_sequence
from modules.sites.tariff import Fee, calculate_fee

QUOTE_SALT = "bayline.billing.quote"
QUOTE_LIFETIME = timedelta(seconds=120)
CHECKOUT_EXISTS = ("CHECKOUT_EXISTS", "This visit already has a confirmed invoice.")
# Roles that read every shift in the organisation; cash staff read their own.
OVERSIGHT_ROLES = frozenset({Role.OWNER, Role.MANAGER, Role.AUDITOR})


@dataclass(frozen=True)
class Quote:
    token: str
    cutoff_at: datetime
    expires_at: datetime
    fee: Fee


@dataclass(frozen=True)
class ShiftSummary:
    shift: Shift
    capture_count: int
    cash_captured_paisa: int
    expected_cash_paisa: int


@transaction.atomic
def open_shift(*, member, actor, location_id, opening_float_paisa, correlation_id) -> Shift:
    location = (
        Location.objects.for_org(member.organisation).filter(pk=location_id, enabled=True).first()
    )
    if location is None:
        raise NotFound()
    ensure_can_operate(member, location)
    with conflict_on(
        {"shift_one_open_per_operator": ("SHIFT_ALREADY_OPEN", "You already have an open shift.")}
    ):
        shift = Shift.objects.create(
            organisation=member.organisation,
            location=location,
            operator=actor,
            opening_float_paisa=opening_float_paisa,
            opened_at=clock.now(),
        )
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="shift.opened",
        entity=shift,
        summary={"location_id": str(location.pk), "opening_float_paisa": opening_float_paisa},
        correlation_id=correlation_id,
    )
    return shift


def open_shift_for(organisation, user) -> Shift | None:
    return (
        Shift.objects.for_org(organisation)
        .select_related("location", "operator")
        .filter(operator=user, closed_at__isnull=True)
        .first()
    )


def shifts_visible_to(member) -> QuerySet[Shift]:
    shifts = Shift.objects.for_org(member.organisation).select_related("location", "operator")
    if OVERSIGHT_ROLES.isdisjoint(member.roles):
        shifts = shifts.filter(operator_id=member.user_id)
    return shifts


def shift_summary(*, member, shift_id) -> ShiftSummary:
    shift = shifts_visible_to(member).filter(pk=shift_id).first()
    if shift is None:
        raise NotFound()
    return _summarise(shift)


def _summarise(shift: Shift) -> ShiftSummary:
    """Expected cash is the opening float plus every cash movement on the shift. Refunds (M6) will
    be negative entries, so the same sum stays correct."""
    cash = PaymentEntry.objects.filter(shift=shift, method=PaymentMethod.CASH).aggregate(
        capture_count=Count("pk", filter=Q(kind=EntryKind.CAPTURE)),
        captured=Coalesce(Sum("amount_paisa", filter=Q(kind=EntryKind.CAPTURE)), 0),
        moved=Coalesce(Sum("amount_paisa"), 0),
    )
    expected = shift.opening_float_paisa + cash["moved"]
    return ShiftSummary(
        shift=shift,
        capture_count=cash["capture_count"],
        cash_captured_paisa=cash["captured"],
        # A closed shift reports the summary it stored when it closed.
        expected_cash_paisa=expected if shift.closed_at is None else shift.expected_cash_paisa,
    )


@transaction.atomic
def close_shift(*, member, actor, shift_id, counted_cash_paisa, correlation_id) -> ShiftSummary:
    """Takes the shift lock that cash capture takes after the invoice lock, so a capture either
    commits first and is counted, or waits and then finds the shift closed (P15)."""
    shift = (
        Shift.objects.for_org(member.organisation)
        .select_related("location", "operator")
        .select_for_update(of=("self",))
        .filter(pk=shift_id)
        .first()
    )
    if shift is None:
        raise NotFound()
    if shift.operator_id != actor.pk:
        raise ApiError(403, "SHIFT_NOT_YOURS", "Only the person who opened a shift can close it.")
    if shift.closed_at is not None:
        raise ApiError(409, "SHIFT_CLOSED", "This shift is already closed.")
    ensure_can_operate(member, shift.location)
    expected = _summarise(shift).expected_cash_paisa
    shift.closed_at = clock.now()
    shift.closed_by = actor
    shift.counted_cash_paisa = counted_cash_paisa
    shift.expected_cash_paisa = expected
    shift.variance_paisa = counted_cash_paisa - expected
    shift.save(
        update_fields=[
            "closed_at",
            "closed_by",
            "counted_cash_paisa",
            "expected_cash_paisa",
            "variance_paisa",
        ]
    )
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="shift.closed",
        entity=shift,
        summary={
            "expected_cash_paisa": expected,
            "counted_cash_paisa": counted_cash_paisa,
            "variance_paisa": shift.variance_paisa,
        },
        correlation_id=correlation_id,
    )
    return _summarise(shift)


def quote_checkout(*, member, session_id) -> Quote:
    """Prices the visit at server time. The signed token carries the cutoff so confirming it
    within two minutes charges exactly this amount; no quote table is needed."""
    session = (
        ParkingSession.objects.for_org(member.organisation)
        .select_related("location", "tariff")
        .filter(pk=session_id)
        .first()
    )
    if session is None:
        raise NotFound()
    ensure_can_operate(member, session.location)
    _ensure_checkout_open(session)
    cutoff = clock.now()
    fee = calculate_fee(
        session.tariff,
        entry=session.entered_at,
        cutoff=cutoff,
        covered_seconds=session.covered_seconds,
    )
    token = signing.dumps(
        {"session": str(session.pk), "cutoff": cutoff.isoformat(), "total": fee.total_paisa},
        salt=QUOTE_SALT,
    )
    return Quote(token=token, cutoff_at=cutoff, expires_at=cutoff + QUOTE_LIFETIME, fee=fee)


@transaction.atomic
def confirm_checkout(*, member, actor, session_id, quote_token, correlation_id) -> CheckoutInvoice:
    session = parking.lock_session(member.organisation, session_id)
    ensure_can_operate(member, session.location)
    _ensure_checkout_open(session)
    cutoff, quoted_total = _read_quote(quote_token, session)
    # Recalculated from the pinned tariff and pass coverage: the browser never supplies an amount.
    fee = calculate_fee(
        session.tariff,
        entry=session.entered_at,
        cutoff=cutoff,
        covered_seconds=session.covered_seconds,
    )
    if fee.total_paisa != quoted_total:
        raise ApiError(409, "QUOTE_INVALID", "This quote no longer matches the visit.")
    with conflict_on({"invoice_one_confirmed_per_session": CHECKOUT_EXISTS}):
        invoice = CheckoutInvoice.objects.create(
            organisation_id=session.organisation_id,
            location_id=session.location_id,
            session=session,
            tariff_id=session.tariff_id,
            cutoff_at=cutoff,
            billable_seconds=fee.billable_seconds,
            blocks=fee.blocks,
            base_paisa=fee.base_paisa,
            discount_paisa=fee.discount_paisa,
            tax_paisa=fee.tax_paisa,
            total_paisa=fee.total_paisa,
            created_by=actor,
        )
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="checkout.confirmed",
        entity=invoice,
        summary={"session_id": str(session.pk), "total_paisa": fee.total_paisa},
        correlation_id=correlation_id,
    )
    return invoice


def _ensure_checkout_open(session: ParkingSession) -> None:
    if session.status != SessionStatus.PARKED:
        raise ApiError(409, "SESSION_NOT_PARKED", "This vehicle has already exited.")
    if CheckoutInvoice.objects.filter(session=session, status=InvoiceStatus.CONFIRMED).exists():
        raise ApiError(409, *CHECKOUT_EXISTS)


def _read_quote(token: str, session: ParkingSession) -> tuple[datetime, int]:
    invalid = ApiError(
        409, "QUOTE_INVALID", "This quote is not valid for this visit. Request a new one."
    )
    try:
        claims = signing.loads(token, salt=QUOTE_SALT)
    except signing.BadSignature as exc:
        raise invalid from exc
    if claims.get("session") != str(session.pk):
        raise invalid
    cutoff = datetime.fromisoformat(claims["cutoff"])
    if clock.now() > cutoff + QUOTE_LIFETIME:
        raise ApiError(
            409, "QUOTE_EXPIRED", "This quote has expired. Request a new one.", retryable=True
        )
    return cutoff, claims["total"]


@transaction.atomic
def capture_cash(*, member, actor, invoice_id, amount_paisa, correlation_id) -> PaymentEntry:
    # Needs neither bay nor session: member pass (membership sales only), then invoice, then
    # shift, then receipt counter.
    sold_pass = _lock_pass_on_sale(member.organisation, invoice_id)
    invoice = (
        CheckoutInvoice.objects.for_org(member.organisation)
        .select_related("location")
        .select_for_update(of=("self",))
        .filter(pk=invoice_id, status=InvoiceStatus.CONFIRMED)
        .first()
    )
    if invoice is None:
        raise NotFound()
    location = invoice.location
    ensure_can_operate(member, location)
    due = invoice.total_paisa - paid_paisa(invoice)
    if due == 0:
        raise ApiError(409, "INVOICE_SETTLED", "This invoice is already paid.")
    if amount_paisa != due:
        raise ApiError(
            409, "AMOUNT_MISMATCH", f"The amount due is {due} paisa. Refresh and try again."
        )
    # A shift closing concurrently holds this row lock; once it commits, the row no longer matches
    # `closed_at IS NULL` and the capture is refused rather than landing on a closed shift.
    shift = (
        Shift.objects.for_org(member.organisation)
        .select_for_update()
        .filter(operator=actor, closed_at__isnull=True)
        .first()
    )
    if shift is None:
        raise ApiError(409, "SHIFT_NOT_OPEN", "Open a cash shift before taking cash.")
    if shift.location_id != location.pk:
        raise ApiError(409, "SHIFT_LOCATION_MISMATCH", "Your open shift is at another location.")
    entry = PaymentEntry.objects.create(
        organisation_id=invoice.organisation_id,
        invoice=invoice,
        shift=shift,
        kind=EntryKind.CAPTURE,
        method=PaymentMethod.CASH,
        amount_paisa=amount_paisa,
        received_by=actor,
    )
    sequence = next_receipt_sequence(location)
    receipt = Receipt.objects.create(
        organisation_id=invoice.organisation_id,
        location=location,
        invoice=invoice,
        payment=entry,
        sequence=sequence,
        number=f"{location.receipt_prefix}-{sequence:06d}",
        issued_by=actor,
        issued_at=entry.created_at,
    )
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="payment.captured",
        entity=entry,
        summary={
            "invoice_id": str(invoice.pk),
            "method": entry.method,
            "amount_paisa": due,
            "receipt_number": receipt.number,
        },
        correlation_id=correlation_id,
    )
    if sold_pass is not None and invoice.total_paisa == paid_paisa(invoice):
        _activate_pass(
            sold_pass,
            member=member,
            actor=actor,
            at=entry.created_at,
            correlation_id=correlation_id,
        )
    return entry


def _lock_pass_on_sale(organisation, invoice_id):
    """The pass a membership invoice sells, locked before the invoice (global lock order). An
    invoice never changes purpose or pass, so reading those two without the lock is safe."""
    pass_id = (
        CheckoutInvoice.objects.for_org(organisation)
        .filter(pk=invoice_id)
        .values_list("member_pass_id", flat=True)
        .first()
    )
    if pass_id is None:
        return None
    return MemberPass.objects.select_for_update().filter(pk=pass_id).first()


def _activate_pass(member_pass, *, member, actor, at, correlation_id) -> None:
    """A sold pass starts entitling visits only once its invoice is settled, never when the
    invoice is created (blueprint section 4)."""
    if member_pass.status != PassStatus.PENDING:
        return
    member_pass.status = PassStatus.ACTIVE
    member_pass.activated_at = at
    member_pass.save(update_fields=["status", "activated_at"])
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="membership.activated",
        entity=member_pass,
        summary={
            "reference": member_pass.reference,
            "starts_at": member_pass.starts_at.isoformat(),
            "ends_at": member_pass.ends_at.isoformat(),
        },
        correlation_id=correlation_id,
    )


def receipt_detail(*, member, receipt_id) -> Receipt:
    receipt = (
        Receipt.objects.for_org(member.organisation)
        .select_related(
            "organisation",
            "location",
            "invoice__session__vehicle",
            "invoice__session__bay",
            "invoice__session__zone",
            "invoice__session__tariff",
            "payment",
            "issued_by",
        )
        .annotate(printed_copies=Count("print_events"))
        .filter(pk=receipt_id)
        .first()
    )
    if receipt is None:
        raise NotFound()
    return receipt


@transaction.atomic
def record_print(*, member, actor, receipt_id, printer_path, correlation_id) -> PrintEvent:
    """Logs a print request under the receipt row lock, so copies number 1, 2, 3 without gaps.
    A reprint never issues a new receipt number (P17)."""
    receipt = (
        Receipt.objects.for_org(member.organisation)
        .select_related("location")
        .select_for_update(of=("self",))
        .filter(pk=receipt_id)
        .first()
    )
    if receipt is None:
        raise NotFound()
    ensure_can_operate(member, receipt.location)
    event = PrintEvent.objects.create(
        organisation_id=receipt.organisation_id,
        receipt=receipt,
        copy_number=PrintEvent.objects.filter(receipt=receipt).count() + 1,
        printer_path=printer_path,
        requested_by=actor,
    )
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="receipt.print_requested",
        entity=event,
        summary={
            "receipt_number": receipt.number,
            "copy_number": event.copy_number,
            "printer_path": printer_path,
        },
        correlation_id=correlation_id,
    )
    return event


@transaction.atomic
def exit_vehicle(*, member, actor, session_id, correlation_id) -> ParkingSession:
    """Physical exit needs a fully paid invoice, checked under the session and invoice locks.
    Settling an invoice never records an exit by itself."""
    # Pool identity is immutable. Acquire it before the session, matching admission/configuration.
    pool_id = (
        ParkingSession.objects.for_org(member.organisation)
        .filter(pk=session_id)
        .values_list("pool_id", flat=True)
        .first()
    )
    if pool_id is not None:
        parking.lock_pool(member.organisation, pool_id)
    session = parking.lock_session(member.organisation, session_id)
    ensure_can_operate(member, session.location)
    if session.status != SessionStatus.PARKED:
        raise ApiError(409, "SESSION_NOT_PARKED", "This vehicle has already exited.")
    invoice = (
        CheckoutInvoice.objects.select_for_update()
        .filter(session=session, status=InvoiceStatus.CONFIRMED)
        .first()
    )
    if invoice is None:
        raise ApiError(409, "CHECKOUT_REQUIRED", "Confirm checkout before recording the exit.")
    due = invoice.total_paisa - paid_paisa(invoice)
    if due:
        raise ApiError(409, "PAYMENT_DUE", f"{due} paisa is still due on this visit.")
    parking.record_exit(session, actor=actor, at=clock.now())
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="parking.exited",
        entity=session,
        summary={"invoice_id": str(invoice.pk)},
        correlation_id=correlation_id,
    )
    return session


def paid_paisa(invoice: CheckoutInvoice) -> int:
    return PaymentEntry.objects.filter(invoice=invoice).aggregate(
        total=Coalesce(Sum("amount_paisa"), 0)
    )["total"]


def sessions_with_settlement(organisation) -> QuerySet[ParkingSession]:
    """Visits annotated with their confirmed invoice total and paid amount, for `stage_of`."""
    invoice = CheckoutInvoice.objects.filter(session=OuterRef("pk"), status=InvoiceStatus.CONFIRMED)
    paid = (
        PaymentEntry.objects.filter(
            invoice__session=OuterRef("pk"), invoice__status=InvoiceStatus.CONFIRMED
        )
        .values("invoice__session")
        .annotate(total=Sum("amount_paisa"))
        .values("total")
    )
    return (
        ParkingSession.objects.for_org(organisation)
        .select_related("bay", "zone", "tariff", "vehicle")
        .annotate(
            invoice_id=Subquery(invoice.values("pk")[:1]),
            invoice_total_paisa=Subquery(
                invoice.values("total_paisa")[:1], output_field=models.IntegerField()
            ),
            paid_paisa=Coalesce(Subquery(paid, output_field=models.IntegerField()), 0),
        )
    )


def stage_of(session: ParkingSession) -> SessionStage:
    if session.status == SessionStatus.EXITED:
        return SessionStage.EXITED
    if session.invoice_total_paisa is None:
        return SessionStage.PARKED
    if session.paid_paisa < session.invoice_total_paisa:
        return SessionStage.CHECKOUT_PENDING
    return SessionStage.EXIT_READY
