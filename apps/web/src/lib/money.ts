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
