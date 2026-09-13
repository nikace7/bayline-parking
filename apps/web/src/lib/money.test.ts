import { describe, expect, it } from "vitest";
import { formatPaisa } from "./money";

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
