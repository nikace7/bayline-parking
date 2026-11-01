import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ZoneSetup } from "./ZoneSetup";

const state = vi.hoisted(() => ({ roles: ["OWNER"] }));
vi.mock("../app/gate", () => ({ useActiveRoles: () => state.roles }));
vi.mock("../api/client", async (original) => ({
	...(await original<typeof import("../api/client")>()),
	api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
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
const ok = (data: unknown) =>
	Promise.resolve({
		data: { data, page: { next: null, previous: null } },
		response: new Response(),
	});
beforeEach(() => {
	state.roles = ["OWNER"];
	vi.mocked(api.GET).mockImplementation((() => ok([])) as never);
	vi.mocked(api.POST).mockImplementation((() => ok({ id: "zone" })) as never);
});
function show() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<ZoneSetup location={location} />
		</QueryClientProvider>,
	);
	return client;
}
it("creates a named motorcycle area with an integer capacity and locks successful submission", async () => {
	show();
	fireEvent.click(screen.getByText("Add an open parking area"));
	fireEvent.change(screen.getByLabelText("Area name"), {
		target: { value: "Motorcycle yard" },
	});
	fireEvent.change(screen.getByLabelText("Vehicle capacity"), {
		target: { value: "1.5" },
	});
	expect(
		screen.getByRole("button", { name: "Create parking area" }),
	).toBeDisabled();
	fireEvent.change(screen.getByLabelText("Vehicle capacity"), {
		target: { value: "20" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create parking area" }));
	expect(await screen.findByRole("status")).toHaveTextContent(
		"Parking area created",
	);
	expect(api.POST).toHaveBeenCalledWith(
		"/api/v1/locations/{location_id}/zones",
		expect.objectContaining({
			body: {
				name: "Motorcycle yard",
				pools: [{ vehicleClass: "MOTORBIKE", capacity: 20 }],
			},
		}),
	);
	expect(
		screen.queryByRole("button", { name: "Create parking area" }),
	).not.toBeInTheDocument();
});
it("does not expose configuration to an operator", async () => {
	state.roles = ["OPERATOR"];
	show();
	expect(
		screen.queryByText("Add an open parking area"),
	).not.toBeInTheDocument();
});

it("keeps a focused capacity draft when polling finds a newer revision and reloads explicitly", async () => {
	const pool = {
		id: "pool",
		vehicleClass: "MOTORBIKE",
		capacity: 10,
		occupied: 1,
		state: "ACTIVE",
		revision: 1,
	};
	const zone = {
		id: "yard",
		name: "Yard",
		mode: "OPEN_CAPACITY",
		pools: [pool],
	};
	vi.mocked(api.GET).mockImplementation((() => ok([zone])) as never);
	const client = show();
	fireEvent.click(await screen.findByText("Edit motorbike capacity"));
	const capacity = screen.getByLabelText("New capacity");
	capacity.focus();
	fireEvent.change(capacity, { target: { value: "25" } });
	act(() =>
		client.setQueryData(
			["zones", "loc"],
			[{ ...zone, pools: [{ ...pool, capacity: 15, revision: 2 }] }],
		),
	);
	await screen.findByText(/Capacity changed since you started editing/);
	expect(screen.getByLabelText("New capacity")).toHaveValue("25");
	expect(screen.getByLabelText("New capacity")).toHaveFocus();
	expect(screen.getByRole("button", { name: "Save capacity" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Load latest settings" }));
	expect(screen.getByLabelText("New capacity")).toHaveValue("15");
	expect(screen.getByRole("button", { name: "Save capacity" })).toBeEnabled();
	vi.mocked(api.GET).mockRejectedValueOnce(new Error("Connection lost"));
	await act(async () => {
		await client.invalidateQueries({ queryKey: ["zones", "loc"] });
	});
	expect(screen.getByLabelText("New capacity")).toHaveValue("15");
});
