import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { OpenLotBoard } from "./OpenLotBoard";

vi.mock("../api/client", async (original) => ({
	...(await original<typeof import("../api/client")>()),
	api: { GET: vi.fn(), POST: vi.fn() },
}));
const location = {
	id: "loc",
	name: "Central",
	timezone: "Asia/Kathmandu",
	address: "Kathmandu",
	latitude: 0,
	longitude: 0,
	receiptPrefix: "CEN",
	enabled: true,
	createdAt: "2026-11-01T00:00:00Z",
};
const zone = {
	id: "yard",
	name: "Motorcycle yard",
	mode: "OPEN_CAPACITY",
	createdAt: "2026-11-01T00:00:00Z",
	pools: [
		{
			id: "pool",
			vehicleClass: "MOTORBIKE",
			capacity: 1,
			occupied: 0,
			state: "ACTIVE",
			revision: 1,
		},
	],
};
const ok = (data: unknown) =>
	Promise.resolve({
		data: { data, page: { next: null, previous: null } },
		response: new Response(),
	});
beforeEach(() => {
	vi.mocked(api.GET).mockImplementation((() => ok([zone])) as never);
	vi.mocked(api.POST).mockImplementation((() => ok({ id: "visit" })) as never);
});
function show(canManageGate = true) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<MemoryRouter>
				<OpenLotBoard
					location={location}
					visits={[]}
					canManageGate={canManageGate}
					canTakeCash={false}
					canCheckout={canManageGate}
				/>
			</MemoryRouter>
		</QueryClientProvider>,
	);
	return client;
}
it("admits to the selected pool without inventing a bay and prevents duplicate submission", async () => {
	show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Motorcycle yard · Motorbike" }),
	);
	fireEvent.change(screen.getByLabelText("Open-lot plate"), {
		target: { value: "BA 1 PA 1234" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Confirm open-lot entry" }),
	);
	expect(await screen.findByRole("status")).toHaveTextContent(
		"BA 1 PA 1234 admitted",
	);
	expect(api.POST).toHaveBeenCalledWith(
		"/api/v1/parking/entries",
		expect.objectContaining({
			body: {
				locationId: "loc",
				poolId: "pool",
				vehicleClass: "MOTORBIKE",
				plate: "BA 1 PA 1234",
			},
		}),
	);
	expect(
		screen.queryByRole("button", { name: "Confirm open-lot entry" }),
	).not.toBeInTheDocument();
});
it("keeps full pools visible and refuses an admission control", async () => {
	vi.mocked(api.GET).mockImplementation((() =>
		ok([{ ...zone, pools: [{ ...zone.pools[0], occupied: 1 }] }])) as never);
	show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Motorcycle yard · Motorbike" }),
	);
	expect(screen.getByText("This area is full.")).toBeVisible();
	expect(
		screen.queryByRole("button", { name: "Confirm open-lot entry" }),
	).not.toBeInTheDocument();
});
it("does not offer admission to read-only staff", async () => {
	show(false);
	fireEvent.click(
		await screen.findByRole("button", { name: "Motorcycle yard · Motorbike" }),
	);
	expect(screen.queryByLabelText("Open-lot plate")).not.toBeInTheDocument();
});

it("preserves the plate across a failed background refresh and disables admission until recovery", async () => {
	const client = show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Motorcycle yard · Motorbike" }),
	);
	const plate = screen.getByLabelText("Open-lot plate");
	fireEvent.change(plate, { target: { value: "BA 9 PA 9999" } });
	vi.mocked(api.GET).mockRejectedValueOnce(new Error("Connection lost"));
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["zones", "loc"] });
	});
	await screen.findByText(/Capacity could not be refreshed/);
	expect(screen.getByLabelText("Open-lot plate")).toHaveValue("BA 9 PA 9999");
	expect(
		screen.getByRole("button", { name: "Confirm open-lot entry" }),
	).toBeDisabled();
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["zones", "loc"] });
	});
	await waitFor(() =>
		expect(
			screen.getByRole("button", { name: "Confirm open-lot entry" }),
		).toBeEnabled(),
	);
});

it("locks area selection while admission is pending", async () => {
	let finish: (value: Awaited<ReturnType<typeof ok>>) => void = () => {};
	vi.mocked(api.GET).mockImplementation((() =>
		ok([
			zone,
			{
				...zone,
				id: "other",
				name: "Second yard",
				pools: [{ ...zone.pools[0], id: "other-pool" }],
			},
		])) as never);
	vi.mocked(api.POST).mockImplementationOnce(
		(() =>
			new Promise((resolve) => {
				finish = resolve;
			})) as never,
	);
	show();
	fireEvent.click(
		await screen.findByRole("button", { name: "Motorcycle yard · Motorbike" }),
	);
	fireEvent.change(screen.getByLabelText("Open-lot plate"), {
		target: { value: "BA 7 PA 7777" },
	});
	fireEvent.click(
		screen.getByRole("button", { name: "Confirm open-lot entry" }),
	);
	await waitFor(() =>
		expect(
			screen.getByRole("button", { name: "Second yard · Motorbike" }),
		).toBeDisabled(),
	);
	await act(async () => finish(await ok({ id: "visit" })));
	expect(await screen.findByRole("status")).toHaveTextContent(
		"BA 7 PA 7777 admitted",
	);
});
