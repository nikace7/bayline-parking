const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Formats integer paisa as NPR with Nepali lakh grouping, never through floating point. */
export function formatPaisa(paisa: number): string {
	if (!Number.isSafeInteger(paisa)) {
		throw new RangeError(`Paisa must be a safe integer, got ${paisa}`);
	}
	const absolute = Math.abs(paisa);
	const remainder = absolute % 100;
	const rupees = (absolute - remainder) / 100;
	const sign = paisa < 0 ? "−" : "";
	return `${sign}NPR ${grouping.format(rupees)}.${String(remainder).padStart(2, "0")}`;
}

/** Counted cash against expected cash, in words staff act on. */
export function describeVariance(variancePaisa: number): string {
	if (variancePaisa === 0) {
		return "Balanced";
	}
	const direction = variancePaisa < 0 ? "Short" : "Over";
	return `${direction} by ${formatPaisa(Math.abs(variancePaisa))}`;
}

/** Reads a rupee amount typed by staff ("1000", "1,000.5") as integer paisa, or null if invalid. */
export function parseRupees(text: string): number | null {
	const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(
		text.trim().replaceAll(",", ""),
	);
	if (!match) {
		return null;
	}
	const [, rupees = "0", paise = ""] = match;
	return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}
