import { describe, expect, it } from "vitest";
import { pwaOptions } from "../../vite.config";

describe("PWA cache policy", () => {
	it("never gives API navigations the cached application HTML", () => {
		for (const path of ["/api", "/api/v1/auth/session", "/api/v1/receipts/123?format=pdf"]) {
			expect(pwaOptions.workbox?.navigateFallbackDenylist?.some((rule) => rule.test(path))).toBe(true);
		}
	});

	it("precaches static assets and fonts without runtime API caching or forced updates", () => {
		expect(pwaOptions.workbox?.globPatterns).toContain("**/*.{js,css,html,woff2,png,svg,webmanifest}");
		expect(pwaOptions.workbox?.runtimeCaching ?? []).toEqual([]);
		expect(pwaOptions.registerType).toBe("prompt");
		expect(pwaOptions.workbox?.skipWaiting ?? false).toBe(false);
	});
});
