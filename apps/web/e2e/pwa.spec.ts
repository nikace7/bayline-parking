import { expect, test } from "@playwright/test";

test("installs the shell, reloads deep links offline and recovers on reconnect", async ({ page, context }) => {
	await page.goto("/gallery");
	await expect(page.getByRole("status")).toContainText("App saved for offline access");
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.setOffline(true);
	await page.goto("/operations");
	await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
	await page.reload();
	await expect(page.getByText(/No parking entries or payments are queued/)).toBeVisible();
	await context.setOffline(false);
	await page.goto("/gallery");
	await expect(page.getByRole("heading", { name: "You’re offline" })).toHaveCount(0);
});

test("never caches private API responses or supplies cached HTML to offline API requests", async ({ page, context }) => {
	await page.goto("/gallery");
	await expect(page.getByRole("status")).toContainText("App saved for offline access");
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.route("**/api/v1/receipts/private", (route) => route.fulfill({
		contentType: "application/json",
		body: JSON.stringify({ privateReceipt: "PRIVATE-RECEIPT" }),
	}));
	expect(await page.evaluate(async () => (await fetch("/api/v1/receipts/private")).json())).toEqual({ privateReceipt: "PRIVATE-RECEIPT" });
	const cachedPaths = await page.evaluate(async () => {
		const keys = await caches.keys();
		const requests = await Promise.all(keys.map(async (key) => (await caches.open(key)).keys()));
		return requests.flat().map((request) => new URL(request.url).pathname);
	});
	expect(cachedPaths.some((path) => path.startsWith("/api"))).toBe(false);
	await context.unroute("**/api/v1/receipts/private");
	await context.setOffline(true);
	expect(await page.evaluate(async () => {
		try {
			await fetch("/api/v1/receipts/private");
			return "unexpected response";
		} catch {
			return "network unavailable";
		}
	})).toBe("network unavailable");
});

test("serves a standalone install manifest and real PNG icons", async ({ page, request }) => {
	await page.goto("/gallery");
	const manifestLink = await page.locator('link[rel="manifest"]').getAttribute("href");
	expect(manifestLink).toBeTruthy();
	const response = await request.get(manifestLink ?? "");
	const manifest = await response.json();
	expect(manifest).toMatchObject({ name: "Bayline Parking", display: "standalone", scope: "/" });
	for (const icon of manifest.icons) {
		const iconResponse = await request.get(icon.src);
		expect(iconResponse.ok()).toBe(true);
		const bytes = await iconResponse.body();
		expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
		const size = Number(icon.sizes.split("x")[0]);
		expect(bytes.readUInt32BE(16)).toBe(size);
		expect(bytes.readUInt32BE(20)).toBe(size);
	}
});
