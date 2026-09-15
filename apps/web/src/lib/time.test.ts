import { describe, expect, it } from "vitest";
import {
	formatClock,
	formatDuration,
	formatElapsed,
	todayIn,
	zonedTimeToIso,
} from "./time";

describe("zonedTimeToIso", () => {
	it("reads a picked time on the location's clock, not the browser's", () => {
		// Kathmandu is UTC+05:45, so 10:30 there is 04:45 UTC.
		expect(zonedTimeToIso("2026-09-15T10:30", "Asia/Kathmandu")).toBe(
			"2026-09-15T04:45:00.000Z",
		);
		// Just after local midnight is still the previous UTC day.
		expect(zonedTimeToIso("2026-09-15T00:10", "Asia/Kathmandu")).toBe(
			"2026-09-14T18:25:00.000Z",
		);
	});
});

describe("todayIn", () => {
	it("turns over at local midnight, not UTC midnight", () => {
		// Kathmandu midnight on 15 September is 18:15 UTC on the 14th.
		const lastSecond = Date.parse("2026-09-14T18:14:59Z");
		expect(todayIn("Asia/Kathmandu", lastSecond)).toBe("2026-09-14");
		expect(todayIn("Asia/Kathmandu", lastSecond + 1000)).toBe("2026-09-15");
	});
});

describe("formatDuration", () => {
	it("shows the two most significant units", () => {
		expect(formatDuration(45)).toBe("45s");
		expect(formatDuration(1801)).toBe("30m 01s");
		expect(formatDuration(3900)).toBe("1h 05m");
	});
});

describe("formatElapsed", () => {
	it("counts whole minutes and never goes negative", () => {
		const entered = "2026-09-14T03:00:00Z";
		expect(formatElapsed(entered, Date.parse("2026-09-14T03:12:59Z"))).toBe(
			"12m",
		);
		expect(formatElapsed(entered, Date.parse("2026-09-14T04:05:00Z"))).toBe(
			"1h 05m",
		);
		expect(formatElapsed(entered, Date.parse("2026-09-14T02:59:00Z"))).toBe(
			"0m",
		);
	});
});

describe("formatClock", () => {
	it("uses the location time zone", () => {
		// 03:00 UTC is 08:45 in Kathmandu (UTC+05:45).
		expect(formatClock("2026-09-14T03:00:00Z", "Asia/Kathmandu")).toBe("08:45");
	});
});
