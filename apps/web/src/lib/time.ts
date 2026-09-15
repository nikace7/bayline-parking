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
