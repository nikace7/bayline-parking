import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../api/client";
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
	Promise.resolve({
		data: {
			data,
			...(Array.isArray(data) ? { page: { next: null, previous: null } } : {}),
		},
		response: new Response(),
	});

describe("ReservationsPage", () => {
	async function showDirectory(roles = ["OWNER"]) {
		vi.mocked(api.POST).mockClear();
		vi.mocked(api.GET).mockImplementation(((path: string) => {
			if (path === "/api/v1/auth/session")
				return ok({
					user: { id: "user-1", email: "owner@example.test", name: "Demo" },
					memberships: [
						{ organisationId: "org-1", organisationName: "Parking", roles },
					],
					activeOrganisationId: "org-1",
				});
			if (path === "/api/v1/locations") return ok([location]);
			if (path === "/api/v1/locations/{location_id}/bays")
				return ok([bay("bay-r02", "R02", "RESERVABLE")]);
			return ok([
				waiting,
				{
					...waiting,
					id: "other",
					reference: "OTHER123",
					plate: "XY 99",
					customerName: "Alex Morgan",
					status: "COMPLETED",
					conflict: false,
				},
			]);
		}) as never);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ReservationsPage />
				</MemoryRouter>
			</QueryClientProvider>,
		);
		await screen.findByText("Bay still occupied");
		return client;
	}

	it("finishes cancellation when terminal refresh data commits before its success callback", async () => {
		const client = await showDirectory();
		let cancelled = false;
		const cancelledRecord = {
			...waiting,
			status: "CANCELLED",
			conflict: false,
		};
		const get = vi.mocked(api.GET).getMockImplementation();
		vi.mocked(api.GET).mockImplementation(((
			path: string,
			...args: unknown[]
		) => {
			if (path === "/api/v1/reservations")
				return ok([cancelled ? cancelledRecord : waiting]);
			return (get as (...args: unknown[]) => unknown)(path, ...args);
		}) as never);
		vi.mocked(api.POST).mockImplementation((() => {
			cancelled = true;
			return ok(cancelledRecord);
		}) as never);
		let release = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const invalidate = client.invalidateQueries.bind(client);
		vi.spyOn(client, "invalidateQueries").mockImplementation(
			async (filters, options) => {
				await invalidate(filters, options);
				if (filters?.queryKey?.[0] === "reservations") await gate;
			},
		);
		fireEvent.click(screen.getByRole("button", { name: "Cancel B4N8R2TT" }));
		fireEvent.change(screen.getByLabelText("Reason"), {
			target: { value: "Customer requested" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Cancel reservation" }));
		try {
			await screen.findByText("Cancelled");
			expect(screen.queryByRole("status")).not.toBeInTheDocument();
			expect(screen.getByLabelText("Reason")).toHaveValue("Customer requested");
		} finally {
			release();
		}
		expect(await screen.findByRole("status")).toHaveTextContent(
			"Reservation B4N8R2TT cancelled.",
		);
		expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Find reservation")).toHaveFocus();
	});

	it("searches plate, customer and reference, combines status/conflict filters and resets them", async () => {
		await showDirectory();
		const search = screen.getByLabelText("Find reservation");
		fireEvent.change(search, { target: { value: "ba3pa3003" } });
		expect(screen.getByText("Bina")).toBeVisible();
		expect(screen.queryByText("Alex Morgan")).not.toBeInTheDocument();
		fireEvent.change(search, { target: { value: "alex morgan" } });
		expect(screen.getByText("Alex Morgan")).toBeVisible();
		fireEvent.change(search, { target: { value: "other123" } });
		expect(screen.getByText("XY 99")).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "Bay conflicts (1)" }));
		expect(
			screen.getByText("No reservations match your filters."),
		).toBeVisible();
		fireEvent.click(
			screen.getByRole("button", { name: "Clear reservation filters" }),
		);
		expect(search).toHaveFocus();
		fireEvent.change(screen.getByLabelText("Reservation status"), {
			target: { value: "COMPLETED" },
		});
		expect(screen.getByText("Alex Morgan")).toBeVisible();
		expect(screen.queryByText("Bina")).not.toBeInTheDocument();
		expect(api.POST).not.toHaveBeenCalled();
	});

	it("focuses action details on every activation and retains the draft when filtering", async () => {
		await showDirectory();
		const trigger = screen.getByRole("button", { name: "Cancel B4N8R2TT" });
		fireEvent.click(trigger);
		const details = screen.getByRole("region", { name: "Reservation action" });
		expect(details).toHaveFocus();
		fireEvent.change(screen.getByLabelText("Reason"), {
			target: { value: "Customer requested" },
		});
		screen.getByLabelText("Find reservation").focus();
		fireEvent.click(trigger);
		expect(details).toHaveFocus();
		fireEvent.change(screen.getByLabelText("Find reservation"), {
			target: { value: "no match" },
		});
		expect(screen.getByLabelText("Reason")).toHaveValue("Customer requested");
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(screen.getByLabelText("Find reservation")).toHaveFocus();
		expect(api.POST).not.toHaveBeenCalled();
	});

	it("returns focus to the action button on close and clears the action on a day change", async () => {
		await showDirectory();
		const trigger = screen.getByRole("button", { name: "Move B4N8R2TT" });
		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(trigger).toHaveFocus();
		fireEvent.click(trigger);
		fireEvent.change(screen.getByLabelText("Date"), {
			target: { value: "2026-12-01" },
		});
		expect(screen.queryByLabelText("Move to bay")).not.toBeInTheDocument();
	});

	it("retains the draft but prevents another action after a remote cancellation", async () => {
		const client = await showDirectory();
		fireEvent.click(screen.getByRole("button", { name: "Cancel B4N8R2TT" }));
		fireEvent.change(screen.getByLabelText("Reason"), {
			target: { value: "Draft reason" },
		});
		await act(async () => {
			client.setQueriesData({ queryKey: ["reservations"] }, [
				{ ...waiting, status: "CANCELLED", conflict: false },
			]);
		});
		await screen.findByText("This reservation can no longer be cancelled.");
		expect(screen.getByLabelText("Reason")).toHaveValue("Draft reason");
		expect(
			screen.getByRole("button", { name: "Cancel reservation" }),
		).toBeDisabled();
		expect(
			screen.queryByRole("button", { name: "Cancel B4N8R2TT" }),
		).not.toBeInTheDocument();
		expect(api.POST).not.toHaveBeenCalled();
	});

	it("hides stale results while retaining the draft when background refresh fails", async () => {
		const client = await showDirectory();
		fireEvent.click(screen.getByRole("button", { name: "Cancel B4N8R2TT" }));
		const reason = screen.getByLabelText("Reason");
		fireEvent.change(reason, { target: { value: "Keep this draft" } });
		reason.focus();
		vi.mocked(api.GET).mockRejectedValue(new Error("Refresh unavailable"));
		await act(async () => {
			await client.invalidateQueries({ queryKey: ["reservations"] });
		});
		expect(await screen.findByRole("alert")).toBeVisible();
		expect(reason).toHaveValue("Keep this draft");
		expect(reason).not.toBeVisible();
		expect(screen.getByText("Bina")).not.toBeVisible();
	});

	it.each([401, 403])(
		"hides cached records and action drafts when access is denied (%s)",
		async (status) => {
			const client = await showDirectory();
			const get = vi.mocked(api.GET).getMockImplementation();
			fireEvent.click(screen.getByRole("button", { name: "Cancel B4N8R2TT" }));
			vi.mocked(api.GET).mockRejectedValue(new ApiError(status, null));
			await act(async () => {
				await client.invalidateQueries({ queryKey: ["reservations"] });
			});
			expect(await screen.findByRole("alert")).toBeVisible();
			expect(screen.getByText("Bina")).not.toBeVisible();
			expect(screen.getByLabelText("Reason")).not.toBeVisible();
			expect(
				screen.queryByRole("list", { name: "Reservation results" }),
			).not.toBeInTheDocument();
			vi.mocked(api.GET).mockRejectedValue(new Error("Connection lost"));
			await act(async () => {
				await client.invalidateQueries({ queryKey: ["reservations"] });
			});
			await screen.findByText(
				"Bayline could not be reached. Check the connection and retry.",
			);
			expect(
				screen.queryByRole("list", { name: "Reservation results" }),
			).not.toBeInTheDocument();
			if (!get) throw new Error("Expected the fixture GET implementation");
			cleanup();
			render(
				<QueryClientProvider client={client}>
					<MemoryRouter>
						<ReservationsPage />
					</MemoryRouter>
				</QueryClientProvider>,
			);
			expect(await screen.findByRole("alert")).toBeVisible();
			expect(
				screen.queryByRole("list", { name: "Reservation results" }),
			).not.toBeInTheDocument();
			vi.mocked(api.GET).mockImplementation(get);
			await act(async () => {
				await client.invalidateQueries({ queryKey: ["reservations"] });
			});
			expect(await screen.findByText("Bina")).toBeVisible();
		},
	);

	it("keeps read-only staff free of management actions", async () => {
		await showDirectory(["AUDITOR"]);
		expect(
			screen.queryByRole("button", { name: /^Move / }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /^Cancel / }),
		).not.toBeInTheDocument();
		expect(screen.getByLabelText("Find reservation")).toBeVisible();
	});

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
