import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { OperationsPage } from "./OperationsPage";

vi.mock("../app/sites", () => ({
	useLocations: () => ({
		data: [{ id: "loc", name: "Central", timezone: "Asia/Kathmandu" }],
		isSuccess: true,
	}),
	useBays: () => ({
		data: [
			{
				id: "a",
				label: "A01",
				state: "ACTIVE",
				mode: "WALK_IN",
				vehicleClass: "CAR",
			},
			{
				id: "b",
				label: "A02",
				state: "ACTIVE",
				mode: "WALK_IN",
				vehicleClass: "CAR",
			},
		],
	}),
}));
vi.mock("../app/gate", () => ({
	useActiveRoles: () => ["AUDITOR"],
	useParkedVisits: () => ({
		data: [
			{
				id: "visit",
				bayId: "a",
				plate: "BA 1234",
				enteredAt: "2026-10-30T03:00:00Z",
			},
		],
		dataUpdatedAt: Date.parse("2026-10-30T04:00:00Z"),
	}),
}));
vi.mock("../app/reservations", () => ({
	useStaffReservations: () => ({ data: [] }),
	dueReservation: () => undefined,
}));
vi.mock("./GatePanels", () => ({
	ArrivalPanel: () => null,
	EntryPanel: () => null,
	ShiftBar: () => null,
	VisitPanel: () => null,
}));

it("filters bays by plate/status without changing the site's occupancy totals", () => {
	render(
		<MemoryRouter>
			<OperationsPage />
		</MemoryRouter>,
	);
	const search = screen.getByLabelText("Search bays or plates");
	fireEvent.change(search, { target: { value: "ba 1234" } });
	expect(screen.getByRole("button", { name: /^Bay A01/ })).toBeVisible();
	expect(
		screen.queryByRole("button", { name: /^Bay A02/ }),
	).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Bay status"), {
		target: { value: "available" },
	});
	expect(screen.getByText("No bays match your filters.")).toBeVisible();
	expect(
		screen.getByText("Parked", { exact: true }).parentElement,
	).toHaveTextContent("1");
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect(screen.getByRole("button", { name: /^Bay A02/ })).toBeVisible();
});
