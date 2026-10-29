import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ShiftsPage } from "./ShiftsPage";

vi.mock("../api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("../api/client")>()),
	api: { GET: vi.fn(), POST: vi.fn() },
}));

const location = {
	id: "location-ngc",
	name: "North Gate Central",
	address: "Durbar Marg, Kathmandu",
	latitude: 27.712,
	longitude: 85.3178,
	receiptPrefix: "NGC",
	timezone: "Asia/Kathmandu",
	enabled: true,
	createdAt: "2026-09-14T02:00:00Z",
};

const openShift = {
	id: "shift-1",
	locationId: location.id,
	locationName: location.name,
	operatorName: "Demo Cashier",
	openingFloatPaisa: 100_000,
	openedAt: "2026-09-14T02:30:00Z",
	closedAt: null,
	countedCashPaisa: null,
	expectedCashPaisa: null,
	variancePaisa: null,
};

// Blueprint fixture: NPR 1,000 float plus NPR 300 taken; the drawer counts NPR 1,280.
const closedShift = {
	...openShift,
	closedAt: "2026-09-14T12:00:00Z",
	countedCashPaisa: 128_000,
	expectedCashPaisa: 130_000,
	variancePaisa: -2_000,
};

const ok = (data: unknown) =>
	Promise.resolve({
		data: {
			data,
			...(Array.isArray(data) ? { page: { next: null, previous: null } } : {}),
		},
		response: new Response(),
	});

function serve() {
	let closed = false;
	const summary = (shift: typeof openShift | typeof closedShift) => ({
		shift,
		captureCount: 3,
		cashCapturedPaisa: 30_000,
		expectedCashPaisa: 130_000,
	});
	vi.mocked(api.GET).mockImplementation(((path: string) => {
		switch (path) {
			case "/api/v1/auth/session":
				return ok({
					user: { id: "user-1", email: "cashier@northgate.test", name: "Demo" },
					memberships: [
						{
							organisationId: "org-1",
							organisationName: "North Gate Parking",
							roles: ["CASHIER"],
						},
					],
					activeOrganisationId: "org-1",
				});
			case "/api/v1/locations":
				return ok([location]);
			case "/api/v1/shifts/current":
				return ok({ shift: closed ? null : openShift });
			case "/api/v1/shifts/{shift_id}/summary":
				return ok(summary(openShift));
			default:
				return ok(closed ? [closedShift] : []);
		}
	}) as never);
	vi.mocked(api.POST).mockImplementation((() => {
		closed = true;
		return ok(summary(closedShift));
	}) as never);
}

describe("ShiftsPage", () => {
	it("previews the variance while counting, then closes the shift", async () => {
		serve();
		render(
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter>
					<ShiftsPage />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		expect(await screen.findByText("NPR 1,300.00")).toBeVisible();
		fireEvent.change(screen.getByLabelText("Counted cash (NPR)"), {
			target: { value: "1280" },
		});
		expect(
			screen.getByText(
				"Against the expected NPR 1,300.00: Short by NPR 20.00.",
			),
		).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Close shift" }));

		expect(await screen.findByRole("status")).toHaveTextContent(
			"Shift closed. Expected NPR 1,300.00, counted NPR 1,280.00: Short by NPR 20.00.",
		);
		// api.POST is overloaded per path, so its recorded calls type as never.
		const calls = vi.mocked(api.POST).mock.calls as unknown as [
			string,
			unknown,
		][];
		expect(calls[0]).toEqual([
			"/api/v1/shifts/{shift_id}/close",
			{
				params: { path: { shift_id: "shift-1" } },
				body: { countedCashPaisa: 128_000 },
			},
		]);
		const table = await screen.findByRole("table");
		expect(await within(table).findByText("Short by NPR 20.00")).toBeVisible();
		expect(
			screen.getByText("No cash shift is open.", { exact: false }),
		).toBeVisible();
	});
});
