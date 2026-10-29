import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, allPages, errorMessage, unwrap } from "./client";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it("preserves actionable API errors and safely describes network failures", () => {
	const error = new ApiError(409, {
		error: {
			code: "CONFLICT",
			message: "Refresh the quote",
			fieldErrors: { plate: ["Check plate"] },
			retryable: false,
		},
		requestId: null,
	});
	expect(error.code).toBe("CONFLICT");
	expect(error.fieldError("plate")).toBe("Check plate");
	expect(error.fieldError("missing")).toBeUndefined();
	expect(errorMessage(error)).toBe("Refresh the quote");
	expect(errorMessage(new TypeError())).toContain("could not be reached");
	expect(new ApiError(503, null).message).toContain("503");
	expect(new ApiError(503, null).code).toBeUndefined();
});

it("rejects an empty successful response instead of inventing data", async () => {
	await expect(
		unwrap(Promise.resolve({ response: new Response() })),
	).rejects.toBeInstanceOf(ApiError);
});

it.each([
	{ error: null },
	{ error: { code: "BAD", message: null } },
	{
		error: {
			code: "BAD",
			message: "Bad",
			fieldErrors: { plate: [42] },
			retryable: false,
		},
		requestId: null,
	},
])(
	"keeps malformed HTTP errors as ApiError instead of crashing",
	async (error) => {
		await expect(
			unwrap(
				Promise.resolve({
					response: new Response(null, { status: 502 }),
					error,
				}),
			),
		).rejects.toMatchObject({ name: "Error", status: 502, body: null });
	},
);

it("reads the current CSRF cookie for each write and omits it on reads", async () => {
	const requests: Request[] = [];
	const fetch = vi.fn().mockImplementation(async (request: Request) => {
		requests.push(request);
		return new Response(null, { status: 204 });
	});
	vi.stubGlobal("fetch", fetch);
	vi.resetModules();
	const { api } = await import("./client");
	const cookie = vi
		.spyOn(document, "cookie", "get")
		.mockReturnValue("csrftoken=first-token");
	await api.GET("/api/v1/auth/session", { baseUrl: "http://localhost" });
	await api.POST("/api/v1/auth/logout", { baseUrl: "http://localhost" });
	cookie.mockReturnValue("csrftoken=rotated-token");
	await api.POST("/api/v1/auth/logout", { baseUrl: "http://localhost" });
	expect(requests[0]?.headers.has("X-CSRFToken")).toBe(false);
	expect(requests[1]?.headers.get("X-CSRFToken")).toBe("first-token");
	expect(requests[2]?.headers.get("X-CSRFToken")).toBe("rotated-token");
});

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
