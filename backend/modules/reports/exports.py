"""PDF and XLSX exports built from the same report objects the screen serialises (blueprint
section 5), with the filter summary and `asOf` time on every export."""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from functools import cache
from io import BytesIO
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from openpyxl.cell import WriteOnlyCell
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from modules.reports.services import CollectionsReport, ReportScope, VehicleLogReport

PDF_TYPE = "application/pdf"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
FONTS = Path(__file__).parent / "fonts"
# Text a spreadsheet could read as a formula (OWASP CSV injection prefixes).
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
INK, MUTED, INSET, RULE = (colors.HexColor(c) for c in ("#172b2b", "#4b6262", "#eaefea", "#c9d3cf"))


@dataclass(frozen=True)
class Column:
    title: str
    value: Callable[[Any], Any]
    width_mm: int
    kind: str = "text"  # text, time or money


@dataclass(frozen=True)
class Layout:
    title: str
    columns: list[Column]
    rows: list[Any]
    summary: list[tuple[str, int, str]]  # label, value, "money" or "count"


def _collections(report: CollectionsReport) -> Layout:
    return Layout(
        title="Collections",
        columns=[
            Column("Posted", lambda row: row.posted_at, 32, "time"),
            Column("Receipt", lambda row: row.receipt_number or "", 30),
            Column("Location", lambda row: row.location_name, 45),
            Column("Plate", lambda row: row.plate, 40),
            Column("Method", lambda row: row.method.title(), 22),
            Column("Received by", lambda row: row.received_by_name, 45),
            Column("Amount", lambda row: row.amount_paisa, 30, "money"),
        ],
        rows=report.rows,
        summary=[
            *(
                (f"{total.method.title()} ({total.count})", total.amount_paisa, "money")
                for total in report.by_method
            ),
            ("Captured", report.captured_paisa, "money"),
            ("Refunded", report.refunded_paisa, "money"),
            ("Net collected", report.net_paisa, "money"),
        ],
    )


def _vehicle_log(report: VehicleLogReport) -> Layout:
    return Layout(
        title="Vehicle log",
        columns=[
            Column("Entered", lambda row: row.entered_at, 30, "time"),
            Column("Exited", lambda row: row.exited_at, 30, "time"),
            Column("Status", lambda row: row.status.title(), 20),
            Column("Plate", lambda row: row.plate, 36),
            Column("Class", lambda row: row.vehicle_class.title(), 22),
            Column("Bay", lambda row: row.bay_label, 14),
            Column("Location", lambda row: row.location_name, 40),
            Column("Entered by", lambda row: row.entered_by_name, 36),
            Column("Exited by", lambda row: row.exited_by_name or "", 36),
        ],
        rows=report.rows,
        summary=[
            ("Entries", report.entries, "count"),
            ("Exits", report.exits, "count"),
            ("Still parked", report.still_parked, "count"),
        ],
    )


LAYOUTS = {"collections": _collections, "vehicle-log": _vehicle_log}


def render(slug: str, report, export_format: str) -> tuple[bytes, str]:
    # ponytail: built in memory; the 31-day cap bounds a report. Stream rows if exports grow.
    layout = LAYOUTS[slug](report)
    if export_format == "pdf":
        return _pdf(layout, report.scope), PDF_TYPE
    return _xlsx(layout, report.scope), XLSX_TYPE


def npr(paisa: int) -> str:
    """NPR with lakh grouping and a U+2212 minus, like the web app (D18)."""
    rupees, remainder = divmod(abs(paisa), 100)
    digits = str(rupees)
    head, groups = digits[:-3], [digits[-3:]]
    while head:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return f"{'−' if paisa < 0 else ''}NPR {','.join(groups)}.{remainder:02d}"


def _local(moment: datetime, zone: ZoneInfo) -> str:
    return moment.astimezone(zone).strftime("%Y-%m-%d %H:%M")


def _scope_lines(scope: ReportScope) -> list[str]:
    period = (
        f"{scope.from_date}"
        if scope.from_date == scope.to_date
        else f"{scope.from_date} to {scope.to_date}"
    )
    return [
        scope.organisation_name,
        f"{scope.location_name or 'All locations'} · {period} ({scope.timezone})",
        f"As of {_local(scope.as_of, ZoneInfo(scope.timezone))}",
    ]


@cache
def _register_fonts() -> None:
    """Noto Sans Devanagari (SIL OFL, fonts/OFL.txt), converted from the web app's @fontsource
    files, which split the family into Latin and Devanagari subsets."""
    for name, file in {
        "Bayline": "NotoSansDevanagari-Latin-Regular.ttf",
        "Bayline-SemiBold": "NotoSansDevanagari-Latin-SemiBold.ttf",
        "BaylineDeva": "NotoSansDevanagari-Devanagari-Regular.ttf",
        "BaylineDeva-SemiBold": "NotoSansDevanagari-Devanagari-SemiBold.ttf",
    }.items():
        pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))


def _is_devanagari(char: str) -> bool:
    code = ord(char)
    return 0x0900 <= code <= 0x097F or 0xA8E0 <= code <= 0xA8FF or 0x1CD0 <= code <= 0x1CFF


def _markup(text: str, *, bold: bool = False) -> str:
    """Escapes text for Paragraph markup and puts each Devanagari run in the Devanagari subset
    face. Spaces and zero-width joiners stay with the run they are in, so shaping sees whole
    clusters."""
    face = "BaylineDeva-SemiBold" if bold else "BaylineDeva"
    parts, run, run_is_devanagari = [], "", False
    for char in text:
        joins = char.isspace() or char in "‌‍"
        is_devanagari = run_is_devanagari if joins else _is_devanagari(char)
        if run and is_devanagari != run_is_devanagari:
            parts.append(
                f'<font face="{face}">{escape(run)}</font>' if run_is_devanagari else escape(run)
            )
            run = ""
        run += char
        run_is_devanagari = is_devanagari
    if run:
        parts.append(
            f'<font face="{face}">{escape(run)}</font>' if run_is_devanagari else escape(run)
        )
    return "".join(parts)


def _pdf(layout: Layout, scope: ReportScope) -> bytes:
    _register_fonts()
    zone = ZoneInfo(scope.timezone)
    body = ParagraphStyle("body", fontName="Bayline", fontSize=8.5, leading=11, shaping=1)
    head = ParagraphStyle("head", parent=body, fontName="Bayline-SemiBold")
    title = ParagraphStyle("title", parent=head, fontSize=16, leading=20, spaceAfter=4)
    meta = ParagraphStyle("meta", parent=body, fontSize=9, leading=12, textColor=MUTED)
    body_right = ParagraphStyle("body_right", parent=body, alignment=TA_RIGHT)
    head_right = ParagraphStyle("head_right", parent=head, alignment=TA_RIGHT)

    def cell(column: Column, row) -> Paragraph:
        value = column.value(row)
        if column.kind == "money":
            return Paragraph(escape(npr(value)), body_right)
        if column.kind == "time":
            return Paragraph(_local(value, zone) if value else "", body)
        return Paragraph(_markup(str(value)), body)

    header = [
        Paragraph(escape(column.title), head_right if column.kind == "money" else head)
        for column in layout.columns
    ]
    rows = [[cell(column, row) for column in layout.columns] for row in layout.rows]
    if not rows:
        rows = [[Paragraph("No records in this period.", body)] + [""] * (len(layout.columns) - 1)]
    table = Table(
        [header, *rows],
        colWidths=[column.width_mm * mm for column in layout.columns],
        repeatRows=1,
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INSET),
                ("LINEBELOW", (0, 0), (-1, 0), 0.75, INK),
                ("LINEBELOW", (0, 1), (-1, -1), 0.25, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    summary = Table(
        [
            [
                Paragraph(escape(label), head),
                Paragraph(escape(npr(value) if kind == "money" else str(value)), head_right),
            ]
            for label, value, kind in layout.summary
        ],
        colWidths=[60 * mm, 40 * mm],
        hAlign="LEFT",
    )
    buffer = BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"{layout.title} {scope.from_date} to {scope.to_date}",
    ).build(
        [
            Paragraph(escape(layout.title), title),
            *(Paragraph(_markup(line), meta) for line in _scope_lines(scope)),
            Spacer(1, 6 * mm),
            table,
            Spacer(1, 6 * mm),
            summary,
        ]
    )
    return buffer.getvalue()


def _text(sheet, value: str, font: Font | None = None) -> WriteOnlyCell:
    """Always a string cell. Formula-like text also gets Excel's quote prefix, so editing the
    cell cannot turn it into a formula either (P20)."""
    cell = WriteOnlyCell(sheet, value=value)
    cell.data_type = "s"
    if value.startswith(FORMULA_PREFIXES):
        cell.quotePrefix = True
    if font is not None:
        cell.font = font
    return cell


def _amount(sheet, paisa: int, font: Font | None = None) -> WriteOnlyCell:
    cell = WriteOnlyCell(sheet, value=Decimal(paisa) / 100)
    cell.number_format = "#,##0.00"
    if font is not None:
        cell.font = font
    return cell


def _xlsx(layout: Layout, scope: ReportScope) -> bytes:
    zone = ZoneInfo(scope.timezone)
    bold = Font(bold=True)
    workbook = Workbook(write_only=True)
    sheet = workbook.create_sheet(layout.title)
    # Write-only sheets need column settings before the first row.
    for index, column in enumerate(layout.columns, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = column.width_mm / 1.8

    def cell(column: Column, row):
        value = column.value(row)
        if column.kind == "money":
            return _amount(sheet, value)
        if column.kind == "time":
            if value is None:
                return None
            moment = WriteOnlyCell(sheet, value=value.astimezone(zone).replace(tzinfo=None))
            moment.number_format = "yyyy-mm-dd hh:mm"
            return moment
        return _text(sheet, str(value))

    sheet.append([_text(sheet, layout.title, bold)])
    for line in _scope_lines(scope):
        sheet.append([_text(sheet, line)])
    sheet.append([])
    sheet.append([_text(sheet, column.title, bold) for column in layout.columns])
    for row in layout.rows:
        sheet.append([cell(column, row) for column in layout.columns])
    sheet.append([])
    for label, value, kind in layout.summary:
        total = _amount(sheet, value, bold) if kind == "money" else value
        sheet.append([_text(sheet, label, bold), total])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
