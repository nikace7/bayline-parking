import { useQuery } from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { allPages, api } from "../api/client";

export type Bay = components["schemas"]["Bay"];
export type Location = components["schemas"]["Location"];
const PAGE = { limit: 100 };

export function useLocations() {
	return useQuery({
		queryKey: ["locations"],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/locations", {
						params: { query: { ...PAGE, cursor } },
						signal,
					}),
				signal,
			),
	});
}

export function useBays(locationId: string) {
	return useQuery({
		queryKey: ["bays", locationId],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/locations/{location_id}/bays", {
						params: {
							path: { location_id: locationId },
							query: { ...PAGE, cursor },
						},
						signal,
					}),
				signal,
			),
	});
}

export function useTariffs(locationId: string) {
	return useQuery({
		queryKey: ["tariffs", locationId],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/locations/{location_id}/tariffs", {
						params: {
							path: { location_id: locationId },
							query: { ...PAGE, cursor },
						},
						signal,
					}),
				signal,
			),
	});
}
