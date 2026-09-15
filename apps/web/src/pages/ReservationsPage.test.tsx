import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ReservationsPage } from "./ReservationsPage";

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

const bay = (id: string, label: string, mode: string) => ({
	id,
	locationId: location.id,
	label,
	vehicleClass: "CAR",
	mode,
	state: "ACTIVE",
	revision: 1,
	createdAt: "2026-09-14T02:00:00Z",
});

// Bina's reservation waits for R01 while an earlier vehicle overstays there.
const waiting = {
	id: "reservation-2",
	reference: "B4N8R2TT",
	organisationName: "North Gate Parking",
	locationId: location.id,
	locationName: location.name,
	locationAddress: location.address,
	timezone: "Asia/Kathmandu",
	bayId: "bay-r01",
	bayLabel: "R01",
	vehicleClass: "CAR",
	plate: "BA 3 PA 3003",
	customerName: "Bina",
	startsAt: "2026-09-15T05:00:00Z",
	endsAt: "2026-09-15T06:00:00Z",
	arrivalOpensAt: "2026-09-15T04:50:00Z",
	arrivalClosesAt: "2026-09-15T05:15:00Z",
	status: "CONFIRMED",
	holdExpiresAt: "2026-09-15T03:05:00Z",
	cancelReason: "",
	conflict: true,
	revision: 2,
	createdAt: "2026-09-15T03:00:00Z",
};

const ok = (data: unknown) =>
	Promise.resolve({ data: { data }, response: new Response() });

describe("ReservationsPage", () => {
	it("flags an overstay conflict and moves the reservation to a compatible bay", async () => {
		let moved = false;
		const relocated = {
			...waiting,
			bayId: "bay-r02",
			bayLabel: "R02",
			conflict: false,
			revision: 3,
		};
		vi.mocked(api.GET).mockImplementation(((path: string) => {
			switch (path) {
				case "/api/v1/auth/session":
					return ok({
						user: { id: "user-1", email: "owner@northgate.test", name: "Demo" },
						memberships: [
							{
								organisationId: "org-1",
								organisationName: "North Gate Parking",
								roles: ["OWNER"],
							},
						],
						activeOrganisationId: "org-1",
					});
				case "/api/v1/locations":
					return ok([location]);
				case "/api/v1/locations/{location_id}/bays":
					return ok([
						bay("bay-a01", "A01", "WALK_IN"),
						bay("bay-r01", "R01", "RESERVABLE"),
						bay("bay-r02", "R02", "RESERVABLE"),
					]);
				default:
					return ok([moved ? relocated : waiting]);
			}
		}) as never);
		vi.mocked(api.POST).mockImplementation((() => {
			moved = true;
			return ok(relocated);
		}) as never);

		render(
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter>
					<ReservationsPage />
				</MemoryRouter>
			</QueryClientProvider>,
		);

		expect(await screen.findByText("Bay still occupied")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Move B4N8R2TT" }));
		const target = await screen.findByLabelText("Move to bay");
		await vi.waitFor(() =>
			expect(
				within(target)
					.getAllByRole("option")
					.map((option) => option.textContent),
			).toEqual(["Choose a bay", "R02"]),
		);
		fireEvent.change(target, { target: { value: "bay-r02" } });
		fireEvent.click(screen.getByRole("button", { name: "Move reservation" }));

		expect(await screen.findByRole("status")).toHaveTextContent(
			"Reservation B4N8R2TT moved to bay R02.",
		);
		// api.POST is overloaded per path, so its recorded calls type as never.
		const calls = vi.mocked(api.POST).mock.calls as unknown as [
			string,
			unknown,
		][];
		expect(calls[0]).toEqual([
			"/api/v1/reservations/{reservation_id}/relocate",
			{
				params: { path: { reservation_id: "reservation-2" } },
				body: { bayId: "bay-r02", expectedRevision: 2 },
			},
		]);
		expect(await screen.findByText("R02")).toBeVisible();
	});
});
