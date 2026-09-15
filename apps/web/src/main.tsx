import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans-devanagari/400.css";
import "@fontsource/ibm-plex-sans-devanagari/500.css";
import "@fontsource/ibm-plex-sans-devanagari/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
// Outside src/ because Biome's CSS parser rejects Tailwind's @theme without a config change.
import "../styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate } from "react-router";
import { RouterProvider } from "react-router/dom";
import { ApiError } from "./api/client";
import { AppShell } from "./app/AppShell";
import { CustomerShell } from "./app/CustomerShell";
import { CustomerRegisterPage } from "./pages/CustomerRegisterPage";
import { GalleryPage } from "./pages/GalleryPage";
import { LoginPage } from "./pages/LoginPage";
import {
	MyReservationsPage,
	ReservationDetailPage,
} from "./pages/MyReservationsPage";
import { OperationsPage } from "./pages/OperationsPage";
import { ParkPage } from "./pages/ParkPage";
import { ReceiptPage } from "./pages/ReceiptPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { ShiftsPage } from "./pages/ShiftsPage";
import { SitesPage } from "./pages/SitesPage";
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
			{ path: "/account/register", element: <CustomerRegisterPage /> },
			{ path: "/gallery", element: <GalleryPage /> },
			{
				element: <CustomerShell />,
				children: [
					{ path: "/park", element: <ParkPage /> },
					{ path: "/account/reservations", element: <MyReservationsPage /> },
					{
						path: "/account/reservations/:reservationId",
						element: <ReservationDetailPage />,
					},
				],
			},
			{
				path: "/",
				element: <AppShell />,
				children: [
					{ index: true, element: <Navigate to="/operations" replace /> },
					{ path: "operations", element: <OperationsPage /> },
					{ path: "reservations", element: <ReservationsPage /> },
					{ path: "shifts", element: <ShiftsPage /> },
					{ path: "reports", element: <ReportsPage /> },
					{ path: "receipts/:receiptId", element: <ReceiptPage /> },
					{ path: "settings/sites", element: <SitesPage /> },
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
