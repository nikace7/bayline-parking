import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "../../generated/schema";
import { allPages, api, unwrap } from "../api/client";

type Schemas = components["schemas"];
export type Shift = Schemas["Shift"];
export type ShiftSummary = Schemas["ShiftSummary"];
export type Receipt = Schemas["Receipt"];
export type CollectionsReport = Schemas["CollectionsReport"];
export type VehicleLogReport = Schemas["VehicleLogReport"];
export type ReportKind = "collections" | "vehicle-log";
export type ReportFilters = {
	fromDate: string;
	toDate: string;
	locationId?: string;
};

export const METHOD_LABEL: Record<Schemas["PaymentMethodEnum"], string> = {
	CASH: "Cash",
};

const PAGE = { limit: 100 };

export function useShiftSummary(shiftId: string) {
	return useQuery({
		queryKey: ["shift-summary", shiftId],
		queryFn: () =>
			unwrap(
				api.GET("/api/v1/shifts/{shift_id}/summary", {
					params: { path: { shift_id: shiftId } },
				}),
			),
	});
}

export function useClosedShifts() {
	return useQuery({
		queryKey: ["shifts", "CLOSED"],
		queryFn: ({ signal }) =>
			allPages(
				(cursor) =>
					api.GET("/api/v1/shifts", {
						params: { query: { status: "CLOSED", ...PAGE, cursor } },
						signal,
					}),
				signal,
			),
	});
}

export function useCloseShift() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			shiftId,
			countedCashPaisa,
		}: {
			shiftId: string;
			countedCashPaisa: number;
		}) =>
			unwrap(
				api.POST("/api/v1/shifts/{shift_id}/close", {
					params: { path: { shift_id: shiftId } },
					body: { countedCashPaisa },
				}),
			),
		// No Idempotency-Key: a repeated close answers SHIFT_CLOSED, and the refetch shows the result.
		onSettled: () =>
			Promise.all(
				["shift", "shifts", "shift-summary"].map((key) =>
					queryClient.invalidateQueries({ queryKey: [key] }),
				),
			),
	});
}

export function useReceipt(receiptId: string) {
	return useQuery({
		queryKey: ["receipt", receiptId],
		queryFn: () =>
			unwrap(
				api.GET("/api/v1/receipts/{receipt_id}", {
					params: { path: { receipt_id: receiptId } },
				}),
			),
	});
}

/** Logs a print request. The server numbers copies; a reprint keeps the receipt number. */
export function usePrintRequest(receiptId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () =>
			unwrap(
				api.POST("/api/v1/receipts/{receipt_id}/print-events", {
					params: { path: { receipt_id: receiptId } },
					body: { printerPath: "BROWSER" },
				}),
			),
		onSettled: () =>
			queryClient.invalidateQueries({ queryKey: ["receipt", receiptId] }),
	});
}

export function useCollectionsReport(filters: ReportFilters | null) {
	return useQuery({
		queryKey: ["report", "collections", filters],
		queryFn: () => {
			if (!filters) throw new Error("Choose a period first.");
			return unwrap(
				api.GET("/api/v1/reports/collections", {
					params: { query: filters },
				}),
			);
		},
		enabled: filters !== null,
	});
}

export function useVehicleLogReport(filters: ReportFilters | null) {
	return useQuery({
		queryKey: ["report", "vehicle-log", filters],
		queryFn: () => {
			if (!filters) throw new Error("Choose a period first.");
			return unwrap(
				api.GET("/api/v1/reports/vehicle-log", {
					params: { query: filters },
				}),
			);
		},
		enabled: filters !== null,
	});
}

/** Exports download through a plain link: same-origin GET with the session cookie. */
export function reportExportUrl(
	kind: ReportKind,
	filters: ReportFilters,
	format: "pdf" | "xlsx",
): string {
	const query = new URLSearchParams({
		fromDate: filters.fromDate,
		toDate: filters.toDate,
		format,
	});
	if (filters.locationId) {
		query.set("locationId", filters.locationId);
	}
	return `/api/v1/reports/${kind}?${query}`;
}
