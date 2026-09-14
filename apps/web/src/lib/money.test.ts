import { describe, expect, it } from "vitest";
import { formatPaisa, parseRupees } from "./money";

describe("formatPaisa", () => {
	it("formats the blueprint shift fixture amounts", () => {
		expect(formatPaisa(130_000)).toBe("NPR 1,300.00");
		expect(formatPaisa(-2_000)).toBe("−NPR 20.00");
	});

	it("keeps sub-rupee paisa and lakh grouping exact", () => {
		expect(formatPaisa(5)).toBe("NPR 0.05");
		expect(formatPaisa(12_345_678_901)).toBe("NPR 12,34,56,789.01");
	});

	it("rejects non-integer amounts instead of rounding them", () => {
		expect(() => formatPaisa(10.5)).toThrow(RangeError);
		expect(() => formatPaisa(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
	});
});

describe("parseRupees", () => {
	it("reads whole and fractional rupees as exact paisa", () => {
		expect(parseRupees("1000")).toBe(100_000);
		expect(parseRupees(" 1,000.5 ")).toBe(100_050);
		expect(parseRupees("0.05")).toBe(5);
	});

	it("rejects anything that is not a plain amount", () => {
		for (const text of ["", "-5", "1.234", "1e3", "abc", "1234567"]) {
			expect(parseRupees(text)).toBeNull();
		}
	});
});
