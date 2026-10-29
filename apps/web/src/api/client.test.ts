import { describe, expect, it, vi } from "vitest";
import { ApiError, allPages } from "./client";

function page(ids: string[], next: string | null) {
	return {
		data: { data: ids.map((id) => ({ id })), page: { next } },
		response: new Response(),
	};
}

describe("complete cursor lists", () => {
	it("follows opaque cursors and does not double-count duplicate rows", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(page(["a", "b"], "opaque+/cursor"))
			.mockResolvedValueOnce(page(["b", "c"], null));
		expect(await allPages(fetch)).toEqual([
			{ id: "a" },
			{ id: "b" },
			{ id: "c" },
		]);
		expect(fetch.mock.calls).toEqual([[undefined], ["opaque+/cursor"]]);
	});
	it("rejects rather than returning a partial list when a later page fails", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(page(["a"], "next"))
			.mockResolvedValueOnce({
				error: {
					error: {
						code: "FORBIDDEN",
						message: "Access denied",
						fieldErrors: {},
						retryable: false,
					},
					requestId: null,
				},
				response: new Response(null, { status: 403 }),
			});
		await expect(allPages(fetch)).rejects.toBeInstanceOf(ApiError);
	});
	it("rejects repeated cursors instead of looping forever", async () => {
		const fetch = vi.fn().mockResolvedValue(page(["a"], "loop"));
		await expect(allPages(fetch)).rejects.toThrow("Pagination cursor repeated");
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("rejects missing pagination metadata", async () => {
		await expect(
			allPages(
				vi
					.fn()
					.mockResolvedValue({ data: { data: [] }, response: new Response() }),
			),
		).rejects.toThrow("Incomplete list response");
	});
	it("stops before the next page when a query is cancelled", async () => {
		const controller = new AbortController();
		const fetch = vi.fn().mockImplementation(async () => {
			controller.abort();
			return page(["a"], "next");
		});
		await expect(allPages(fetch, controller.signal)).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
