from datetime import UTC, date, datetime, timedelta
from io import BytesIO

import pytest
from openpyxl import load_workbook

from config import clock
from modules.billing import services as billing
from modules.parking import services as parking
from modules.reports.exports import PDF_TYPE, XLSX_TYPE

pytestmark = pytest.mark.django_db

COLLECTIONS = "/api/v1/reports/collections"
VEHICLE_LOG = "/api/v1/reports/vehicle-log"
# Kathmandu is UTC+05:45: 14 September local runs from 13 Sep 18:15 to 14 Sep 18:15 UTC.
DAY = date(2026, 9, 14)
MORNING = datetime(2026, 9, 14, 3, 0, tzinfo=UTC)  # 08:45 local
LAST_SECOND = datetime(2026, 9, 14, 18, 14, 59, tzinfo=UTC)  # 23:59:59 local
NEXT_DAY = datetime(2026, 9, 14, 18, 15, tzinfo=UTC)  # 00:00 on 15 September local
AS_OF = datetime(2026, 9, 15, 6, 0, tzinfo=UTC)
DEVANAGARI_PLATE = "बा २ प ३४५६"


def paid_visit(gate, *, bay, plate, entered, paid, vehicle_class="CAR"):
    with clock.frozen(entered):
        session = parking.admit_vehicle(
            member=gate.operator,
            actor=gate.operator.user,
            location_id=gate.location.pk,
            bay_id=gate.bays[bay].pk,
            plate=plate,
            vehicle_class=vehicle_class,
            correlation_id="test",
        )
    with clock.frozen(paid):
        quote = billing.quote_checkout(member=gate.cashier, session_id=session.pk)
        invoice = billing.confirm_checkout(
            member=gate.cashier,
            actor=gate.cashier.user,
            session_id=session.pk,
            quote_token=quote.token,
            correlation_id="test",
        )
        billing.capture_cash(
            member=gate.cashier,
            actor=gate.cashier.user,
            invoice_id=invoice.pk,
            amount_paisa=invoice.total_paisa,
            correlation_id="test",
        )
    return invoice


@pytest.fixture
def day_of_cash(gate):
    with clock.frozen(MORNING - timedelta(hours=1)):
        billing.open_shift(
            member=gate.cashier,
            actor=gate.cashier.user,
            location_id=gate.location.pk,
            opening_float_paisa=0,
            correlation_id="test",
        )
    return [
        paid_visit(
            gate,
            bay="A01",
            plate="BA 1 PA 1111",
            entered=MORNING - timedelta(minutes=35),
            paid=MORNING,
        ),
        paid_visit(
            gate,
            bay="A02",
            plate="=1+2",
            entered=LAST_SECOND - timedelta(hours=1),
            paid=LAST_SECOND,
        ),
        paid_visit(
            gate,
            bay="M01",
            plate=DEVANAGARI_PLATE,
            vehicle_class="MOTORBIKE",
            entered=NEXT_DAY - timedelta(hours=1),
            paid=NEXT_DAY,
        ),
    ]


def report(api, url, day=DAY, **params):
    return api.get(url, {"fromDate": day.isoformat(), "toDate": day.isoformat(), **params})


def sheet_rows(response):
    sheet = load_workbook(BytesIO(response.content)).active
    return [list(row) for row in sheet.iter_rows()]


def test_collections_follow_local_days_and_exports_match_the_screen(
    api, signed_in, gate, day_of_cash
):  # P16, P20
    morning, last_second, next_day = day_of_cash
    signed_in(gate.owner)
    with clock.frozen(AS_OF):
        screen = report(api, COLLECTIONS, locationId=str(gate.location.pk)).json()["data"]
        following = report(api, COLLECTIONS, day=date(2026, 9, 15)).json()["data"]
        workbook = report(api, COLLECTIONS, format="xlsx")
        pdf = report(api, COLLECTIONS, format="pdf")

    expected = morning.total_paisa + last_second.total_paisa
    assert [row["receiptNumber"] for row in screen["rows"]] == ["NGC-000001", "NGC-000002"]
    assert screen["netPaisa"] == screen["capturedPaisa"] == expected
    assert screen["byMethod"] == [{"method": "CASH", "count": 2, "amountPaisa": expected}]
    assert (screen["scope"]["timezone"], screen["scope"]["locationName"]) == (
        "Asia/Kathmandu",
        "North Gate Central",
    )
    assert [row["plate"] for row in following["rows"]] == [DEVANAGARI_PLATE]
    assert following["netPaisa"] == next_day.total_paisa

    assert workbook["Content-Type"] == XLSX_TYPE
    assert workbook["Content-Disposition"] == (
        'attachment; filename="collections-2026-09-14-to-2026-09-14.xlsx"'
    )
    cells = {cell.value: cell for row in sheet_rows(workbook) for cell in row}
    assert cells["=1+2"].data_type == "s"  # formula-like text stays text
    assert DEVANAGARI_PLATE not in cells
    net = next(row for row in sheet_rows(workbook) if row[0].value == "Net collected")
    assert net[1].value == expected / 100

    assert pdf["Content-Type"] == PDF_TYPE
    assert pdf.content.startswith(b"%PDF")


def test_reports_stay_inside_the_organisation_and_reporting_roles(
    api, signed_in, gate, day_of_cash, other_owner
):  # P01
    with clock.frozen(AS_OF):
        signed_in(gate.cashier)
        cashier = report(api, COLLECTIONS)
        signed_in(other_owner)
        foreign_location = report(api, COLLECTIONS, locationId=str(gate.location.pk), format="xlsx")
        own_rows = report(api, COLLECTIONS).json()["data"]["rows"]
        too_long = api.get(COLLECTIONS, {"fromDate": "2026-08-01", "toDate": "2026-09-14"})

    assert cashier.status_code == 403
    assert (foreign_location.status_code, foreign_location["Content-Type"]) == (
        404,
        "application/json",
    )
    assert own_rows == []
    assert too_long.json()["error"]["fieldErrors"] == {
        "toDate": ["A report covers at most 31 days."]
    }


def test_vehicle_log_lists_the_day_in_entry_order_as_it_stood(api, signed_in, gate, day_of_cash):
    morning = day_of_cash[0]
    with clock.frozen(MORNING + timedelta(minutes=5)):
        billing.exit_vehicle(
            member=gate.operator,
            actor=gate.operator.user,
            session_id=morning.session_id,
            correlation_id="test",
        )
    signed_in(gate.owner)
    with clock.frozen(AS_OF):
        log = report(api, VEHICLE_LOG).json()["data"]
        pdf = report(api, VEHICLE_LOG, format="pdf")
        workbook = report(api, VEHICLE_LOG, format="xlsx")

    assert [(row["plate"], row["status"]) for row in log["rows"]] == [
        ("BA 1 PA 1111", "EXITED"),
        ("=1+2", "PARKED"),
        (DEVANAGARI_PLATE, "PARKED"),
    ]
    assert (log["entries"], log["exits"], log["stillParked"]) == (3, 1, 2)
    assert pdf.content.startswith(b"%PDF")
    assert DEVANAGARI_PLATE in {cell.value for row in sheet_rows(workbook) for cell in row}
