import {
	useInfiniteQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { api, unwrap } from "../api/client";
import { useIdempotencyKey } from "./gate";

type Schemas = components["schemas"];
export type MemberPass = Schemas["MemberPass"];

export function useMemberPasses(locationId: string, plate: string) {
	return useInfiniteQuery({
		queryKey: ["member-passes", locationId, plate],
		initialPageParam: undefined as string | undefined,
		queryFn: async ({ pageParam }) => {
			const result = await api.GET("/api/v1/memberships", {
				params: {
					query: {
						locationId,
						plate: plate || undefined,
						cursor: pageParam,
						limit: 25,
					},
				},
			});
			return {
				data: await unwrap(Promise.resolve(result)),
				page: result.data?.page ?? { next: null, previous: null },
			};
		},
		getNextPageParam: (page) => page.page.next ?? undefined,
		enabled: !!locationId,
	});
}

export function useSellPass() {
	const client = useQueryClient();
	const key = useIdempotencyKey();
	return useMutation({
		mutationFn: (body: Schemas["MembershipSaleRequest"]) =>
			unwrap(
				api.POST("/api/v1/memberships", {
					params: { header: { "Idempotency-Key": key.keyFor(body) } },
					body,
				}),
			),
		onSettled: (_data, error) => {
			key.settle(error);
			return client.invalidateQueries({ queryKey: ["member-passes"] });
		},
	});
}

export function useRenewPass() {
	const client = useQueryClient();
	const key = useIdempotencyKey();
	return useMutation({
		mutationFn: ({
			passId,
			body,
		}: {
			passId: string;
			body: Schemas["MembershipRenewRequest"];
		}) =>
			unwrap(
				api.POST("/api/v1/memberships/{pass_id}/renew", {
					params: {
						path: { pass_id: passId },
						header: { "Idempotency-Key": key.keyFor([passId, body]) },
					},
					body,
				}),
			),
		onSettled: (_data, error) => {
			key.settle(error);
			return client.invalidateQueries({ queryKey: ["member-passes"] });
		},
	});
}

export function usePassPayment() {
	const client = useQueryClient();
	const key = useIdempotencyKey();
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
						header: { "Idempotency-Key": key.keyFor([invoiceId, amountPaisa]) },
					},
					body: { method: "CASH", amountPaisa },
				}),
			),
		onSettled: (_data, error) => {
			key.settle(error);
			return Promise.all(
				["member-passes", "shift", "shift-summary"].map((name) =>
					client.invalidateQueries({ queryKey: [name] }),
				),
			);
		},
	});
}
