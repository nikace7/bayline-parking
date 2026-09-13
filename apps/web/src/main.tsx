import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/600.css";
// Outside src/ because Biome's CSS parser rejects Tailwind's @theme without a config change.
import "../styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate } from "react-router";
import { RouterProvider } from "react-router/dom";
import { ApiError } from "./api/client";
import { AppShell } from "./app/AppShell";
import { GalleryPage } from "./pages/GalleryPage";
import { LoginPage } from "./pages/LoginPage";
import { OperationsPage } from "./pages/OperationsPage";
import { RegisterPage } from "./pages/RegisterPage";
import { StaffPage } from "./pages/StaffPage";
import { NotFoundPage, RouteErrorPage } from "./pages/StatusPages";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// A 4xx answer will not change on retry; network and 5xx failures get two more attempts.
			retry: (failureCount, error) =>
				!(error instanceof ApiError && error.status < 500) && failureCount < 2,
		},
	},
});

const router = createBrowserRouter([
	{
		errorElement: <RouteErrorPage />,
		children: [
			{ path: "/login", element: <LoginPage /> },
			{ path: "/register", element: <RegisterPage /> },
			{ path: "/gallery", element: <GalleryPage /> },
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ index: true, element: <Navigate to="/operations" replace /> },
					{ path: "operations", element: <OperationsPage /> },
					{ path: "settings/staff", element: <StaffPage /> },
				],
			},
			{ path: "*", element: <NotFoundPage /> },
		],
	},
]);

const container = document.getElementById("root");
if (!container) {
	throw new Error("Missing #root element in index.html");
}

createRoot(container).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
