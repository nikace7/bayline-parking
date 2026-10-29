import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { allPages, api, unwrap } from "../api/client";
import { useIdempotencyKey } from "./gate";

type Schemas = components["schemas"];
export type Reservation = Schemas["Reservation"];
export type PublicLocation = Schemas["PublicLocation"];
export type HoldRequest = Schemas["HoldRequest"];
export type VehicleClass = Schemas["VehicleClassEnum"];
export type AvailabilityQuery = {
	locationId: string;
	vehicleClass: VehicleClass;
	startsAt: string;
	endsAt: string;
};

const PAGE = { limit: 100 };
const BOARD_REFRESH_MS = 30_000;

export function usePublicLocations() {
	return useQuery({
		queryKey: ["public-locations"],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/public/locations", {
						params: { query: { ...PAGE, cursor } },
						signal,
					}),
				signal,
			),
	});
}

export function useAvailability(query: AvailabilityQuery | null) {
	return useQuery({
		queryKey: ["availability", query],
		queryFn: () => {
			if (!query) throw new Error("Choose a time first.");
			const { locationId, ...times } = query;
			return unwrap(
				api.GET("/api/v1/public/locations/{location_id}/availability", {
					params: { path: { location_id: locationId }, query: times },
				}),
			);
		},
		enabled: query !== null,
	});
}

export function useMyReservations(enabled: boolean) {
	return useQuery({
		queryKey: ["my-reservations"],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/customer/reservations", {
						params: { query: { ...PAGE, cursor } },
						signal,
					}),
				signal,
			),
		enabled,
	});
}

export function useMyReservation(reservationId: string, enabled: boolean) {
	return useQuery({
		queryKey: ["my-reservation", reservationId],
		queryFn: () =>
			unwrap(
				api.GET("/api/v1/customer/reservations/{reservation_id}", {
					params: { path: { reservation_id: reservationId } },
				}),
			),
		enabled,
	});
}

/** Staff view of one location's day, refreshed so overstay conflicts surface on their own. */
export function useStaffReservations(filters: {
	locationId: string;
	date: string;
}) {
	return useQuery({
		queryKey: ["reservations", filters],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/reservations", {
						params: { query: { ...filters, ...PAGE, cursor } },
						signal,
					}),
				signal,
			),
		refetchInterval: BOARD_REFRESH_MS,
	});
}

/** The confirmed booking for this bay whose arrival window is open at `now`, if any. */
export function dueReservation(
	reservations: Reservation[],
	bayId: string,
	now: number,
): Reservation | undefined {
	return reservations.find(
		(item) =>
			item.bayId === bayId &&
			item.status === "CONFIRMED" &&
			Date.parse(item.arrivalOpensAt) <= now &&
			now <= Date.parse(item.arrivalClosesAt),
	);
}

function useRefreshReservations() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all(
			["my-reservations", "my-reservation", "reservations", "availability"].map(
				(key) => queryClient.invalidateQueries({ queryKey: [key] }),
			),
		);
}

export function useHold() {
	const refresh = useRefreshReservations();
	const idempotency = useIdempotencyKey();
	return useMutation({
		mutationFn: (body: HoldRequest) =>
			unwrap(
				api.POST("/api/v1/customer/reservations", {
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

export function useConfirmReservation() {
	const refresh = useRefreshReservations();
	const idempotency = useIdempotencyKey();
	return useMutation({
		mutationFn: (reservationId: string) =>
			unwrap(
				api.POST("/api/v1/reservations/{reservation_id}/confirm", {
					params: {
						path: { reservation_id: reservationId },
						header: { "Idempotency-Key": idempotency.keyFor(reservationId) },
					},
				}),
			),
		onSettled: (_data, error) => {
			idempotency.settle(error);
			return refresh();
		},
	});
}

export function useCancelReservation() {
	const refresh = useRefreshReservations();
	return useMutation({
		mutationFn: ({
			reservationId,
			reason = "",
		}: {
			reservationId: string;
			reason?: string;
		}) =>
			unwrap(
				api.POST("/api/v1/reservations/{reservation_id}/cancel", {
					params: { path: { reservation_id: reservationId } },
					body: { reason },
				}),
			),
		// A repeated cancel answers RESERVATION_NOT_CANCELLABLE, and the refetch shows the result.
		onSettled: () => refresh(),
	});
}

export function useRelocate() {
	const refresh = useRefreshReservations();
	return useMutation({
		mutationFn: ({
			reservationId,
			...body
		}: { reservationId: string } & Schemas["RelocateRequest"]) =>
			unwrap(
				api.POST("/api/v1/reservations/{reservation_id}/relocate", {
					params: { path: { reservation_id: reservationId } },
					body,
				}),
			),
		onSettled: () => refresh(),
	});
}
