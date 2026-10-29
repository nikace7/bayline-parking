import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { errorMessage } from "../api/client";
import {
	METHOD_LABEL,
	type Receipt,
	usePrintRequest,
	useReceipt,
} from "../app/cash";
import { Button } from "../components/Button";
import { ArrowLeft, Printer } from "../components/icons";
import { FormAlert } from "../components/Page";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatPaisa } from "../lib/money";
import { formatDateTime, formatDuration } from "../lib/time";

const PAPER_WIDTHS = [80, 58] as const;
type PaperWidth = (typeof PAPER_WIDTHS)[number];

export function copyLabel(copyNumber: number): string {
	return copyNumber === 1 ? "Original" : `Copy ${copyNumber}`;
}

export function ReceiptPage() {
	const { receiptId = "" } = useParams();
	const receipt = useReceipt(receiptId);
	const printRequest = usePrintRequest(receiptId);
	const [width, setWidth] = useState<PaperWidth>(80);
	const [printingCopy, setPrintingCopy] = useState<number>();

	// The logged copy number is on the slip before the print dialog opens.
	useEffect(() => {
		if (printingCopy === undefined) return;
		window.print();
		setPrintingCopy(undefined);
	}, [printingCopy]);

	if (receipt.isPending) {
		return <p className="text-ink-muted">Loading receipt…</p>;
	}
	if (receipt.isError) {
		return <FormAlert>{errorMessage(receipt.error)}</FormAlert>;
	}

	const { printedCopies } = receipt.data;
	return (
		<section aria-labelledby="receipt-heading" className="flex flex-col gap-6">
			<style>{`@page { size: ${width}mm auto; margin: 0; }`}</style>
			<div
				data-print="hide"
				className="flex flex-wrap items-end justify-between gap-3"
			>
				<div className="flex flex-col gap-1">
					<Link
						to="/operations"
						className="inline-flex items-center gap-1 text-dense font-medium text-brand"
					>
						<ArrowLeft aria-hidden className="size-4" />
						Operations
					</Link>
					<h1 id="receipt-heading" className="text-page font-semibold">
						Receipt {receipt.data.number}
					</h1>
					<p className="text-dense text-ink-muted">
						{printedCopies === 0
							? "No print requested yet."
							: `${printedCopies} print ${printedCopies === 1 ? "request" : "requests"} logged. A request is not proof the printer produced paper.`}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<fieldset className="flex items-center gap-3 text-dense">
						<legend className="sr-only">Paper width</legend>
						{PAPER_WIDTHS.map((option) => (
							<label key={option} className="flex min-h-11 items-center gap-2">
								<input
									type="radio"
									name="paper-width"
									checked={width === option}
									onChange={() => setWidth(option)}
								/>
								{option} mm
							</label>
						))}
					</fieldset>
					<Button
						pending={printRequest.isPending}
						onClick={() =>
							printRequest.mutate(undefined, {
								onSuccess: (event) => setPrintingCopy(event.copyNumber),
							})
						}
					>
						<Printer aria-hidden className="size-4" />
						{printedCopies === 0 ? "Print receipt" : "Reprint receipt"}
					</Button>
				</div>
			</div>
			{printRequest.isError && (
				<div data-print="hide">
					<FormAlert>{errorMessage(printRequest.error)}</FormAlert>
				</div>
			)}
			<ReceiptSlip
				receipt={receipt.data}
				width={width}
				copy={copyLabel(printingCopy ?? printedCopies + 1)}
			/>
		</section>
	);
}

function SlipRow({
	label,
	value,
	strong = false,
}: {
	label: string;
	value: string;
	strong?: boolean;
}) {
	return (
		<div
			className={`flex flex-wrap justify-between gap-x-3 ${strong ? "font-semibold" : ""}`}
		>
			<span>{label}</span>
			<span className="text-right">{value}</span>
		</div>
	);
}

function ReceiptSlip({
	receipt,
	width,
	copy,
}: {
	receipt: Receipt;
	width: PaperWidth;
	copy: string;
}) {
	const { invoice, timezone } = receipt;
	// Membership receipts have no session, so the API omits the visit fields.
	const fee: [string, string][] = receipt.enteredAt
		? [
				["Plate", receipt.plate],
				[
					"Vehicle",
					`${VEHICLE_LABEL[receipt.vehicleClass]} · Bay ${receipt.bayLabel}`,
				],
				["Entered", formatDateTime(receipt.enteredAt, timezone)],
				["Charged to", formatDateTime(invoice.cutoffAt, timezone)],
				["Billed time", formatDuration(invoice.billableSeconds)],
				["Started blocks", String(invoice.blocks)],
				["Base charge", formatPaisa(invoice.basePaisa)],
			]
		: [
				["Charge", "Member pass"],
				["Invoice", invoice.id],
				["Base charge", formatPaisa(invoice.basePaisa)],
			];
	if (invoice.discountPaisa) {
		fee.push(["Discount", formatPaisa(-invoice.discountPaisa)]);
	}
	if (invoice.taxPaisa) {
		fee.push(["Tax", formatPaisa(invoice.taxPaisa)]);
	}
	const rule = <hr className="border-dashed border-ink-muted" />;

	return (
		<article
			data-print="receipt"
			aria-label={`Receipt ${receipt.number}, ${copy}`}
			style={{ width: `${width}mm` }}
			className={`mx-auto flex max-w-full flex-col gap-2 rounded-panel border border-line bg-surface p-3 tabular-nums print:rounded-none print:border-0 ${width === 58 ? "text-meta" : "text-dense"}`}
		>
			<header className="text-center">
				<p className="font-semibold">{receipt.organisationName}</p>
				<p>{receipt.locationName}</p>
				<p>{receipt.locationAddress}</p>
			</header>
			{rule}
			<SlipRow label="Receipt" value={receipt.number} strong />
			<p className="text-center font-semibold uppercase tracking-wide">
				{copy}
			</p>
			<SlipRow
				label="Issued"
				value={formatDateTime(receipt.issuedAt, timezone)}
			/>
			{rule}
			{fee.map(([label, value]) => (
				<SlipRow key={label} label={label} value={value} />
			))}
			{rule}
			<SlipRow label="Total" value={formatPaisa(invoice.totalPaisa)} strong />
			<SlipRow
				label={`Paid (${METHOD_LABEL[receipt.method]})`}
				value={formatPaisa(receipt.amountPaisa)}
			/>
			<SlipRow label="Received by" value={receipt.receivedByName} />
			{rule}
			<p className="text-center">Parking receipt. Not a tax invoice.</p>
		</article>
	);
}
