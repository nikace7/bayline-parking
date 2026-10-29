import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { ApiError } from "./client";
import { useIdempotencyKey } from "./useIdempotencyKey";

it("retains a write identity across rerenders and uncertain outcomes", () => {
	const { result, rerender } = renderHook(useIdempotencyKey);
	const first = result.current.keyFor({ amount: 5000 });
	result.current.settle(new TypeError("Connection lost"));
	rerender();
	expect(result.current.keyFor({ amount: 5000 })).toBe(first);
	result.current.settle(new ApiError(503, null));
	expect(result.current.keyFor({ amount: 5000 })).toBe(first);
	expect(result.current.keyFor({ amount: 6000 })).not.toBe(first);
});

it("starts a new identity after success or a definitive client rejection", () => {
	const { result } = renderHook(useIdempotencyKey);
	const first = result.current.keyFor("sale");
	result.current.settle(null);
	const second = result.current.keyFor("sale");
	expect(second).not.toBe(first);
	result.current.settle(new ApiError(409, null));
	expect(result.current.keyFor("sale")).not.toBe(second);
});
