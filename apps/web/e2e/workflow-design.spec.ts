import { expect, test } from "@playwright/test";
import { mockUi } from "./ui-fixtures";

for (const width of [390, 768, 1440]) {
	test(`vehicle lookup and list-first membership workflows fit at ${width}px`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: 960 });
		const unexpected = await mockUi(page);
		await page.route("**/api/v1/parking/sessions/visit-0", (route) =>
			route.fulfill({
				json: {
					data: {
						id: "visit-0",
						locationId: "loc",
						bayId: "bay-0",
						bayLabel: "A01",
						plate: "बा २ प ३४५६",
						vehicleClass: "MOTORBIKE",
						enteredAt: new Date(Date.now() - 1800000).toISOString(),
						stage: "PARKED",
						status: "PARKED",
						invoice: null,
						totalPaisa: null,
						duePaisa: null,
						paidPaisa: 0,
						receipt: null,
					},
				},
			}),
		);
		await page.goto("/operations");
		await page
			.getByRole("button", { name: "Parked vehicles (6)", exact: true })
			.click();
		await page
			.getByLabel("Find parked vehicle", { exact: true })
			.fill("बा२प३४५६");
		await page
			.getByRole("button", { name: "View बा २ प ३४५६", exact: true })
			.click();
		const panel = page.getByRole("complementary", {
			name: "Vehicle details",
			exact: true,
		});
		await expect(
			panel.getByRole("button", { name: "Get checkout quote", exact: true }),
		).toBeVisible();
		await expect(
			panel.getByRole("list", { name: "Visit progress" }),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Parking spaces", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Parked vehicles (6)", exact: true })
			.click();
		await expect(
			page.getByLabel("Find parked vehicle", { exact: true }),
		).toHaveValue("बा२प३४५६");
		if (width >= 1024) {
			const durationHeading = await page
				.locator(".vehicle-columns > span")
				.nth(2)
				.boundingBox();
			const durationCell = await page
				.locator(".vehicle-row")
				.first()
				.locator(":scope > p")
				.nth(1)
				.boundingBox();
			expect(durationHeading).not.toBeNull();
			expect(durationCell).not.toBeNull();
			expect(
				Math.abs((durationHeading?.x ?? 0) - (durationCell?.x ?? 0)),
			).toBeLessThan(1);
		}
		await page.evaluate(() => {
			window.scrollTo(0, 0);
			(document.activeElement as HTMLElement | null)?.blur();
		});
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		await page.screenshot({
			path: info.outputPath(`vehicles-${width}.png`),
			fullPage: true,
		});
		await page.goto("/members");
		await expect(
			page.getByLabel("Search by plate", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByLabel("Price (NPR)", { exact: true }),
		).not.toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({
			path: info.outputPath(`members-${width}.png`),
			fullPage: true,
		});
		await page
			.getByRole("button", { name: "Sell a member pass", exact: true })
			.click();
		await page.getByLabel("Price (NPR)", { exact: true }).fill("1250");
		await page
			.getByRole("button", { name: "Hide sale form", exact: true })
			.click();
		await page
			.getByRole("button", { name: "Sell a member pass", exact: true })
			.click();
		await expect(page.getByLabel("Price (NPR)", { exact: true })).toHaveValue(
			"1250",
		);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		expect(unexpected).toEqual([]);
	});
}
