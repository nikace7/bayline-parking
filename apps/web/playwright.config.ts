import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: "http://127.0.0.1:4430",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "pnpm exec vite preview --host 127.0.0.1 --port 4430 --strictPort",
		url: "http://127.0.0.1:4430",
		reuseExistingServer: false,
	},
});
