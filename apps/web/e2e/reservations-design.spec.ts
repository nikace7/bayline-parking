import { expect, test } from "@playwright/test";
import { mockUi, reservation } from "./ui-fixtures";

for (const width of [390, 768, 1440]) {
	test(`reservation lookup and actions fit at ${width}px`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: 844 });
		const unexpected = await mockUi(page);
		const writes: string[] = [];
		page.on("request", (request) => {
			if (request.url().includes("/api/") && request.method() !== "GET")
				writes.push(request.url());
		});
		const records = Array.from({ length: 12 }, (_, index) => ({
			...reservation,
			id: `reservation-${index}`,
			reference: `BOOK${index}`,
			plate: `XY ${index + 10}`,
			customerName:
				index === 0 ? "Alexandria Montgomery-Worthington" : `Customer ${index}`,
			conflict: index % 4 === 0,
			status: index === 1 ? "COMPLETED" : "CONFIRMED",
		}));
		await page.route("**/api/v1/reservations?*", (route) =>
			route.fulfill({
				json: { data: records, page: { next: null, previous: null } },
			}),
		);
		await page.goto("/reservations");
		const search = page.getByLabel("Find reservation", { exact: true });
		await expect(page.getByText("12 of 12 reservations")).toBeVisible();
		const bottomAction = page.getByRole("button", {
			name: "Cancel BOOK11",
			exact: true,
		});
		await bottomAction.click();
		const panel = page.getByRole("region", {
			name: "Reservation action",
			exact: true,
		});
		await expect(panel).toBeFocused();
		const position = await panel.boundingBox();
		expect(position?.y).toBeGreaterThanOrEqual(0);
		expect(position?.y).toBeLessThan(600);
		await page
			.getByLabel("Reason", { exact: true })
			.fill("Customer requested another day");
		await bottomAction.click();
		await expect(panel).toBeFocused();
		await search.fill("xy10");
		await expect(page.getByText("1 of 12 reservations")).toBeVisible();
		await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
			"Customer requested another day",
		);
		await panel.getByRole("button", { name: "Close", exact: true }).click();
		await expect(search).toBeFocused();
		await page
			.getByRole("button", { name: "Clear reservation filters" })
			.click();
		await page.getByRole("button", { name: "Bay conflicts (3)" }).click();
		await expect(page.getByText("3 of 12 reservations")).toBeVisible();
		await page
			.getByLabel("Reservation status", { exact: true })
			.selectOption("COMPLETED");
		await expect(
			page.getByText("No reservations match your filters."),
		).toBeVisible();
		await page
			.getByRole("button", { name: "Clear reservation filters" })
			.click();
		await search.fill("Alexandria");
		await expect(
			page.getByText("Alexandria Montgomery-Worthington"),
		).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);
		// Actions must fit within each row, not merely inside a scrolling table frame.
		const row = page.locator(".reservation-row").first();
		expect(
			await row.evaluate(
				(element) => element.scrollWidth <= element.clientWidth,
			),
		).toBe(true);
		if (width >= 1280) {
			const heading = await page
				.locator(".reservation-columns > span")
				.nth(1)
				.boundingBox();
			const cell = await row.locator(":scope > div").nth(1).boundingBox();
			expect(Math.abs((heading?.x ?? -100) - (cell?.x ?? 100))).toBeLessThan(1);
		}
		await page.screenshot({
			path: info.outputPath(`reservations-${width}.png`),
			fullPage: true,
		});
		await page.getByRole("button", { name: "Move BOOK0", exact: true }).click();
		await expect(page.getByLabel("Move to bay", { exact: true })).toBeVisible();
		await page.getByLabel("Date", { exact: true }).fill("2026-12-01");
		await expect(panel).toHaveCount(0);
		expect(writes).toEqual([]);
		expect(unexpected).toEqual([]);
	});
}
