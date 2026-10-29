import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { MembersPage } from "./MembersPage";

vi.mock("../api/client", async (original) => ({
	...(await original<typeof import("../api/client")>()),
	api: { GET: vi.fn(), POST: vi.fn() },
}));
const state = vi.hoisted(() => ({
	roles: ["OWNER"],
	shift: { id: "shift", locationId: "loc" },
}));
vi.mock("../app/gate", async (original) => ({
	...(await original<typeof import("../app/gate")>()),
	useActiveRoles: () => state.roles,
	useLocations: () => ({
		data: [{ id: "loc", name: "Central", timezone: "Asia/Kathmandu" }],
		isSuccess: true,
	}),
	useCurrentShift: () => ({ data: { shift: state.shift } }),
}));
const pass = {
	id: "pass",
	reference: "PASS001",
	customerName: "Asha",
	customerEmail: "asha@example.test",
	plates: ["बा २ प ३४५६"],
	locationNames: ["Central"],
	startsAt: "2026-10-29T00:00:00Z",
	endsAt: "2026-11-29T00:00:00Z",
	status: "PENDING",
	pricePaisa: 100000,
	duePaisa: 100000,
	paidPaisa: 0,
	invoiceId: "invoice",
	maxVehicles: 1,
	coveredSeconds: 86400,
};
const ok = (data: unknown) =>
	Promise.resolve({ data: { data }, response: new Response() });
function open() {
	render(
		<MemoryRouter>
			<QueryClientProvider
				client={
					new QueryClient({
						defaultOptions: {
							queries: { retry: false },
							mutations: { retry: false },
						},
					})
				}
			>
				<MembersPage />
			</QueryClientProvider>
		</MemoryRouter>,
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	state.roles = ["OWNER"];
	vi.mocked(api.GET).mockImplementation((() =>
		ok({ data: [pass], page: { next: null, previous: null } })) as never);
	vi.mocked(api.POST).mockImplementation((() => ok(pass)) as never);
});

it("sells a pass with exact paisa and location-local dates", async () => {
	open();
	fireEvent.change(await screen.findByLabelText("Customer email"), {
		target: { value: "asha@example.test" },
	});
	fireEvent.change(screen.getByLabelText("Plate"), {
		target: { value: "BA12PA" },
	});
	fireEvent.change(screen.getByLabelText("Starts at"), {
		target: { value: "2026-10-29T10:00" },
	});
	fireEvent.change(screen.getByLabelText("Ends at"), {
		target: { value: "2026-11-29T10:00" },
	});
	fireEvent.change(screen.getByLabelText("Price (NPR)"), {
		target: { value: "1000.50" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Sell pass" }));
	await waitFor(() =>
		expect(api.POST).toHaveBeenCalledWith(
			"/api/v1/memberships",
			expect.objectContaining({
				body: expect.objectContaining({
					pricePaisa: 100050,
					startsAt: "2026-10-29T04:15:00.000Z",
					endsAt: "2026-11-29T04:15:00.000Z",
				}),
				params: { header: { "Idempotency-Key": expect.any(String) } },
			}),
		),
	);
	expect(await screen.findByRole("status")).toHaveTextContent("PASS001");
});

it("lets a cashier collect a pending pass and links its receipt without selling privileges", async () => {
	state.roles = ["CASHIER"];
	vi.mocked(api.POST).mockImplementation((() =>
		ok({ receiptId: "receipt", receiptNumber: "NG-001" })) as never);
	open();
	expect(
		screen.queryByRole("button", { name: "Sell pass" }),
	).not.toBeInTheDocument();
	fireEvent.click(await screen.findByRole("button", { name: /Take cash/ }));
	await waitFor(() =>
		expect(api.POST).toHaveBeenCalledWith(
			"/api/v1/invoices/{invoice_id}/payments",
			expect.objectContaining({
				body: { method: "CASH", amountPaisa: 100000 },
			}),
		),
	);
	expect(
		await screen.findByRole("link", { name: "Receipt NG-001" }),
	).toHaveAttribute("href", "/receipts/receipt");
});

it("shows later pages and allows a manager to renew an active pass", async () => {
	state.roles = ["MANAGER"];
	vi.mocked(api.GET).mockImplementation(((
		_path: unknown,
		options: { params: { query: { cursor?: string } } },
	) =>
		ok({
			data: [
				{
					...pass,
					reference: options.params.query.cursor ? "PAGE2" : "PASS001",
					status: "ACTIVE",
					duePaisa: 0,
				},
			],
			page: {
				next: options.params.query.cursor ? null : "next-cursor",
				previous: null,
			},
		})) as never);
	open();
	fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
	expect(await screen.findByText("PAGE2")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Renew" }));
	fireEvent.change(screen.getByLabelText("Renewal ends at"), {
		target: { value: "2026-12-29T10:00" },
	});
	fireEvent.change(screen.getByLabelText("Renewal price (NPR)"), {
		target: { value: "1200" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create renewal" }));
	await waitFor(() =>
		expect(api.POST).toHaveBeenCalledWith(
			"/api/v1/memberships/{pass_id}/renew",
			expect.objectContaining({
				body: {
					locationId: "loc",
					endsAt: "2026-12-29T04:15:00.000Z",
					pricePaisa: 120000,
				},
			}),
		),
	);
});
