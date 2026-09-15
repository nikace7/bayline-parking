import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		// Same origin as the Compose gateway, so session cookies and CSRF behave identically.
		host: "127.0.0.1",
		port: 4330,
		strictPort: true,
		proxy: { "/api": "http://127.0.0.1:8330" },
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test-setup.ts"],
		// Vitest blanks CSS imports by default; the contrast test reads the tokens as raw text.
		css: { include: [/styles\.css/] },
	},
});
