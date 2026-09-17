import { describe, expect, it } from "vitest";
import vectors from "../../../../fixtures/tariff-vectors.json";
import { calculateFee, type Fee, type TariffTerms } from "./tariff";

interface VectorCase {
	name: string;
	tariff: string;
	coveredSeconds?: number;
	entry: string;
	cutoff: string;
	discountPaisa: number;
	expected: Fee;
}

const tariffs: Record<string, TariffTerms> = vectors.tariffs;

describe("calculateFee shared vectors", () => {
	it.each(vectors.cases as VectorCase[])(
		"$name",
		({ tariff, coveredSeconds, entry, cutoff, discountPaisa, expected }) => {
			const terms = tariffs[tariff];
			if (!terms) {
				throw new Error(`Unknown tariff ${tariff} in tariff-vectors.json`);
			}
			expect(
				calculateFee(
					terms,
					new Date(entry),
					new Date(cutoff),
					discountPaisa,
					coveredSeconds ?? null,
				),
			).toEqual(expected);
		},
	);
});

describe("calculateFee", () => {
	it("rejects a negative or fractional discount", () => {
		const at = new Date("2026-09-14T09:00:00Z");
		expect(() => calculateFee(vectors.tariffs.car, at, at, -1)).toThrow(
			RangeError,
		);
		expect(() => calculateFee(vectors.tariffs.car, at, at, 0.5)).toThrow(
			RangeError,
		);
	});
});
