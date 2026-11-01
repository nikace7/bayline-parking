import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { VisitPanel } from "./GatePanels";

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
	createdAt: "2026-09-14T03:00:00Z",
};

const fee = {
	billableSeconds: 1801,
	blocks: 2,
	basePaisa: 10_000,
	discountPaisa: 0,
	taxPaisa: 0,
	totalPaisa: 10_000,
};

const parked = {
	id: "visit-1",
	locationId: location.id,
	bayId: "bay-a01",
	bayLabel: "A01",
	plate: "BA 12 PA 3456",
	vehicleClass: "CAR",
	tariffId: "tariff-car",
	status: "PARKED",
	enteredAt: "2026-09-14T03:00:00Z",
	exitedAt: null,
	stage: "PARKED",
	totalPaisa: null,
	paidPaisa: 0,
	duePaisa: null,
	invoice: null,
};

const pending = {
	...parked,
	stage: "CHECKOUT_PENDING",
	totalPaisa: 10_000,
	duePaisa: 10_000,
	invoice: {
		id: "invoice-1",
		cutoffAt: "2026-09-14T03:35:01Z",
		status: "CONFIRMED",
		createdAt: "2026-09-14T03:35:02Z",
		...fee,
	},
};

const ok = (data: unknown) =>
	Promise.resolve({
		data: {
			data,
			...(Array.isArray(data) ? { page: { next: null, previous: null } } : {}),
		},
		response: new Response(),
	});

function serve({
	shiftLocationId,
	stage = "PARKED",
}: {
	shiftLocationId: string | null;
	stage?: string;
}) {
	let visit: Record<string, unknown> = { ...parked, stage };
	vi.mocked(api.GET).mockImplementation(((path: string) =>
		path === "/api/v1/shifts/current"
			? ok({
					shift: shiftLocationId && {
						id: "shift-1",
						locationId: shiftLocationId,
						locationName: "North Gate Central",
						openingFloatPaisa: 100_000,
						openedAt: "2026-09-14T02:30:00Z",
						closedAt: null,
					},
				})
			: ok(visit)) as never);
	vi.mocked(api.POST).mockImplementation(((path: string) => {
		if (path.endsWith("/quote")) {
			return ok({
				quoteToken: "signed-token",
				cutoffAt: "2026-09-14T03:35:01Z",
				expiresAt: "2026-09-14T03:37:01Z",
				...fee,
			});
		}
		visit = pending;
		return ok(pending);
	}) as never);
}

function renderPanel(permissions = { canCheckout: true, canExit: true }) {
	render(
		<QueryClientProvider client={new QueryClient()}>
			<VisitPanel
				visitId="visit-1"
				location={location}
				canTakeCash
				{...permissions}
				onExited={vi.fn()}
			/>
		</QueryClientProvider>,
	);
}

describe("VisitPanel", () => {
	beforeEach(() => vi.clearAllMocks());
	it("keeps checkout read-only when the role cannot check out vehicles", async () => {
		serve({ shiftLocationId: null });
		renderPanel({ canCheckout: false, canExit: false });
		await screen.findByText(parked.plate);
		expect(
			screen.queryByRole("button", { name: "Get checkout quote" }),
		).not.toBeInTheDocument();
		expect(api.POST).not.toHaveBeenCalled();
	});

	it("lets a cashier see readiness without offering the forbidden exit action", async () => {
		serve({ shiftLocationId: location.id, stage: "EXIT_READY" });
		renderPanel({ canCheckout: true, canExit: false });
		await screen.findByText("Ready to exit");
		expect(
			screen.queryByRole("button", { name: "Record exit" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByText("An owner or operator records the exit at the gate."),
		).toBeVisible();
	});

	it("quotes, confirms checkout with an idempotency key, then offers cash for the amount due", async () => {
		serve({ shiftLocationId: location.id });
		renderPanel();

		fireEvent.click(
			await screen.findByRole("button", { name: "Get checkout quote" }),
		);
		expect(await screen.findByText(/Quote valid until 09:22:01/)).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Confirm checkout" }));

		expect(
			await screen.findByRole("button", { name: "Take cash NPR 100.00" }),
		).toBeVisible();
		// api.POST is overloaded per path, so its recorded calls type as never.
		const calls = vi.mocked(api.POST).mock.calls as unknown as [
			string,
			unknown,
		][];
		const checkout = calls.find(([path]) => path.endsWith("/checkout"));
		expect(checkout?.[1]).toMatchObject({
			body: { quoteToken: "signed-token" },
			params: { header: { "Idempotency-Key": expect.any(String) } },
		});
	});

	it("explains that cash needs a shift at this location", async () => {
		serve({ shiftLocationId: "location-elsewhere" });
		renderPanel();

		fireEvent.click(
			await screen.findByRole("button", { name: "Get checkout quote" }),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Confirm checkout" }),
		);

		expect(
			await screen.findByText(
				"Open a cash shift at this location to take cash.",
			),
		).toBeVisible();
		expect(screen.queryByRole("button", { name: /Take cash/ })).toBeNull();
	});
});
