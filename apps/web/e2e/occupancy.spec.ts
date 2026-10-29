import { expect, test } from "@playwright/test";

test("a site beyond one page shows every bay and counts every parked visit", async ({
	page,
}) => {
	const bays = Array.from({ length: 105 }, (_, index) => ({
		id: `bay-${index}`,
		label: `A${index + 1}`,
		locationId: "loc",
		mode: "WALK_IN",
		state: "ACTIVE",
		vehicleClass: "CAR",
	}));
	const visits = bays
		.slice(0, 101)
		.map((bay, index) => ({
			id: `visit-${index}`,
			bayId: bay.id,
			enteredAt: "2026-10-29T00:00:00Z",
		}));
	const seen = new Set<string>();
	await page.route("**/api/v1/**", async (route) => {
		const url = new URL(route.request().url());
		if (url.pathname.endsWith("/auth/session")) {
			await route.fulfill({
				json: {
					data: {
						user: {
							id: "user",
							name: "Auditor",
							email: "auditor@example.test",
						},
						memberships: [
							{
								organisationId: "org",
								organisationName: "Test parking",
								roles: ["AUDITOR"],
							},
						],
						activeOrganisationId: "org",
					},
				},
			});
			return;
		}
		let rows: unknown[] = [];
		if (url.pathname.endsWith("/locations"))
			rows = [{ id: "loc", name: "Large site", timezone: "Asia/Kathmandu" }];
		if (url.pathname.endsWith("/bays")) rows = bays;
		if (url.pathname.endsWith("/parking/sessions")) {
			expect(url.searchParams.get("locationId")).toBe("loc");
			expect(url.searchParams.get("status")).toBe("PARKED");
			rows = visits;
		}
		const cursor = url.searchParams.get("cursor");
		if (cursor) seen.add(url.pathname);
		const offset = cursor ? 100 : 0;
		await route.fulfill({
			json: {
				data: rows.slice(offset, offset + 100),
				page: {
					next: rows.length > offset + 100 ? "second-page" : null,
					previous: null,
				},
			},
		});
	});
	await page.goto("/operations");
	const parked = page.getByText("Parked", { exact: true }).locator("..");
	const free = page
		.getByText("Walk-in bays free", { exact: true })
		.locator("..");
	await expect(parked).toContainText("101");
	await expect(free).toContainText("4");
	await expect(
		page.getByRole("button", { name: /^Bay A105, Available/ }),
	).toBeVisible();
	expect(seen.has("/api/v1/locations/loc/bays")).toBe(true);
	expect(seen.has("/api/v1/parking/sessions")).toBe(true);
});
