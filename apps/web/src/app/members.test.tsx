import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useMemberPasses } from "./members";

vi.mock("../api/client", async (original) => ({
	...(await original<typeof import("../api/client")>()),
	api: { GET: vi.fn() },
}));
function wrapper({ children }: { children: ReactNode }) {
	return (
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			{children}
		</QueryClientProvider>
	);
}

it("rejects missing page metadata rather than silently truncating memberships", async () => {
	vi.mocked(api.GET).mockResolvedValue({
		data: { data: [] },
		response: new Response(),
	} as never);
	const { result } = renderHook(() => useMemberPasses("loc", "BA"), {
		wrapper,
	});
	await waitFor(() => expect(result.current.isError).toBe(true));
});

it("cancels the membership request when the view unmounts", async () => {
	let signal: AbortSignal | undefined;
	vi.mocked(api.GET).mockImplementation(((
		_path: unknown,
		options: { signal: AbortSignal },
	) => {
		signal = options.signal;
		return new Promise(() => {});
	}) as never);
	const { unmount } = renderHook(() => useMemberPasses("loc", "BA"), {
		wrapper,
	});
	await waitFor(() => expect(signal).toBeDefined());
	unmount();
	expect(signal?.aborted).toBe(true);
});
