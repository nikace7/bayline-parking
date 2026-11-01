import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
afterEach(() => vi.restoreAllMocks());
vi.mock("../app/gate", async (original) => ({
	...(await original<typeof import("../app/gate")>()),
	useActiveRoles: () => state.roles,
	useCurrentShift: () => ({ data: { shift: state.shift } }),
}));
vi.mock("../app/sites", async (original) => ({
	...(await original<typeof import("../app/sites")>()),
	useLocations: () => ({
		data: [{ id: "loc", name: "Central", timezone: "Asia/Kathmandu" }],
		isSuccess: true,
	}),
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
const paged = (data: unknown) =>
	Promise.resolve({ data, response: new Response() });
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
	vi.mocked(api.GET).mockImplementation(((path: string) =>
		paged({
			data: path.endsWith("/customers") ? [] : [pass],
			page: { next: null, previous: null },
		})) as never);
	vi.mocked(api.POST).mockImplementation((() => ok(pass)) as never);
});

it("sells a pass with exact paisa and location-local dates", async () => {
	open();
	fireEvent.click(screen.getByRole("radio", { name: "Online account email" }));
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

it("creates a walk-up profile and sells to its ID without an online email", async () => {
	const profile = {
		id: "customer",
		name: "Walk-up Asha",
		phone: "9841000000",
		email: "",
		hasOnlineAccount: false,
	};
	vi.mocked(api.POST).mockImplementation(((path: string) =>
		ok(path.endsWith("/customers") ? profile : pass)) as never);
	open();
	fireEvent.click(screen.getByText("Create a customer", { exact: true }));
	fireEvent.change(screen.getByLabelText("Customer name"), {
		target: { value: profile.name },
	});
	fireEvent.change(screen.getByLabelText("Phone (optional)"), {
		target: { value: profile.phone },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create customer" }));
	await waitFor(() =>
		expect(
			screen.getByRole("combobox", { name: "Customer profile" }),
		).toHaveValue("customer"),
	);
	expect(
		screen.getByRole("button", { name: "Create customer" }),
	).toBeDisabled();
	fireEvent.change(screen.getByLabelText("Plate", { exact: true }), {
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
					customerId: "customer",
					pricePaisa: 100050,
				}),
			}),
		),
	);
	const calls = vi.mocked(api.POST).mock.calls as unknown as [
		string,
		{ body: Record<string, unknown> },
	][];
	expect(
		calls.find(([path]) => path.endsWith("/memberships"))?.[1].body,
	).not.toHaveProperty("email");
});

it("loads further customer pages and refuses a pass without a selected profile", async () => {
	vi.mocked(api.GET).mockImplementation(((
		path: string,
		options: { params: { query: { cursor?: string } } },
	) => {
		if (!path.endsWith("/customers"))
			return paged({ data: [pass], page: { next: null } });
		return paged({
			data: [
				{
					id: options.params.query.cursor ? "second" : "first",
					name: options.params.query.cursor
						? "Later customer"
						: "First customer",
					phone: "",
					email: "",
					hasOnlineAccount: false,
				},
			],
			page: { next: options.params.query.cursor ? null : "next-page" },
		});
	}) as never);
	open();
	fireEvent.click(
		await screen.findByRole("button", { name: "Load more customers" }),
	);
	expect(
		await screen.findByRole("option", { name: /Later customer/ }),
	).toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Starts at"), {
		target: { value: "2026-10-29T10:00" },
	});
	fireEvent.change(screen.getByLabelText("Ends at"), {
		target: { value: "2026-11-29T10:00" },
	});
	fireEvent.change(screen.getByLabelText("Price (NPR)"), {
		target: { value: "1000" },
	});
	fireEvent.submit(
		screen
			.getByRole("button", { name: "Sell pass" })
			.closest("form") as HTMLFormElement,
	);
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Choose or create a customer profile.",
	);
	expect(api.POST).not.toHaveBeenCalled();
});

it("preserves a failed customer creation and reuses its identity without allowing a pending sale", async () => {
	let reject: ((reason: Error) => void) | undefined;
	vi.mocked(api.POST).mockImplementationOnce(
		(() =>
			new Promise((_resolve, fail) => {
				reject = fail;
			})) as never,
	);
	vi.mocked(api.POST).mockImplementationOnce((() =>
		ok({
			id: "retry-customer",
			name: "Asha",
			phone: "",
			email: "",
			hasOnlineAccount: false,
		})) as never);
	open();
	fireEvent.click(screen.getByText("Create a customer", { exact: true }));
	fireEvent.change(screen.getByLabelText("Customer name"), {
		target: { value: "Asha" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create customer" }));
	await waitFor(() =>
		expect(screen.getByRole("button", { name: "Sell pass" })).toBeDisabled(),
	);
	expect(
		screen.getByRole("radio", { name: "Online account email" }),
	).toBeDisabled();
	reject?.(new TypeError("Lost response"));
	await screen.findByRole("alert");
	expect(screen.getByLabelText("Customer name")).toHaveValue("Asha");
	fireEvent.click(screen.getByRole("button", { name: "Create customer" }));
	await waitFor(() =>
		expect(
			screen.getByRole("combobox", { name: "Customer profile" }),
		).toHaveValue("retry-customer"),
	);
	const calls = vi.mocked(api.POST).mock.calls as unknown as [
		string,
		{ params: { header: { "Idempotency-Key": string } } },
	][];
	expect(calls[0]?.[1].params.header["Idempotency-Key"]).toBe(
		calls[1]?.[1].params.header["Idempotency-Key"],
	);
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
	vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-29T00:00:00Z"));
	state.roles = ["MANAGER"];
	vi.mocked(api.GET).mockImplementation(((
		_path: unknown,
		options: { params: { query: { cursor?: string } } },
	) =>
		paged({
			data: [
				{
					...pass,
					id: options.params.query.cursor ? "pass2" : "pass",
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
	fireEvent.click(
		within(screen.getByRole("article", { name: "Pass PAGE2" })).getByRole(
			"button",
			{ name: "Renew" },
		),
	);
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

it("focuses renewal on opening and returns focus on close", async () => {
	vi.mocked(api.GET).mockImplementation((() =>
		paged({
			data: [{ ...pass, status: "ACTIVE", duePaisa: 0 }],
			page: { next: null, previous: null },
		})) as never);
	open();
	const trigger = await screen.findByRole("button", { name: "Renew" });
	trigger.focus();
	fireEvent.click(trigger);
	expect(screen.getByRole("heading", { name: "Renew PASS001" })).toHaveFocus();
	fireEvent.click(screen.getByRole("button", { name: "Close renewal" }));
	expect(trigger).toHaveFocus();
});

it("reports invalid sale dates without sending a write", async () => {
	open();
	fireEvent.change(await screen.findByLabelText("Starts at"), {
		target: { value: "2026-11-29T10:00" },
	});
	fireEvent.change(screen.getByLabelText("Ends at"), {
		target: { value: "2026-10-29T10:00" },
	});
	fireEvent.submit(
		screen
			.getByRole("button", { name: "Sell pass" })
			.closest("form") as HTMLFormElement,
	);
	expect(await screen.findByRole("alert")).toHaveTextContent("positive price");
	expect(api.POST).not.toHaveBeenCalled();
});

it("reuses the payment key after a lost response and prevents a repeated successful collection", async () => {
	state.roles = ["CASHIER"];
	vi.mocked(api.POST).mockRejectedValueOnce(new TypeError("Lost response"));
	vi.mocked(api.POST).mockImplementationOnce((() =>
		ok({ receiptId: "receipt", receiptNumber: "NG-001" })) as never);
	open();
	fireEvent.click(await screen.findByRole("button", { name: /Take cash/ }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"could not be reached",
	);
	fireEvent.click(screen.getByRole("button", { name: /Take cash/ }));
	await screen.findByRole("link", { name: "Receipt NG-001" });
	const calls = vi.mocked(api.POST).mock.calls as unknown as [
		string,
		{ params: { header: { "Idempotency-Key": string } } },
	][];
	expect(calls[0]?.[1].params.header["Idempotency-Key"]).toBe(
		calls[1]?.[1].params.header["Idempotency-Key"],
	);
	expect(screen.getByRole("button", { name: /Take cash/ })).toBeDisabled();
});

it("keeps auditors read-only", async () => {
	state.roles = ["AUDITOR"];
	open();
	await screen.findByText("PASS001");
	expect(
		screen.queryByRole("button", { name: /Take cash|Sell pass|Renew/ }),
	).not.toBeInTheDocument();
});
