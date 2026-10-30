import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

vi.mock("./session", () => ({
	useSession: () => ({
		data: {
			user: { name: "Asha Sharma" },
			activeOrganisationId: "org",
			memberships: [
				{
					organisationId: "org",
					organisationName: "North Gate",
					roles: ["OWNER"],
				},
			],
		},
	}),
	useSignOut: () => ({ mutate: vi.fn() }),
	useSwitchOrganisation: () => ({ mutate: vi.fn() }),
}));

function workspace() {
	render(
		<MemoryRouter initialEntries={["/operations"]}>
			<Routes>
				<Route element={<AppShell />}>
					<Route path="operations" element={<h1>Operations</h1>} />
					<Route path="settings/sites" element={<h1>Sites</h1>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

it("makes settings reachable from the mobile disclosure and closes it after navigation", () => {
	workspace();
	const more = screen.getByRole("button", { name: "More" });
	fireEvent.click(more);
	expect(more).toHaveAttribute("aria-expanded", "true");
	const panel = screen.getByRole("navigation", { name: "More destinations" });
	expect(within(panel).getByRole("link", { name: "Reports" })).toHaveFocus();
	expect(within(panel).getByRole("link", { name: "Staff" })).toBeVisible();
	fireEvent.click(within(panel).getByRole("link", { name: "Sites" }));
	expect(screen.getByRole("heading", { name: "Sites" })).toBeVisible();
	expect(more).toHaveAttribute("aria-expanded", "false");
	expect(screen.getByRole("main")).toHaveFocus();
});

it("dismisses extra destinations with Escape and returns focus to the trigger", () => {
	workspace();
	const more = screen.getByRole("button", { name: "More" });
	fireEvent.click(more);
	const panel = screen.getByRole("navigation", { name: "More destinations" });
	within(panel).getByRole("link", { name: "Staff" }).focus();
	fireEvent.keyDown(panel, { key: "Escape" });
	expect(more).toHaveAttribute("aria-expanded", "false");
	expect(more).toHaveFocus();
});

it("offers a keyboard skip link to the workspace", () => {
	workspace();
	const link = screen.getByRole("link", { name: "Skip to content" });
	expect(link).toHaveAttribute("href", "#main-content");
	expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
});
