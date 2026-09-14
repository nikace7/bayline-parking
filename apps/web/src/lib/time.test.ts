import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, formatElapsed } from "./time";

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
