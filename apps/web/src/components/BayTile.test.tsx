import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BayTile } from "./BayTile";

describe("BayTile", () => {
	it("announces bay, state word, class and duration rather than relying on colour", () => {
		render(
			<BayTile
				label="A-07"
				state="occupied"
				vehicleClass="MOTORBIKE"
				duration="1h 05m"
			/>,
		);

		const tile = screen.getByRole("button", {
			name: "Bay A-07, Occupied, motorbike, parked 1h 05m",
		});
		expect(tile).toHaveTextContent("Occupied");
	});

	it("calls onSelect when activated", () => {
		const onSelect = vi.fn();
		render(
			<BayTile
				label="B-01"
				state="available"
				vehicleClass="CAR"
				onSelect={onSelect}
			/>,
		);

		screen.getByRole("button", { name: "Bay B-01, Available, car" }).click();

		expect(onSelect).toHaveBeenCalledOnce();
	});
});
