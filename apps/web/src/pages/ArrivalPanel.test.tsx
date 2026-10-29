import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ArrivalPanel } from "./GatePanels";

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

const bay = {
	id: "bay-r01",
	locationId: location.id,
	label: "R01",
	vehicleClass: "CAR" as const,
	mode: "RESERVABLE" as const,
	state: "ACTIVE" as const,
	revision: 1,
	createdAt: "2026-09-14T02:00:00Z",
};

const confirmed = {
	id: "reservation-1",
	reference: "K7M2Q9XA",
	organisationName: "North Gate Parking",
	locationId: location.id,
	locationName: location.name,
	locationAddress: location.address,
	timezone: "Asia/Kathmandu",
	bayId: bay.id,
	bayLabel: "R01",
	vehicleClass: "CAR",
	plate: "BA 2 PA 2002",
	customerName: "Asha",
	startsAt: "2026-09-15T04:45:00Z",
	endsAt: "2026-09-15T05:45:00Z",
	arrivalOpensAt: "2026-09-15T04:35:00Z",
	arrivalClosesAt: "2026-09-15T05:00:00Z",
	status: "CONFIRMED",
	holdExpiresAt: "2026-09-15T03:05:00Z",
	cancelReason: "",
	conflict: false,
	revision: 2,
	createdAt: "2026-09-15T03:00:00Z",
};

const ok = (data: unknown) =>
	Promise.resolve({
		data: {
			data,
			...(Array.isArray(data) ? { page: { next: null, previous: null } } : {}),
		},
		response: new Response(),
	});

describe("ArrivalPanel", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("checks in the reservation whose arrival window is open", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-09-15T04:40:00Z"));
		vi.mocked(api.GET).mockImplementation((() => ok([confirmed])) as never);
		vi.mocked(api.POST).mockImplementation((() =>
			ok({ id: "visit-1" })) as never);

		render(
			<QueryClientProvider client={new QueryClient()}>
				<ArrivalPanel bay={bay} location={location} />
			</QueryClientProvider>,
		);

		expect(
			await screen.findByRole("heading", { name: "Check in to bay R01" }),
		).toBeVisible();
		fireEvent.change(screen.getByLabelText("Plate"), {
			target: { value: "BA 2 PA 2002" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Confirm check-in" }));

		await vi.waitFor(() => expect(api.POST).toHaveBeenCalled());
		// api.POST is overloaded per path, so its recorded calls type as never.
		const calls = vi.mocked(api.POST).mock.calls as unknown as [
			string,
			{ body: unknown },
		][];
		expect(calls[0]?.[0]).toBe("/api/v1/parking/entries");
		expect(calls[0]?.[1].body).toEqual({
			locationId: location.id,
			bayId: bay.id,
			plate: "BA 2 PA 2002",
			vehicleClass: "CAR",
			reservationId: "reservation-1",
		});
	});
});
