import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { OperationsPage } from "./OperationsPage";

vi.mock("./OpenLotBoard", () => ({
	OpenLotBoard: () => <input aria-label="Open-lot draft" />,
}));

const state = vi.hoisted(() => ({ roles: ["AUDITOR"], queryError: false }));
beforeEach(() => {
	state.roles = ["AUDITOR"];
	state.queryError = false;
});

vi.mock("../app/sites", () => ({
	useLocations: () => ({
		data: [{ id: "loc", name: "Central", timezone: "Asia/Kathmandu" }],
		isSuccess: true,
	}),
	useBays: () => ({
		isError: state.queryError,
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
	useActiveRoles: () => state.roles,
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
	EntryPanel: () => <button type="button">Confirm entry</button>,
	ShiftBar: () => null,
	VisitPanel: () => null,
}));

it.each(["CASHIER", "MANAGER", "AUDITOR"])(
	"does not offer admission to a %s",
	(role) => {
		state.roles = [role];
		render(
			<MemoryRouter>
				<OperationsPage />
			</MemoryRouter>,
		);
		fireEvent.click(screen.getByRole("button", { name: /^Bay A02,/ }));
		expect(
			screen.queryByRole("button", { name: "Confirm entry" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(
				"Only owners and operators can admit vehicles at the gate.",
			),
		).toBeVisible();
	},
);

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

it("keeps the open-lot subtree mounted when cached occupancy has a background error", () => {
	const view = (
		<MemoryRouter>
			<OperationsPage />
		</MemoryRouter>
	);
	const { rerender } = render(view);
	fireEvent.change(screen.getByLabelText("Open-lot draft"), {
		target: { value: "BA 5 PA 5555" },
	});
	state.queryError = true;
	rerender(
		<MemoryRouter>
			<OperationsPage />
		</MemoryRouter>,
	);
	expect(screen.getByRole("alert")).toHaveTextContent(
		"Showing the last loaded view",
	);
	expect(screen.getByLabelText("Open-lot draft")).toHaveValue("BA 5 PA 5555");
});
