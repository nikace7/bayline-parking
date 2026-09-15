import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { ReceiptPage } from "./ReceiptPage";

vi.mock("../api/client", async (importOriginal) => ({
	...(await importOriginal<typeof import("../api/client")>()),
	api: { GET: vi.fn(), POST: vi.fn() },
}));

const receipt = {
	id: "receipt-1",
	number: "NGC-000001",
	issuedAt: "2026-09-14T03:35:02Z",
	organisationName: "North Gate Parking",
	locationName: "North Gate Central",
	locationAddress: "Durbar Marg, Kathmandu",
	timezone: "Asia/Kathmandu",
	plate: "बा २ प ३४५६",
	vehicleClass: "CAR",
	bayLabel: "A01",
	enteredAt: "2026-09-14T03:00:00Z",
	invoice: {
		id: "invoice-1",
		cutoffAt: "2026-09-14T03:35:01Z",
		billableSeconds: 1801,
		blocks: 2,
		basePaisa: 10_000,
		discountPaisa: 0,
		taxPaisa: 0,
		totalPaisa: 10_000,
		status: "CONFIRMED",
		createdAt: "2026-09-14T03:35:02Z",
	},
	amountPaisa: 10_000,
	method: "CASH",
	receivedByName: "Demo Cashier",
	printedCopies: 0,
};

const ok = (data: unknown) =>
	Promise.resolve({ data: { data }, response: new Response() });

describe("ReceiptPage", () => {
	beforeEach(() => vi.clearAllMocks());

	it("logs each print before printing and marks reprints as copies of the same number", async () => {
		let printedCopies = 0;
		vi.mocked(api.GET).mockImplementation((() =>
			ok({ ...receipt, printedCopies })) as never);
		vi.mocked(api.POST).mockImplementation((() => {
			printedCopies += 1;
			return ok({
				id: `print-${printedCopies}`,
				receiptId: receipt.id,
				copyNumber: printedCopies,
				printerPath: "BROWSER",
				createdAt: "2026-09-14T03:36:00Z",
			});
		}) as never);
		const slipsWhenPrinted: string[] = [];
		const print = vi.spyOn(window, "print").mockImplementation(() => {
			slipsWhenPrinted.push(
				screen.getByRole("article").getAttribute("aria-label") ?? "",
			);
		});

		render(
			<QueryClientProvider client={new QueryClient()}>
				<MemoryRouter initialEntries={["/receipts/receipt-1"]}>
					<Routes>
						<Route path="/receipts/:receiptId" element={<ReceiptPage />} />
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "Print receipt" }),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Reprint receipt" }),
		);
		await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(2));

		expect(slipsWhenPrinted).toEqual([
			"Receipt NGC-000001, Original",
			"Receipt NGC-000001, Copy 2",
		]);
		// api.POST is overloaded per path, so its recorded calls type as never.
		const calls = vi.mocked(api.POST).mock.calls as unknown as [
			string,
			unknown,
		][];
		expect(calls[0]?.[1]).toMatchObject({ body: { printerPath: "BROWSER" } });
		expect(screen.getByText("बा २ प ३४५६")).toBeVisible();
	});
});
