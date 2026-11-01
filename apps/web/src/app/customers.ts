import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { api, unwrap, unwrapPage } from "../api/client";
import { useIdempotencyKey } from "../api/useIdempotencyKey";

export type Customer = components["schemas"]["Customer"];

export function useCustomers(search: string, enabled: boolean) {
	return useInfiniteQuery({
		queryKey: ["customers", search],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam, signal }) =>
			unwrapPage(
				api.GET("/api/v1/customers", {
					params: {
						query: {
							search: search || undefined,
							cursor: pageParam,
							limit: 25,
						},
					},
					signal,
				}),
			),
		getNextPageParam: (page) => page.page.next ?? undefined,
		enabled,
	});
}

export function useCreateCustomer() {
	const client = useQueryClient();
	const key = useIdempotencyKey();
	return useMutation({
		mutationFn: (body: components["schemas"]["CustomerCreateRequest"]) =>
			unwrap(
				api.POST("/api/v1/customers", {
					body,
					params: { header: { "Idempotency-Key": key.keyFor(body) } },
				}),
			),
		onSettled: (_data, error) => {
			key.settle(error);
			return client.invalidateQueries({ queryKey: ["customers"] });
		},
	});
}
