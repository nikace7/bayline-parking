const pad = (value: number) => String(value).padStart(2, "0");

/** Billed or elapsed seconds as "1h 05m", "35m 01s" or "45s". */
export function formatDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours) return `${hours}h ${pad(minutes)}m`;
	if (minutes) return `${minutes}m ${pad(seconds)}s`;
	return `${seconds}s`;
}

/** Minutes a vehicle has been parked, for bay tiles: "12m" or "1h 05m". Display only. */
export function formatElapsed(fromIso: string, nowMs: number): string {
	const minutes = Math.max(
		0,
		Math.floor((nowMs - Date.parse(fromIso)) / 60_000),
	);
	const hours = Math.floor(minutes / 60);
	return hours ? `${hours}h ${pad(minutes % 60)}m` : `${minutes}m`;
}

/** Date and time in the location's time zone, for shift and report rows. */
export function formatDateTime(iso: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone,
	}).format(new Date(iso));
}

/** Today's calendar date as YYYY-MM-DD in a time zone, for report date filters. */
export function todayIn(timeZone: string, nowMs = Date.now()): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone }).format(nowMs);
}

/**
 * A `datetime-local` value ("2026-09-15T10:30") read as wall time in `timeZone`, as a UTC ISO
 * string. The browser's own zone plays no part, so a booking means the location's clock.
 */
export function zonedTimeToIso(local: string, timeZone: string): string {
	const asIfUtc = Date.parse(`${local}:00Z`);
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(asIfUtc);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((item) => item.type === type)?.value);
	const shown = Date.UTC(
		part("year"),
		part("month") - 1,
		part("day"),
		part("hour"),
		part("minute"),
		part("second"),
	);
	// ponytail: one offset lookup; a wall time inside a DST jump shifts by the jump (Nepal has none).
	return new Date(asIfUtc - (shown - asIfUtc)).toISOString();
}

/** Wall-clock time in the location's time zone, not the browser's. */
export function formatClock(
	iso: string,
	timeZone: string,
	withSeconds = false,
): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeStyle: withSeconds ? "medium" : "short",
		timeZone,
	}).format(new Date(iso));
}
