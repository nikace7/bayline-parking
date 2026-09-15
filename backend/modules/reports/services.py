"""Read-only report queries (blueprint section 5).

The screen and both export formats read the same report object. Each report is one SELECT, so rows
and totals come from a single statement snapshot, and rows are bounded by `as_of` as well as the
period: over the append-only ledger, the same filters and `as_of` reproduce a report.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from django.db.models import Q
from rest_framework.exceptions import NotFound

from config import clock
from modules.billing.models import EntryKind, PaymentEntry
from modules.parking.models import ParkingSession, SessionStatus
from modules.sites.models import Location


@dataclass(frozen=True)
class ReportScope:
    organisation_name: str
    location_id: UUID | None
    location_name: str | None
    timezone: str
    from_date: date
    to_date: date
    starts_at: datetime
    ends_at: datetime
    as_of: datetime


def scope_for(member, *, location_id, from_date, to_date) -> ReportScope:
    """Local dates become a UTC half-open range in the location's time zone."""
    location = None
    if location_id is not None:
        location = Location.objects.for_org(member.organisation).filter(pk=location_id).first()
        if location is None:
            raise NotFound()
    timezone = location.timezone if location else member.organisation.timezone
    zone = ZoneInfo(timezone)
    return ReportScope(
        organisation_name=member.organisation.name,
        location_id=location_id,
        location_name=location.name if location else None,
        timezone=timezone,
        from_date=from_date,
        to_date=to_date,
        starts_at=datetime.combine(from_date, time.min, zone),
        ends_at=datetime.combine(to_date + timedelta(days=1), time.min, zone),
        as_of=clock.now(),
    )


@dataclass(frozen=True)
class CollectionRow:
    posted_at: datetime
    receipt_number: str | None
    location_name: str
    plate: str
    method: str
    kind: str
    amount_paisa: int
    received_by_name: str


@dataclass(frozen=True)
class MethodTotal:
    method: str
    count: int
    amount_paisa: int


@dataclass(frozen=True)
class CollectionsReport:
    scope: ReportScope
    rows: list[CollectionRow]
    by_method: list[MethodTotal]
    captured_paisa: int
    refunded_paisa: int
    net_paisa: int


def collections(member, scope: ReportScope) -> CollectionsReport:
    """Captures minus refunds by their actual posted time, method and location. Refunds (M6) are
    negative ledger entries posted on their own date, never netted into the original sale."""
    entries = (
        PaymentEntry.objects.for_org(member.organisation)
        .filter(
            created_at__gte=scope.starts_at,
            created_at__lt=scope.ends_at,
            created_at__lte=scope.as_of,
        )
        .select_related(
            "invoice__session__vehicle", "invoice__session__location", "receipt", "received_by"
        )
        .order_by("created_at", "id")
    )
    if scope.location_id is not None:
        entries = entries.filter(invoice__session__location_id=scope.location_id)
    rows = [
        CollectionRow(
            posted_at=entry.created_at,
            # A reverse one-to-one without a row raises an AttributeError subclass.
            receipt_number=getattr(getattr(entry, "receipt", None), "number", None),
            location_name=entry.invoice.session.location.name,
            plate=entry.invoice.session.vehicle.plate,
            method=entry.method,
            kind=entry.kind,
            amount_paisa=entry.amount_paisa,
            received_by_name=entry.received_by.name,
        )
        for entry in entries
    ]
    by_method: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for row in rows:
        by_method[row.method][0] += 1
        by_method[row.method][1] += row.amount_paisa
    captured = sum(row.amount_paisa for row in rows if row.kind == EntryKind.CAPTURE)
    net = sum(row.amount_paisa for row in rows)
    return CollectionsReport(
        scope=scope,
        rows=rows,
        by_method=[
            MethodTotal(method=method, count=count, amount_paisa=amount)
            for method, (count, amount) in sorted(by_method.items())
        ],
        captured_paisa=captured,
        refunded_paisa=captured - net,
        net_paisa=net,
    )


@dataclass(frozen=True)
class VehicleLogRow:
    entered_at: datetime
    exited_at: datetime | None
    status: str
    plate: str
    vehicle_class: str
    bay_label: str
    location_name: str
    entered_by_name: str
    exited_by_name: str | None


@dataclass(frozen=True)
class VehicleLogReport:
    scope: ReportScope
    rows: list[VehicleLogRow]
    entries: int
    exits: int
    still_parked: int


def vehicle_log(member, scope: ReportScope) -> VehicleLogReport:
    """Every visit that entered or exited in the period, as it stood at `as_of`."""
    in_period = Q(entered_at__gte=scope.starts_at, entered_at__lt=scope.ends_at) | Q(
        exited_at__gte=scope.starts_at, exited_at__lt=scope.ends_at
    )
    sessions = (
        ParkingSession.objects.for_org(member.organisation)
        .filter(in_period, entered_at__lte=scope.as_of)
        .select_related("vehicle", "bay", "location", "entered_by", "exited_by")
        .order_by("entered_at", "id")
    )
    if scope.location_id is not None:
        sessions = sessions.filter(location_id=scope.location_id)
    rows = []
    for session in sessions:
        exited = session.exited_at is not None and session.exited_at <= scope.as_of
        rows.append(
            VehicleLogRow(
                entered_at=session.entered_at,
                exited_at=session.exited_at if exited else None,
                status=SessionStatus.EXITED if exited else SessionStatus.PARKED,
                plate=session.vehicle.plate,
                vehicle_class=session.bay.vehicle_class,
                bay_label=session.bay.label,
                location_name=session.location.name,
                entered_by_name=session.entered_by.name,
                exited_by_name=session.exited_by.name if exited else None,
            )
        )

    def in_range(moment: datetime | None) -> bool:
        return moment is not None and scope.starts_at <= moment < scope.ends_at

    return VehicleLogReport(
        scope=scope,
        rows=rows,
        entries=sum(in_range(row.entered_at) for row in rows),
        exits=sum(in_range(row.exited_at) for row in rows),
        still_parked=sum(row.status == SessionStatus.PARKED for row in rows),
    )
