import { describe, expect, it } from "vitest";
import { dueReservation, type Reservation } from "./reservations";

const opens = Date.parse("2026-09-15T04:50:00Z");
const closes = Date.parse("2026-09-15T05:15:00Z");

function booking(overrides: Partial<Reservation> = {}): Reservation {
	return {
		id: "r1",
		bayId: "bay-r01",
		status: "CONFIRMED",
		arrivalOpensAt: "2026-09-15T04:50:00Z",
		arrivalClosesAt: "2026-09-15T05:15:00Z",
		...overrides,
	} as Reservation;
}

describe("dueReservation", () => {
	it("finds a confirmed booking only while its arrival window is open", () => {
		const list = [booking()];

		expect(dueReservation(list, "bay-r01", opens)?.id).toBe("r1");
		expect(dueReservation(list, "bay-r01", closes)?.id).toBe("r1");
		expect(dueReservation(list, "bay-r01", opens - 1)).toBeUndefined();
		expect(dueReservation(list, "bay-r01", closes + 1)).toBeUndefined();
		expect(dueReservation(list, "bay-r02", opens)).toBeUndefined();
		expect(
			dueReservation([booking({ status: "HOLD" })], "bay-r01", opens),
		).toBeUndefined();
	});
});
