import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { VisitSummary } from "../app/gate";
import type { Location } from "../app/sites";
import { ParkedVehicles } from "./ParkedVehicles";

vi.mock("./GatePanels", () => ({
	VisitPanel: ({ visitId }: { visitId: string }) => <p>Managing {visitId}</p>,
}));
const location = { id: "loc", name: "Central", timezone: "UTC" } as Location;
const visits = [
	{
		id: "one",
		bayId: "bay",
		bayLabel: "A01",
		plate: "BA 12 PA 3456",
		vehicleClass: "CAR",
		enteredAt: "2026-11-01T10:00:00Z",
		stage: "CHECKOUT_PENDING",
	},
	{
		id: "two",
		bayId: null,
		poolId: "pool",
		bayLabel: "North yard",
		plate: "XY 99",
		vehicleClass: "MOTORBIKE",
		enteredAt: "2026-11-01T10:30:00Z",
		stage: "EXIT_READY",
	},
] as VisitSummary[];
function show() {
	render(
		<ParkedVehicles
			location={location}
			visits={visits}
			asOf={Date.parse("2026-11-01T11:00:00Z")}
			canTakeCash={false}
			canCheckout={false}
			canExit={false}
		/>,
	);
}
it("finds a vehicle by unspaced plate or open-area name and filters payment state", () => {
	show();
	fireEvent.change(screen.getByLabelText("Find parked vehicle"), {
		target: { value: "ba12pa3456" },
	});
	expect(
		screen.getByRole("button", { name: "View BA 12 PA 3456" }),
	).toBeVisible();
	expect(
		screen.queryByRole("button", { name: "View XY 99" }),
	).not.toBeInTheDocument();
	fireEvent.change(screen.getByLabelText("Find parked vehicle"), {
		target: { value: "north yard" },
	});
	expect(screen.getByRole("button", { name: "View XY 99" })).toBeVisible();
	fireEvent.change(screen.getByLabelText("Visit status"), {
		target: { value: "CHECKOUT_PENDING" },
	});
	expect(screen.getByText("No vehicles match your filters.")).toBeVisible();
	fireEvent.click(
		screen.getByRole("button", { name: "Clear vehicle filters" }),
	);
	expect(screen.getByRole("button", { name: "View XY 99" })).toBeVisible();
});
it("opens the chosen visit and keeps it selected while filtering the list", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "View XY 99" }));
	expect(screen.getByText("Managing two")).toBeVisible();
	screen.getByLabelText("Find parked vehicle").focus();
	fireEvent.click(screen.getByRole("button", { name: "View XY 99" }));
	expect(
		screen.getByRole("complementary", { name: "Vehicle details" }),
	).toHaveFocus();
	fireEvent.change(screen.getByLabelText("Find parked vehicle"), {
		target: { value: "no match" },
	});
	expect(screen.getByText("Managing two")).toBeVisible();
	fireEvent.click(
		screen.getByRole("button", { name: "Close vehicle details" }),
	);
	expect(screen.queryByText("Managing two")).not.toBeInTheDocument();
});
