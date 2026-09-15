import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ParkPage } from "./ParkPage";

vi.mock("../api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("../api/client")>()),
	api: { GET: vi.fn(), POST: vi.fn() },
}));

const location = {
	id: "location-ngc",
	name: "North Gate Central",
	organisationName: "North Gate Parking",
	address: "Durbar Marg, Kathmandu",
	latitude: 27.712,
	longitude: 85.3178,
	timezone: "Asia/Kathmandu",
	reservableBays: 6,
};

const held = {
	id: "reservation-1",
	reference: "K7M2Q9XA",
	organisationName: "North Gate Parking",
	locationId: location.id,
	locationName: location.name,
	locationAddress: location.address,
	timezone: "Asia/Kathmandu",
	bayId: "bay-r01",
	bayLabel: "R01",
	vehicleClass: "CAR",
	plate: "BA 2 PA 2002",
	customerName: "Asha",
	startsAt: "2026-09-15T04:45:00Z",
	endsAt: "2026-09-15T05:45:00Z",
	arrivalOpensAt: "2026-09-15T04:35:00Z",
	arrivalClosesAt: "2026-09-15T05:00:00Z",
	status: "HOLD",
	holdExpiresAt: "2026-09-15T03:05:00Z",
	cancelReason: "",
	conflict: false,
	revision: 1,
	createdAt: "2026-09-15T03:00:00Z",
};

const ok = (data: unknown) =>
	Promise.resolve({ data: { data }, response: new Response() });

describe("ParkPage", () => {
	it("holds a bay for a local arrival time and confirms it", async () => {
		vi.mocked(api.GET).mockImplementation(((path: string) => {
			switch (path) {
				case "/api/v1/auth/session":
					return ok({
						user: { id: "user-1", email: "asha@customer.test", name: "Asha" },
						memberships: [],
						activeOrganisationId: null,
					});
				case "/api/v1/public/locations":
					return ok([location]);
				default:
					return ok({
						locationId: location.id,
						vehicleClass: "CAR",
						startsAt: held.startsAt,
						endsAt: held.endsAt,
						availableBays: 3,
						asOf: "2026-09-15T03:00:00Z",
					});
			}
		}) as never);
		vi.mocked(api.POST).mockImplementation(((path: string) =>
			ok(
				path.endsWith("/confirm") ? { ...held, status: "CONFIRMED" } : held,
			)) as never);

		render(
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter>
					<ParkPage />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Reserve at North Gate Central",
			}),
		);
		fireEvent.change(screen.getByLabelText("Arrival"), {
			target: { value: "2026-09-15T10:30" },
		});
		expect(await screen.findByText("3 bays free for this time.")).toBeVisible();
		fireEvent.change(await screen.findByLabelText("Plate"), {
			target: { value: "BA 2 PA 2002" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Hold a bay" }));
		fireEvent.click(
			await screen.findByRole("button", { name: "Confirm reservation" }),
		);

		expect(await screen.findByRole("status")).toHaveTextContent(
			"Reservation K7M2Q9XA is confirmed.",
		);
		// api.POST is overloaded per path, so its recorded calls type as never.
		const calls = vi.mocked(api.POST).mock.calls as unknown as [
			string,
			{ body?: unknown; params: { header?: Record<string, string> } },
		][];
		expect(calls[0]?.[0]).toBe("/api/v1/customer/reservations");
		// 10:30 in Kathmandu (UTC+05:45) is 04:45 UTC, whatever the browser's own zone.
		expect(calls[0]?.[1].body).toEqual({
			locationId: location.id,
			vehicleClass: "CAR",
			plate: "BA 2 PA 2002",
			startsAt: "2026-09-15T04:45:00.000Z",
			endsAt: "2026-09-15T05:45:00.000Z",
		});
		expect(calls[0]?.[1].params.header?.["Idempotency-Key"]).toBeTruthy();
		expect(calls[1]?.[0]).toBe("/api/v1/reservations/{reservation_id}/confirm");
	});
});
