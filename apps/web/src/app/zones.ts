import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { allPages, api, unwrap } from "../api/client";
import { useIdempotencyKey } from "../api/useIdempotencyKey";

type Schemas = components["schemas"];
export type ParkingZone = Schemas["ParkingZone"];
export type CapacityPool = Schemas["CapacityPool"];

export function useZones(locationId: string) {
	return useQuery({
		queryKey: ["zones", locationId],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/locations/{location_id}/zones", {
						params: {
							path: { location_id: locationId },
							query: { limit: 100, cursor },
						},
						signal,
					}),
				signal,
			),
		refetchInterval: 5000,
	});
}

export function useCreateZone(locationId: string) {
	const client = useQueryClient();
	const identity = useIdempotencyKey();
	return useMutation({
		mutationFn: (body: Schemas["ZoneCreateRequest"]) =>
			unwrap(
				api.POST("/api/v1/locations/{location_id}/zones", {
					params: {
						path: { location_id: locationId },
						header: { "Idempotency-Key": identity.keyFor(body) },
					},
					body,
				}),
			),
		onSettled: (_data, error) => {
			identity.settle(error);
			return client.invalidateQueries({ queryKey: ["zones", locationId] });
		},
	});
}

export function useUpdatePool(
	locationId: string,
	zoneId: string,
	poolId: string,
) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (body: Schemas["PatchedPoolUpdateRequest"]) =>
			unwrap(
				api.PATCH(
					"/api/v1/locations/{location_id}/zones/{zone_id}/pools/{pool_id}",
					{
						params: {
							path: {
								location_id: locationId,
								zone_id: zoneId,
								pool_id: poolId,
							},
						},
						body,
					},
				),
			),
		onSettled: () =>
			client.invalidateQueries({ queryKey: ["zones", locationId] }),
	});
}
