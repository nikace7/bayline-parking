import { Fragment, useState } from "react";
import { errorMessage } from "../api/client";
import {
	type CollectionsReport,
	METHOD_LABEL,
	type ReportFilters,
	type ReportKind,
	reportExportUrl,
	useCollectionsReport,
	useVehicleLogReport,
	type VehicleLogReport,
} from "../app/cash";
import { type Location, useActiveRoles, useLocations } from "../app/gate";
import { DataTable } from "../components/DataTable";
import { Download } from "../components/icons";
import { FormAlert } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatPaisa } from "../lib/money";
import { formatDateTime, todayIn } from "../lib/time";

const REPORT_ROLES: string[] = ["OWNER", "MANAGER", "AUDITOR"];
const KINDS: { kind: ReportKind; label: string }[] = [
	{ kind: "collections", label: "Collections" },
	{ kind: "vehicle-log", label: "Vehicle log" },
];

export function ReportsPage() {
	const roles = useActiveRoles();
	const locations = useLocations();
	const canRead = roles.some((role) => REPORT_ROLES.includes(role));

	return (
		<section aria-labelledby="reports-heading" className="flex flex-col gap-6">
			<h1 id="reports-heading" className="text-page font-semibold">
				Reports
			</h1>
			{!canRead && (
				<p className="text-ink-muted">
					Reports are available to owners, managers and auditors.
				</p>
			)}
			{canRead && locations.isPending && (
				<p className="text-ink-muted">Loading locations…</p>
			)}
			{canRead && locations.isError && (
				<FormAlert>{errorMessage(locations.error)}</FormAlert>
			)}
			{canRead && locations.isSuccess && (
				<ReportBrowser locations={locations.data} />
			)}
		</section>
	);
}

function ReportBrowser({ locations }: { locations: Location[] }) {
	// Locations copy their organisation's time zone, so any location gives the local date.
	const timeZone = locations[0]?.timezone ?? "UTC";
	const [kind, setKind] = useState<ReportKind>("collections");
	const [locationId, setLocationId] = useState("");
	const [fromDate, setFromDate] = useState(() => todayIn(timeZone));
	const [toDate, setToDate] = useState(() => todayIn(timeZone));
	const validRange = Boolean(fromDate && toDate && fromDate <= toDate);
	const filters: ReportFilters | null = validRange
		? { fromDate, toDate, ...(locationId ? { locationId } : {}) }
		: null;
	const collections = useCollectionsReport(
		kind === "collections" ? filters : null,
	);
	const vehicleLog = useVehicleLogReport(
		kind === "vehicle-log" ? filters : null,
	);
	const active = kind === "collections" ? collections : vehicleLog;

	return (
		<>
			<div className="flex flex-wrap items-end gap-3">
				<fieldset className="flex rounded-control border border-control bg-surface p-0.5">
					<legend className="sr-only">Report</legend>
					{KINDS.map((option) => (
						<button
							key={option.kind}
							type="button"
							aria-pressed={kind === option.kind}
							onClick={() => setKind(option.kind)}
							className={`min-h-10 rounded-control px-3 font-medium ${
								kind === option.kind
									? "bg-brand text-on-brand"
									: "text-ink-muted hover:text-ink"
							}`}
						>
							{option.label}
						</button>
					))}
				</fieldset>
				<label className="flex flex-col gap-1 text-dense font-medium">
					Location
					<select
						value={locationId}
						onChange={(event) => setLocationId(event.target.value)}
						className="min-h-11 rounded-control border border-control bg-surface px-3 font-normal"
					>
						<option value="">All locations</option>
						{locations.map((location) => (
							<option key={location.id} value={location.id}>
								{location.name}
							</option>
						))}
					</select>
				</label>
				<TextField
					label="From"
					type="date"
					value={fromDate}
					onChange={(event) => setFromDate(event.target.value)}
				/>
				<TextField
					label="To"
					type="date"
					value={toDate}
					error={
						validRange
							? undefined
							: "Choose an end date on or after the start date."
					}
					onChange={(event) => setToDate(event.target.value)}
				/>
				{filters && (
					<div className="flex flex-wrap gap-2">
						{(["pdf", "xlsx"] as const).map((format) => (
							<a
								key={format}
								href={reportExportUrl(kind, filters, format)}
								className="inline-flex min-h-11 items-center gap-2 rounded-control border border-control bg-surface px-4 font-medium hover:bg-inset"
							>
								<Download aria-hidden className="size-4" />
								{`Download ${format.toUpperCase()}`}
							</a>
						))}
					</div>
				)}
			</div>

			{active.isLoading && <p className="text-ink-muted">Loading report…</p>}
			{active.isError && <FormAlert>{errorMessage(active.error)}</FormAlert>}
			{kind === "collections" && collections.data && (
				<Collections report={collections.data} />
			)}
			{kind === "vehicle-log" && vehicleLog.data && (
				<VehicleLog report={vehicleLog.data} />
			)}
		</>
	);
}

function ScopeLine({ scope }: { scope: CollectionsReport["scope"] }) {
	const period =
		scope.fromDate === scope.toDate
			? scope.fromDate
			: `${scope.fromDate} to ${scope.toDate}`;
	return (
		<p className="text-dense text-ink-muted">
			{`${scope.locationName ?? "All locations"} · ${period} · as of ${formatDateTime(scope.asOf, scope.timezone)}`}
		</p>
	);
}

function Collections({ report }: { report: CollectionsReport }) {
	const { timezone } = report.scope;
	return (
		<section aria-label="Collections" className="flex flex-col gap-3">
			<ScopeLine scope={report.scope} />
			<DataTable
				caption="Payments posted in the period"
				headings={[
					"Posted",
					"Receipt",
					"Location",
					"Plate",
					"Method",
					"Received by",
					"Amount",
				]}
				empty="No payments in this period."
				rows={report.rows.map((row) => ({
					key: `${row.postedAt}-${row.receiptNumber ?? row.plate}`,
					cells: [
						formatDateTime(row.postedAt, timezone),
						row.receiptNumber ?? "",
						row.locationName,
						row.plate,
						METHOD_LABEL[row.method],
						row.receivedByName,
						formatPaisa(row.amountPaisa),
					],
				}))}
			/>
			<dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-dense tabular-nums">
				{report.byMethod.map((total) => (
					<Fragment key={total.method}>
						<dt className="text-ink-muted">
							{`${METHOD_LABEL[total.method]} (${total.count})`}
						</dt>
						<dd className="text-right">{formatPaisa(total.amountPaisa)}</dd>
					</Fragment>
				))}
				<dt className="text-ink-muted">Captured</dt>
				<dd className="text-right">{formatPaisa(report.capturedPaisa)}</dd>
				<dt className="text-ink-muted">Refunded</dt>
				<dd className="text-right">{formatPaisa(report.refundedPaisa)}</dd>
				<dt className="font-semibold">Net collected</dt>
				<dd className="text-right font-semibold">
					{formatPaisa(report.netPaisa)}
				</dd>
			</dl>
		</section>
	);
}

function VehicleLog({ report }: { report: VehicleLogReport }) {
	const { timezone } = report.scope;
	return (
		<section aria-label="Vehicle log" className="flex flex-col gap-3">
			<ScopeLine scope={report.scope} />
			<p className="text-dense tabular-nums">
				{`${report.entries} entries · ${report.exits} exits · ${report.stillParked} still parked`}
			</p>
			<DataTable
				caption="Visits that entered or exited in the period"
				headings={[
					"Entered",
					"Exited",
					"Status",
					"Plate",
					"Class",
					"Bay",
					"Location",
					"Entered by",
					"Exited by",
				]}
				empty="No visits in this period."
				rows={report.rows.map((row) => ({
					key: `${row.enteredAt}-${row.plate}`,
					cells: [
						formatDateTime(row.enteredAt, timezone),
						row.exitedAt ? formatDateTime(row.exitedAt, timezone) : "",
						<StatusBadge
							key="status"
							tone={row.status === "PARKED" ? "occupied" : "neutral"}
						>
							{row.status === "PARKED" ? "Parked" : "Exited"}
						</StatusBadge>,
						row.plate,
						VEHICLE_LABEL[row.vehicleClass],
						row.bayLabel,
						row.locationName,
						row.enteredByName,
						row.exitedByName ?? "",
					],
				}))}
			/>
		</section>
	);
}
