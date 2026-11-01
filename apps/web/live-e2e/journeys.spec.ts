import { expect, type Page, test } from "@playwright/test";

const password = process.env.BAYLINE_E2E_PASSWORD ?? "";
if (!password) throw new Error("Run this suite through pnpm test:live.");

// Never run financial test writes against the developer's demo stack or an external deployment.
test.beforeAll(async ({ request }) => {
	const response = await request.get("/__browser_test__/ready");
	expect(response.ok()).toBe(true);
	expect(await response.json()).toEqual({ isolatedBrowserTest: true });
});

async function signIn(page: Page, email: string) {
	await page.goto("/login");
	await page.getByLabel("Email", { exact: true }).fill(email);
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function signOut(page: Page) {
	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/login$/);
}

function localDate(days: number, hours = 0) {
	// Kathmandu is UTC+05:45; datetime-local fields use the selected location's clock.
	return new Date(Date.now() + days * 86400000 + hours * 3600000 + 345 * 60000)
		.toISOString()
		.slice(0, 16);
}

test("sign-in rejects an incorrect password, persists the real session and signs out", async ({
	page,
}) => {
	await page.goto("/login");
	await page.getByLabel("Email", { exact: true }).fill("owner@northgate.test");
	await page
		.getByLabel("Password", { exact: true })
		.fill("incorrect-synthetic-password");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(
		page
			.getByRole("alert")
			.filter({ hasText: "Email or password is incorrect." }),
	).toBeVisible();
	await page.getByLabel("Password", { exact: true }).fill(password);
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(
		page.getByRole("heading", { level: 1, name: "Operations" }),
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("heading", { level: 1, name: "Operations" }),
	).toBeVisible();
	await signOut(page);
});

test("walk-in entry, cash checkout, receipt copies and exit persist through the real API", async ({
	page,
}) => {
	await signIn(page, "operator@northgate.test");
	await page
		.getByRole("combobox", { name: "Location", exact: true })
		.selectOption({ label: "North Gate Central" });
	await page.getByRole("button", { name: /^Bay A01, Available/ }).click();
	await page.getByLabel("Plate", { exact: true }).fill("BA 11 PA 1111");
	const entry = page.waitForResponse(
		(response) =>
			response.url().endsWith("/parking/entries") &&
			response.request().method() === "POST",
	);
	await page.getByRole("button", { name: "Confirm entry" }).click();
	const entryResponse = await entry;
	expect(entryResponse.status()).toBe(201);
	const { data: visit } = await entryResponse.json();
	await expect
		.poll(() => Date.now() - Date.parse(visit.enteredAt))
		.toBeGreaterThan(1000);
	await signOut(page);
	await signIn(page, "cashier@northgate.test");
	await page
		.getByRole("combobox", { name: "Location", exact: true })
		.selectOption({ label: "North Gate Central" });
	await page.getByRole("button", { name: /^Bay A01, Occupied/ }).click();
	await page.getByRole("button", { name: "Get checkout quote" }).click();
	await page.getByRole("button", { name: "Confirm checkout" }).click();
	await page.getByRole("button", { name: "Take cash NPR 50.00" }).click();
	await expect(page.getByText("Ready to exit", { exact: true })).toBeVisible();
	const receiptPath = await page
		.getByRole("link", { name: /^Receipt NGC-/ })
		.getAttribute("href");
	await expect(page.getByRole("button", { name: "Record exit" })).toHaveCount(
		0,
	);
	await signOut(page);
	await signIn(page, "operator@northgate.test");
	await page
		.getByRole("combobox", { name: "Location", exact: true })
		.selectOption({ label: "North Gate Central" });
	await page.getByRole("button", { name: /^Bay A01, Occupied/ }).click();
	await page.getByRole("button", { name: "Record exit" }).click();
	await expect(
		page.getByRole("button", { name: /^Bay A01, Available/ }),
	).toBeVisible();
	await page.goto(receiptPath as string);
	await expect(
		page.getByRole("article", { name: /^Receipt NGC-/ }),
	).toContainText("BA 11 PA 1111");
	// Only the hardware dialog is stubbed; both print requests and copy numbers use real ledger data.
	await page.evaluate(() => {
		window.print = () => {};
	});
	await page
		.getByRole("button", { name: "Print receipt", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Reprint receipt", exact: true })
		.click();
	await expect(page.getByText(/2 print requests logged/)).toBeVisible();
	await page.reload();
	await expect(page.getByText(/2 print requests logged/)).toBeVisible();
});

test("membership sale, payment, renewal and balanced cash close persist on PostgreSQL", async ({
	page,
}) => {
	await signIn(page, "owner@northgate.test");
	await page
		.getByRole("combobox", { name: "Location", exact: true })
		.selectOption({ label: "North Gate Central" });
	await page.getByLabel("Opening cash float (NPR)").fill("1000");
	await page
		.getByRole("button", { name: "Open cash shift", exact: true })
		.click();
	await expect(page.getByText(/Cash shift open since/)).toBeVisible();
	await page.goto("/members");
	await page
		.getByRole("combobox", { name: "Location", exact: true })
		.selectOption({ label: "North Gate Central" });
	await page.getByLabel("Customer email").fill("asha@customer.test");
	await page.getByLabel("Plate", { exact: true }).fill("BA 20 PA 2002");
	await page.getByLabel("Starts at").fill(localDate(0));
	await page.getByLabel("Ends at").fill(localDate(30));
	await page.getByLabel("Price (NPR)", { exact: true }).fill("1000.50");
	const sale = page.waitForResponse(
		(response) =>
			response.url().endsWith("/memberships") &&
			response.request().method() === "POST",
	);
	await page.getByRole("button", { name: "Sell pass", exact: true }).click();
	const sold = await sale;
	expect(sold.status()).toBe(201);
	const { data: pass } = await sold.json();
	let card = page.getByRole("article", {
		name: `Pass ${pass.reference}`,
		exact: true,
	});
	await card
		.getByRole("button", { name: "Take cash NPR 1,000.50", exact: true })
		.click();
	await expect(card).toContainText("ACTIVE");
	await page.getByRole("link", { name: /^Receipt NGC-/ }).click();
	await expect(page).toHaveURL(/\/receipts\//);
	await expect(
		page.getByRole("article", { name: /^Receipt NGC-/ }),
	).toContainText("Member pass");
	await expect(
		page.getByRole("article", { name: /^Receipt NGC-/ }),
	).toContainText("NPR 1,000.50");
	await page.goto("/members");
	await page
		.getByRole("combobox", { name: "Location", exact: true })
		.selectOption({ label: "North Gate Central" });
	card = page.getByRole("article", {
		name: `Pass ${pass.reference}`,
		exact: true,
	});
	await card.getByRole("button", { name: "Renew", exact: true }).click();
	await page.getByLabel("Renewal ends at").fill(localDate(60));
	await page.getByLabel("Renewal price (NPR)").fill("1200");
	const renewal = page.waitForResponse(
		(response) =>
			response.url().endsWith(`/memberships/${pass.id}/renew`) &&
			response.request().method() === "POST",
	);
	await page
		.getByRole("button", { name: "Create renewal", exact: true })
		.click();
	const renewed = await renewal;
	expect(renewed.status()).toBe(201);
	const { data: next } = await renewed.json();
	const nextCard = page.getByRole("article", {
		name: `Pass ${next.reference}`,
		exact: true,
	});
	await nextCard
		.getByRole("button", { name: "Take cash NPR 1,200.00", exact: true })
		.click();
	await expect(nextCard).toContainText("ACTIVE");
	await page.goto("/shifts");
	await page.getByLabel("Counted cash (NPR)").fill("3200.50");
	await page.getByRole("button", { name: "Close shift", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Balanced");
});

test("customer holds, confirms and cancels a real reservation", async ({
	page,
}) => {
	await signIn(page, "bina@customer.test");
	await page.goto("/park");
	await page
		.getByRole("button", { name: "Reserve at North Gate Central", exact: true })
		.click();
	await page.getByLabel("Arrival", { exact: true }).fill(localDate(0, 1));
	await page.getByLabel("Plate", { exact: true }).fill("BA 30 PA 3003");
	await page.getByRole("button", { name: "Hold a bay", exact: true }).click();
	await page
		.getByRole("button", { name: "Confirm reservation", exact: true })
		.click();
	await page
		.getByRole("link", { name: "View reservation", exact: true })
		.click();
	await expect(
		page.getByRole("region", { name: /^Reservation / }),
	).toContainText("Confirmed");
	await page
		.getByRole("button", { name: "Cancel reservation", exact: true })
		.click();
	await page
		.getByRole("button", { name: "Yes, cancel it", exact: true })
		.click();
	await expect(
		page.getByRole("region", { name: /^Reservation / }),
	).toContainText("Cancelled");
	await page.reload();
	await expect(
		page.getByRole("region", { name: /^Reservation / }),
	).toContainText("Cancelled");
});
