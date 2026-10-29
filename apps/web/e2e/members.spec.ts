import { expect, test } from "@playwright/test";

test("staff can sell and collect a member pass from a mobile browser", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	let pass: Record<string, unknown> | null = null;
	await page.route("**/api/v1/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		let data: unknown;
		if (path.endsWith("/auth/session"))
			data = {
				user: { id: "user", name: "Owner", email: "owner@example.test" },
				activeOrganisationId: "org",
				memberships: [
					{
						organisationId: "org",
						organisationName: "North Gate",
						roles: ["OWNER"],
					},
				],
			};
		else if (path.endsWith("/locations")) {
			await route.fulfill({
				json: {
					data: [{ id: "loc", name: "Central", timezone: "Asia/Kathmandu" }],
					page: { next: null, previous: null },
				},
			});
			return;
		} else if (path.endsWith("/shifts/current"))
			data = { shift: { id: "shift", locationId: "loc" } };
		else if (
			path.endsWith("/memberships") &&
			route.request().method() === "POST"
		) {
			const body = route.request().postDataJSON();
			expect(body.pricePaisa).toBe(100050);
			pass = {
				id: "pass",
				reference: "PASS001",
				customerName: "Asha",
				customerEmail: body.email,
				plates: [body.vehicles[0].plate],
				locationNames: ["Central"],
				startsAt: body.startsAt,
				endsAt: body.endsAt,
				status: "PENDING",
				pricePaisa: body.pricePaisa,
				paidPaisa: 0,
				duePaisa: body.pricePaisa,
				maxVehicles: 1,
				coveredSeconds: 86400,
				invoiceId: "invoice",
			};
			data = pass;
		} else if (path.endsWith("/memberships")) {
			await route.fulfill({
				json: {
					data: pass ? [pass] : [],
					page: { next: null, previous: null },
				},
			});
			return;
		} else if (path.endsWith("/invoices/invoice/payments")) {
			pass = { ...pass, status: "ACTIVE", paidPaisa: 100050, duePaisa: 0 };
			data = { receiptId: "receipt", receiptNumber: "NG-001" };
		} else {
			await route.fulfill({ status: 404, json: {} });
			return;
		}
		await route.fulfill({ json: { data } });
	});
	await page.goto("/members");
	await expect(
		page
			.getByRole("navigation", { name: "Main" })
			.getByRole("link", { name: "Members", exact: true })
			.last(),
	).toBeVisible();
	await page.getByLabel("Customer email").fill("asha@example.test");
	await page.getByLabel("Plate", { exact: true }).fill("बा २ प ३४५६");
	await page.getByLabel("Starts at").fill("2026-10-29T10:00");
	await page.getByLabel("Ends at").fill("2026-11-29T10:00");
	await page.getByLabel("Price (NPR)", { exact: true }).fill("1000.50");
	await page.getByRole("button", { name: "Sell pass", exact: true }).click();
	await expect(
		page.getByText("Pass PASS001 created. Take payment to activate it."),
	).toBeVisible();
	await page.getByRole("button", { name: /Take cash/ }).click();
	await expect(
		page.getByRole("link", { name: "Receipt NG-001" }),
	).toHaveAttribute("href", "/receipts/receipt");
	await expect(
		page.getByRole("article", { name: "Pass PASS001" }),
	).toContainText("ACTIVE");
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});
