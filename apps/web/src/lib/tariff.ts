/**
 * Blueprint section 4 tariff rules in integer paisa. `fixtures/tariff-vectors.json` runs against
 * this and `backend/modules/sites/tariff.py`, so offline quotes cannot drift from the server (P25).
 */

export interface TariffTerms {
	graceSeconds: number;
	blockSeconds: number;
	blockPaisa: number;
	dailyCapPaisa: number | null;
	taxBps: number;
}

export interface Fee {
	billableSeconds: number;
	blocks: number;
	basePaisa: number;
	discountPaisa: number;
	taxPaisa: number;
	totalPaisa: number;
}

const DAY_SECONDS = 86_400;

/** Floor division for non-negative safe integers, with no floating-point quotient. */
function divide(dividend: number, divisor: number): number {
	return (dividend - (dividend % divisor)) / divisor;
}

export function calculateFee(
	tariff: TariffTerms,
	entry: Date,
	cutoff: Date,
	discountPaisa = 0,
): Fee {
	if (!Number.isSafeInteger(discountPaisa) || discountPaisa < 0) {
		throw new RangeError(
			`Discount must be a non-negative integer, got ${discountPaisa}`,
		);
	}
	// Whole elapsed seconds; a sub-second remainder never starts a block.
	const elapsed = Math.floor((cutoff.getTime() - entry.getTime()) / 1000);
	const billableSeconds = Math.max(0, elapsed - tariff.graceSeconds);
	// The optional cap applies per rolling 24-hour segment. No block straddles a segment boundary
	// because blockSeconds divides a day (database check).
	const fullDays = divide(billableSeconds, DAY_SECONDS);
	const dayBlocks = DAY_SECONDS / tariff.blockSeconds;
	const remainderBlocks = divide(
		(billableSeconds % DAY_SECONDS) + tariff.blockSeconds - 1,
		tariff.blockSeconds,
	);
	const segment = (blocks: number) => {
		const charge = blocks * tariff.blockPaisa;
		return tariff.dailyCapPaisa === null
			? charge
			: Math.min(charge, tariff.dailyCapPaisa);
	};

	const basePaisa = fullDays * segment(dayBlocks) + segment(remainderBlocks);
	const applied = Math.min(discountPaisa, basePaisa);
	const taxable = basePaisa - applied;
	const taxPaisa = divide(taxable * tariff.taxBps + 5_000, 10_000);
	return {
		billableSeconds,
		blocks: fullDays * dayBlocks + remainderBlocks,
		basePaisa,
		discountPaisa: applied,
		taxPaisa,
		totalPaisa: taxable + taxPaisa,
	};
}
