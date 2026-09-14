"""Blueprint section 4 tariff rules in integer paisa.

`fixtures/tariff-vectors.json` runs against this module and `apps/web/src/lib/tariff.ts`, so the
offline device calculator cannot drift from the server (P25).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from modules.sites.models import TariffVersion

DAY_SECONDS = 86_400


@dataclass(frozen=True)
class Fee:
    billable_seconds: int
    blocks: int
    base_paisa: int
    discount_paisa: int
    tax_paisa: int
    total_paisa: int


def calculate_fee(
    tariff: "TariffVersion", *, entry: datetime, cutoff: datetime, discount_paisa: int = 0
) -> Fee:
    if discount_paisa < 0:
        raise ValueError("A discount cannot be negative.")
    # Whole elapsed seconds; a sub-second remainder never starts a block.
    elapsed = (cutoff - entry) // timedelta(seconds=1)
    billable = max(0, elapsed - tariff.grace_seconds)
    # The optional cap applies per rolling 24-hour segment. No block straddles a segment boundary
    # because block_seconds divides a day (database check).
    full_days, remainder = divmod(billable, DAY_SECONDS)
    day_blocks = DAY_SECONDS // tariff.block_seconds
    remainder_blocks = -(-remainder // tariff.block_seconds)

    def segment(blocks: int) -> int:
        charge = blocks * tariff.block_paisa
        return charge if tariff.daily_cap_paisa is None else min(charge, tariff.daily_cap_paisa)

    base = full_days * segment(day_blocks) + segment(remainder_blocks)
    discount = min(discount_paisa, base)
    taxable = base - discount
    tax = (taxable * tariff.tax_bps + 5000) // 10000
    return Fee(
        billable_seconds=billable,
        blocks=full_days * day_blocks + remainder_blocks,
        base_paisa=base,
        discount_paisa=discount,
        tax_paisa=tax,
        total_paisa=taxable + tax,
    )
