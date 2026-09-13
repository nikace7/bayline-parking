import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { ApiError, api, unwrap } from "../api/client";

export type Session = components["schemas"]["Session"];
type LoginBody = components["schemas"]["LoginRequest"];
type RegisterBody = components["schemas"]["RegisterRequest"];

const SESSION_KEY = ["session"] as const;
const SIGNED_OUT: Session = {
	user: null,
	memberships: [],
	activeOrganisationId: null,
};

export function useSession() {
	return useQuery({
		queryKey: SESSION_KEY,
		queryFn: () => unwrap(api.GET("/api/v1/auth/session")),
	});
}

export function useSignIn() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: LoginBody) =>
			unwrap(api.POST("/api/v1/auth/login", { body })),
		onSuccess: (session) => queryClient.setQueryData(SESSION_KEY, session),
	});
}

export function useRegister() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (body: RegisterBody) =>
			unwrap(api.POST("/api/v1/auth/register", { body })),
		onSuccess: (session) => queryClient.setQueryData(SESSION_KEY, session),
	});
}

/** Switching organisation drops every cached entity so no screen shows the previous tenant's data. */
export function useSwitchOrganisation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (activeOrganisationId: string) =>
			unwrap(
				api.PATCH("/api/v1/auth/session", { body: { activeOrganisationId } }),
			),
		onSuccess: (session) => {
			queryClient.removeQueries({
				predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
			});
			queryClient.setQueryData(SESSION_KEY, session);
		},
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async () => {
			const { response } = await api.POST("/api/v1/auth/logout");
			if (!response.ok) {
				throw new ApiError(response.status, null);
			}
		},
		onSuccess: () => {
			queryClient.removeQueries({
				predicate: (query) => query.queryKey[0] !== SESSION_KEY[0],
			});
			queryClient.setQueryData(SESSION_KEY, SIGNED_OUT);
		},
	});
}
