import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans-devanagari/400.css";
import "@fontsource/ibm-plex-sans-devanagari/500.css";
import "@fontsource/ibm-plex-sans-devanagari/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
// Canonical Biome checks exclude this Tailwind file; format it with --css-parse-tailwind-directives=true.
import "../styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate } from "react-router";
import { RouterProvider } from "react-router/dom";
import { ApiError } from "./api/client";
import { AppShell } from "./app/AppShell";
import { CustomerShell } from "./app/CustomerShell";
import { PwaBoundary } from "./app/PwaBoundary";
import { CustomerRegisterPage } from "./pages/CustomerRegisterPage";
import { GalleryPage } from "./pages/GalleryPage";
import { LoginPage } from "./pages/LoginPage";
import { MembersPage } from "./pages/MembersPage";
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
		// Until durable sync exists, fail disconnected writes instead of pausing them for replay.
		mutations: { networkMode: "always", retry: false },
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
					{ path: "members", element: <MembersPage /> },
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
			<PwaBoundary>
				<RouterProvider router={router} />
			</PwaBoundary>
		</QueryClientProvider>
	</StrictMode>,
);
