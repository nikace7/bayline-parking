import { expect, test } from "@playwright/test";
import { mockUi } from "./ui-fixtures";

const screens = [
	["/operations", "Operations"],
	["/reservations", "Reservations"],
	["/members", "Members"],
	["/shifts", "Shifts"],
	["/reports", "Reports"],
	["/settings/sites", "Sites"],
	["/settings/staff", "Staff"],
	["/park", "Find parking"],
	["/account/reservations", "My reservations"],
	["/account/reservations/reservation-1", "Reservation K7M2Q9XA"],
	["/receipts/receipt-1", "Receipt NGC-000001"],
] as const;

for (const width of [360, 768, 1440]) {
	test(`staff and customer screens fit at ${width}px`, async ({
		page,
	}, info) => {
		await page.setViewportSize({ width, height: 960 });
		const unexpected = await mockUi(page);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		for (const [path, heading] of screens) {
			await page.goto(path);
			await expect(
				page.getByRole("heading", { level: 1, name: heading, exact: true }),
			).toBeVisible();
			await expect(
				page.getByText(
					/Loading (locations|bays|passes|shift|report|staff|receipt|reservations)…/,
				),
			).toHaveCount(0);
			await page.evaluate(() => document.fonts.ready);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
				path,
			).toBe(true);
			await page.screenshot({
				path: info.outputPath(`${path.replaceAll("/", "-")}-${width}.png`),
				fullPage: true,
			});
		}
		expect(errors).toEqual([]);
		expect(unexpected).toEqual([]);
	});
}

test("mobile keyboard navigation reaches settings and the filtered board keeps totals", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mockUi(page);
	await page.goto("/operations");
	await page.getByRole("button", { name: "More", exact: true }).focus();
	await page.keyboard.press("Enter");
	await expect(
		page
			.getByRole("navigation", { name: "More destinations" })
			.getByRole("link", { name: "Reports" }),
	).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(
		page
			.getByRole("navigation", { name: "More destinations" })
			.getByRole("link", { name: "Sites" }),
	).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("button", { name: "More", exact: true }),
	).toBeFocused();
	await page.getByLabel("Search bays or plates").fill("बा २");
	await expect(page.getByRole("button", { name: /^Bay A01,/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /^Bay A02,/ })).toHaveCount(0);
	await expect(
		page.getByText("Parked", { exact: true }).locator(".."),
	).toContainText("6");
	await page.getByLabel("Bay status").selectOption("available");
	await expect(page.getByText("No bays match your filters.")).toBeVisible();
	await page.getByRole("button", { name: "Clear filters" }).click();
	await expect(page.getByRole("button", { name: /^Bay A02,/ })).toBeVisible();
});

test("auth screens fit phones and desktops and password visibility preserves the value", async ({
	page,
}, info) => {
	await mockUi(page, true);
	for (const width of [360, 1440]) {
		await page.setViewportSize({ width, height: 960 });
		for (const [path, title] of [
			["/login", "Sign in"],
			["/register", "Register your organisation"],
			["/account/register", "Create your parking account"],
		] as const) {
			await page.goto(path);
			await expect(
				page.getByRole("heading", { level: 1, name: title }),
			).toBeVisible();
			await page
				.getByLabel("Password", { exact: true })
				.fill("synthetic-password");
			await page.getByRole("button", { name: "Show password" }).click();
			await expect(
				page.getByLabel("Password", { exact: true }),
			).toHaveAttribute("type", "text");
			await page.getByRole("button", { name: "Hide password" }).click();
			await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
				"synthetic-password",
			);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true);
			await page.screenshot({
				path: info.outputPath(`${path.replaceAll("/", "-")}-${width}.png`),
				fullPage: true,
			});
		}
	}
});

test("receipt preview decoration does not reach either print width", async ({
	page,
}) => {
	await mockUi(page);
	await page.goto("/receipts/receipt-1");
	await expect(
		page.getByRole("button", { name: "Print receipt" }),
	).toBeVisible();
	for (const width of [80, 58]) {
		await page.getByLabel(`${width} mm`, { exact: true }).check();
		await page.emulateMedia({ media: "print" });
		const frame = page
			.locator('[data-print="bare"]')
			.filter({ has: page.locator('[data-print="receipt"]') })
			.last();
		await expect(frame).toHaveCSS("border-top-width", "0px");
		await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		await expect(page.locator('[data-print="receipt"]')).toHaveCSS(
			"border-top-width",
			"0px",
		);
		await page.emulateMedia({ media: "screen" });
	}
});
