import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export const pwaOptions: Partial<VitePWAOptions> = {
	registerType: "prompt",
	injectRegister: false,
	manifest: {
		id: "/",
		name: "Bayline Parking",
		short_name: "Bayline",
		description: "Parking operations for Nepal",
		lang: "en",
		start_url: "/operations",
		scope: "/",
		display: "standalone",
		theme_color: "#00645C",
		background_color: "#F2F4F3",
		icons: [
			{ src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
			{
				src: "/pwa-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any maskable",
			},
		],
	},
	workbox: {
		globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
		navigateFallback: "/index.html",
		// A direct API/download navigation must never receive cached application HTML.
		navigateFallbackDenylist: [/^\/api(?:\/|$|\?)/],
		cleanupOutdatedCaches: true,
		runtimeCaching: [],
	},
};

export default defineConfig({
	plugins: [react(), tailwindcss(), VitePWA(pwaOptions)],
	server: {
		// Same origin as the Compose gateway, so session cookies and CSRF behave identically.
		host: "127.0.0.1",
		port: 4330,
		strictPort: true,
		proxy: { "/api": "http://127.0.0.1:8330" },
	},
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		// Vitest blanks CSS imports by default; the contrast test reads the tokens as raw text.
		css: { include: [/styles\.css/] },
	},
});
