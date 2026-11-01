import { defineConfig } from "@playwright/test";

const baseURL = process.env.BAYLINE_E2E_ORIGIN;
if (
	!baseURL ||
	!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
) {
	throw new Error(
		"Run pnpm test:live to start the isolated local Django test server.",
	);
}

export default defineConfig({
	testDir: "./live-e2e",
	workers: 1,
	retries: 0,
	forbidOnly: true,
	timeout: 45_000,
	outputDir: "./test-results/live",
	use: {
		baseURL,
		// Offline/cache behavior has its own suite; live writes must reach the test server.
		serviceWorkers: "block",
		trace: "off",
		screenshot: "only-on-failure",
	},
});
