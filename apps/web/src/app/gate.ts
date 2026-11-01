import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { allPages, api, unwrap } from "../api/client";
import { useIdempotencyKey } from "../api/useIdempotencyKey";
import { useSession } from "./session";

type Schemas = components["schemas"];
export type Quote = Schemas["Quote"];
export type Visit = Schemas["SessionDetail"];
export type VisitSummary = Schemas["SessionSummary"];

const PAGE = { limit: 100 };
const OCCUPANCY_REFRESH_MS = 5_000;

/** Occupancy is always the server's list of parked visits, refreshed while the page is visible. */
export function useParkedVisits(locationId: string) {
	return useQuery({
		queryKey: ["visits", locationId],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/parking/sessions", {
						params: {
							query: { locationId, status: "PARKED", ...PAGE, cursor },
						},
						signal,
					}),
				signal,
			),
		refetchInterval: OCCUPANCY_REFRESH_MS,
	});
}

export function useVisit(visitId: string) {
	return useQuery({
		queryKey: ["visit", visitId],
		queryFn: () =>
			unwrap(
				api.GET("/api/v1/parking/sessions/{session_id}", {
					params: { path: { session_id: visitId } },
				}),
			),
	});
}

export function useCurrentShift() {
	return useQuery({
		queryKey: ["shift"],
		queryFn: () => unwrap(api.GET("/api/v1/shifts/current")),
	});
}

export function useActiveRoles(): Schemas["RoleEnum"][] {
	const session = useSession();
	const active = session.data?.memberships.find(
		(membership) =>
			membership.organisationId === session.data?.activeOrganisationId,
	);
	return active?.roles ?? [];
}

export function useOpenShift() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: Schemas["ShiftOpenRequest"]) =>
			unwrap(api.POST("/api/v1/shifts/open", { body })),
		// No Idempotency-Key: a repeated open answers SHIFT_ALREADY_OPEN, and the refetch shows it.
		onSettled: () => queryClient.invalidateQueries({ queryKey: ["shift"] }),
	});
}

function useRefreshVisits(visitId?: string) {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: ["visits"] }),
			queryClient.invalidateQueries({ queryKey: ["zones"] }),
			// Check-in and exit move reservations to CHECKED_IN and COMPLETED.
			queryClient.invalidateQueries({ queryKey: ["reservations"] }),
			visitId &&
				queryClient.invalidateQueries({ queryKey: ["visit", visitId] }),
		]);
}

export function useAdmit() {
	const refresh = useRefreshVisits();
	const idempotency = useIdempotencyKey();
	return useMutation({
		mutationFn: (body: Schemas["EntryRequest"]) =>
			unwrap(
				api.POST("/api/v1/parking/entries", {
					params: { header: { "Idempotency-Key": idempotency.keyFor(body) } },
					body,
				}),
			),
		onSettled: (_data, error) => {
			idempotency.settle(error);
			return refresh();
		},
	});
}

export function useQuote(visitId: string) {
	return useMutation({
		mutationFn: () =>
			unwrap(
				api.POST("/api/v1/parking/sessions/{session_id}/quote", {
					params: { path: { session_id: visitId } },
				}),
			),
	});
}

export function useCheckout(visitId: string) {
	const refresh = useRefreshVisits(visitId);
	const idempotency = useIdempotencyKey();
	return useMutation({
		mutationFn: (quoteToken: string) =>
			unwrap(
				api.POST("/api/v1/parking/sessions/{session_id}/checkout", {
					params: {
						path: { session_id: visitId },
						header: { "Idempotency-Key": idempotency.keyFor(quoteToken) },
					},
					body: { quoteToken },
				}),
			),
		onSettled: (_data, error) => {
			idempotency.settle(error);
			return refresh();
		},
	});
}

export function useCashPayment(visitId: string) {
	const refresh = useRefreshVisits(visitId);
	const idempotency = useIdempotencyKey();
	return useMutation({
		mutationFn: ({
			invoiceId,
			amountPaisa,
		}: {
			invoiceId: string;
			amountPaisa: number;
		}) =>
			unwrap(
				api.POST("/api/v1/invoices/{invoice_id}/payments", {
					params: {
						path: { invoice_id: invoiceId },
						header: {
							"Idempotency-Key": idempotency.keyFor([invoiceId, amountPaisa]),
						},
					},
					body: { method: "CASH", amountPaisa },
				}),
			),
		onSettled: (_data, error) => {
			idempotency.settle(error);
			return refresh();
		},
	});
}

export function useExit(visitId: string) {
	const refresh = useRefreshVisits(visitId);
	const idempotency = useIdempotencyKey();
	return useMutation({
		mutationFn: () =>
			unwrap(
				api.POST("/api/v1/parking/sessions/{session_id}/exit", {
					params: {
						path: { session_id: visitId },
						header: { "Idempotency-Key": idempotency.keyFor(visitId) },
					},
				}),
			),
		onSettled: (_data, error) => {
			idempotency.settle(error);
			return refresh();
		},
	});
}
