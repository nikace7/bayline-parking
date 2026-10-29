import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PwaBoundary } from "./PwaBoundary";

const pwa = vi.hoisted(() => ({
	ready: false,
	refresh: false,
	update: vi.fn().mockResolvedValue(undefined),
	options: {} as { onRegisterError?: (error: Error) => void },
}));

vi.mock("virtual:pwa-register/react", () => ({
	useRegisterSW: (options: typeof pwa.options) => {
		pwa.options = options;
		return {
			offlineReady: [pwa.ready, vi.fn()],
			needRefresh: [pwa.refresh, vi.fn()],
			updateServiceWorker: pwa.update,
		};
	},
}));

function connection(online: boolean) {
	Object.defineProperty(navigator, "onLine", {
		configurable: true,
		value: online,
	});
	window.dispatchEvent(new Event(online ? "online" : "offline"));
}

describe("PwaBoundary", () => {
	beforeEach(() => {
		connection(true);
		pwa.ready = false;
		pwa.refresh = false;
		pwa.update.mockClear();
	});

	it("leaves the application visible while online", () => {
		render(
			<PwaBoundary>
				<button type="button">Admit vehicle</button>
			</PwaBoundary>,
		);
		expect(screen.getByRole("button", { name: "Admit vehicle" })).toBeVisible();
		expect(screen.queryByText("You’re offline")).not.toBeInTheDocument();
	});

	it("opens an offline screen on a cold offline start without exposing parking actions", () => {
		connection(false);
		render(
			<PwaBoundary>
				<button type="button">Take cash</button>
			</PwaBoundary>,
		);
		expect(
			screen.getByRole("heading", { name: "You’re offline" }),
		).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "Take cash" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(/No parking entries or payments are queued/),
		).toBeVisible();
	});

	it("keeps unfinished form values when a connection drops and returns", () => {
		render(
			<PwaBoundary>
				<label>
					Plate
					<input defaultValue="बा २ प ३४५६" />
				</label>
			</PwaBoundary>,
		);
		act(() => connection(false));
		expect(
			screen.queryByRole("textbox", { name: "Plate" }),
		).not.toBeInTheDocument();
		act(() => connection(true));
		expect(screen.getByRole("textbox", { name: "Plate" })).toHaveValue(
			"बा २ प ३४५६",
		);
	});

	it("moves focus to the offline heading and restores the original field on reconnect", () => {
		render(<PwaBoundary><label>Plate<input /></label></PwaBoundary>);
		const plate = screen.getByRole("textbox", { name: "Plate" });
		plate.focus();
		act(() => connection(false));
		expect(screen.getByRole("heading", { name: "You’re offline" })).toHaveFocus();
		act(() => connection(true));
		expect(plate).toHaveFocus();
	});

	it("describes shell readiness without claiming offline transactions work", () => {
		pwa.ready = true;
		render(<PwaBoundary>Application</PwaBoundary>);
		expect(screen.getByRole("status")).toHaveTextContent(
			/App saved for offline access/,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			/Parking actions still need a connection/,
		);
	});

	it("only applies an update after an explicit click", () => {
		pwa.refresh = true;
		render(<PwaBoundary>Application</PwaBoundary>);
		expect(pwa.update).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Update app" }));
		expect(pwa.update).toHaveBeenCalledWith(true);
	});

	it("reports failed offline installation while leaving the online application usable", () => {
		render(
			<PwaBoundary>
				<button type="button">Admit vehicle</button>
			</PwaBoundary>,
		);
		act(() => pwa.options.onRegisterError?.(new Error("registration failed")));
		expect(screen.getByRole("alert")).toHaveTextContent(
			/Offline access could not be prepared/,
		);
		expect(screen.getByRole("button", { name: "Admit vehicle" })).toBeVisible();
	});

	it("keeps the application available if applying an update fails", async () => {
		pwa.refresh = true;
		pwa.update.mockRejectedValueOnce(new Error("offline during update"));
		render(<PwaBoundary>Application</PwaBoundary>);
		fireEvent.click(screen.getByRole("button", { name: "Update app" }));
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"The update failed",
		);
		expect(screen.getByRole("button", { name: "Update app" })).toBeEnabled();
		expect(screen.getByText("Application")).toBeVisible();
	});
});
