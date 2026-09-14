"""Shifts, checkout, cash settlement and exit (blueprint sections 4 and 5).

Global lock order: bays -> parking session -> invoice -> shift. Each write takes the subset it
needs in that order, so no two gate transactions can wait on each other in a cycle.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from django.core import signing
from django.db import models, transaction
from django.db.models import OuterRef, QuerySet, Subquery, Sum
from django.db.models.functions import Coalesce
from rest_framework.exceptions import NotFound

from config import clock
from config.api import ApiError
from config.transactions import conflict_on
from modules.accounts.services import record_audit
from modules.billing.models import (
    CheckoutInvoice,
    EntryKind,
    InvoiceStatus,
    PaymentEntry,
    PaymentMethod,
    SessionStage,
    Shift,
)
from modules.parking import services as parking
from modules.parking.models import ParkingSession, SessionStatus
from modules.sites.models import Location
from modules.sites.services import ensure_can_operate
from modules.sites.tariff import Fee, calculate_fee

QUOTE_SALT = "bayline.billing.quote"
QUOTE_LIFETIME = timedelta(seconds=120)
CHECKOUT_EXISTS = ("CHECKOUT_EXISTS", "This visit already has a confirmed invoice.")


@dataclass(frozen=True)
class Quote:
    token: str
    cutoff_at: datetime
    expires_at: datetime
    fee: Fee


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
        .select_related("location")
        .filter(operator=user, closed_at__isnull=True)
        .first()
    )


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
    fee = calculate_fee(session.tariff, entry=session.entered_at, cutoff=cutoff)
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
    # Recalculated from the pinned, immutable tariff: the browser never supplies an amount.
    fee = calculate_fee(session.tariff, entry=session.entered_at, cutoff=cutoff)
    if fee.total_paisa != quoted_total:
        raise ApiError(409, "QUOTE_INVALID", "This quote no longer matches the visit.")
    with conflict_on({"invoice_one_confirmed_per_session": CHECKOUT_EXISTS}):
        invoice = CheckoutInvoice.objects.create(
            organisation_id=session.organisation_id,
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
    # Needs neither bay nor session: invoice, then shift, in global lock order.
    invoice = (
        CheckoutInvoice.objects.for_org(member.organisation)
        .select_related("session__location")
        .select_for_update(of=("self",))
        .filter(pk=invoice_id, status=InvoiceStatus.CONFIRMED)
        .first()
    )
    if invoice is None:
        raise NotFound()
    location = invoice.session.location
    ensure_can_operate(member, location)
    due = invoice.total_paisa - paid_paisa(invoice)
    if due == 0:
        raise ApiError(409, "INVOICE_SETTLED", "This invoice is already paid.")
    if amount_paisa != due:
        raise ApiError(
            409, "AMOUNT_MISMATCH", f"The amount due is {due} paisa. Refresh and try again."
        )
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
    record_audit(
        organisation=member.organisation,
        actor=actor,
        action="payment.captured",
        entity=entry,
        summary={"invoice_id": str(invoice.pk), "method": entry.method, "amount_paisa": due},
        correlation_id=correlation_id,
    )
    return entry


@transaction.atomic
def exit_vehicle(*, member, actor, session_id, correlation_id) -> ParkingSession:
    """Physical exit needs a fully paid invoice, checked under the session and invoice locks.
    Settling an invoice never records an exit by itself."""
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
        .select_related("bay", "vehicle")
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
