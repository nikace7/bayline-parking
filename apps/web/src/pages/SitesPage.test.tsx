import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { SitesPage } from "./SitesPage";

vi.mock("../api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("../api/client")>()),
	api: { GET: vi.fn() },
}));

const location = {
	id: "5f0c7c1e-4a64-4d41-9d0e-2a1b3c4d5e6f",
	name: "North Gate Central",
	address: "Durbar Marg, Kathmandu",
	latitude: 27.712,
	longitude: 85.3178,
	receiptPrefix: "NGC",
	timezone: "Asia/Kathmandu",
	enabled: true,
	createdAt: "2026-09-14T03:00:00Z",
};

const bay = (label: string, mode: string, state = "ACTIVE") => ({
	id: `bay-${label}`,
	locationId: location.id,
	label,
	vehicleClass: "CAR",
	mode,
	state,
	createdAt: "2026-09-14T03:00:00Z",
});

const tariff = (
	id: string,
	vehicleClass: string,
	effectiveFrom: string,
	status: string,
	overrides = {},
) => ({
	id,
	locationId: location.id,
	vehicleClass,
	effectiveFrom,
	graceSeconds: 300,
	blockSeconds: 1800,
	blockPaisa: 5000,
	dailyCapPaisa: null,
	taxBps: 0,
	status,
	createdAt: effectiveFrom,
	...overrides,
});

const responses: Record<string, unknown> = {
	"/api/v1/locations": [location],
	"/api/v1/locations/{location_id}/bays": [
		bay("A01", "WALK_IN"),
		bay("A02", "WALK_IN", "OUT_OF_SERVICE"),
		bay("R01", "RESERVABLE"),
	],
	"/api/v1/locations/{location_id}/tariffs": [
		tariff("old-car", "CAR", "2026-09-01T00:00:00Z", "SUPERSEDED", {
			blockPaisa: 4000,
		}),
		tariff("bike", "MOTORBIKE", "2026-10-01T00:00:00Z", "SCHEDULED", {
			blockPaisa: 2000,
			taxBps: 1300,
		}),
		tariff("car", "CAR", "2026-09-14T03:00:00Z", "CURRENT"),
	],
};

vi.mocked(api.GET).mockImplementation(((path: string) =>
	Promise.resolve({
		data: { data: responses[path] },
		response: new Response(),
	})) as never);

describe("SitesPage", () => {
	it("shows the location, its tariff versions grouped by class and its bays", async () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<SitesPage />
			</QueryClientProvider>,
		);

		expect(
			await screen.findByRole("heading", { name: "North Gate Central" }),
		).toBeInTheDocument();
		expect(
			await screen.findByText("2 walk-in · 1 reservable"),
		).toBeInTheDocument();
		expect(screen.getByText("Out of service")).toBeInTheDocument();

		const table = await screen.findByRole("table", { name: "Tariff versions" });
		const [, current, superseded, scheduled] =
			within(table).getAllByRole("row");
		expect(current).toHaveTextContent(
			/Car.*5 min.*30 min.*NPR 50\.00.*In force/,
		);
		expect(superseded).toHaveTextContent(/NPR 40\.00.*Superseded/);
		expect(scheduled).toHaveTextContent(
			/Motorbike.*NPR 20\.00.*13%.*Scheduled/,
		);
	});
});
