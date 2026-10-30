import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "../api/client";
import {
	type Shift,
	useClosedShifts,
	useCloseShift,
	useShiftSummary,
} from "../app/cash";
import { useActiveRoles, useCurrentShift } from "../app/gate";
import { type Location, useLocations } from "../app/sites";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FormAlert } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { describeVariance, formatPaisa, parseRupees } from "../lib/money";
import { formatDateTime } from "../lib/time";

function VarianceBadge({ paisa }: { paisa: number }) {
	const tone = paisa === 0 ? "available" : paisa < 0 ? "error" : "warning";
	return <StatusBadge tone={tone}>{describeVariance(paisa)}</StatusBadge>;
}

export function ShiftsPage() {
	const roles = useActiveRoles();
	const locations = useLocations();
	const canHoldCash = roles.includes("OWNER") || roles.includes("CASHIER");

	return (
		<section aria-labelledby="shifts-heading" className="flex flex-col gap-6">
			<h1 id="shifts-heading" className="text-page font-semibold">
				Shifts
			</h1>
			{locations.isPending && (
				<p className="text-ink-muted">Loading locations…</p>
			)}
			{locations.isError && (
				<FormAlert>{errorMessage(locations.error)}</FormAlert>
			)}
			{locations.isSuccess && (
				<>
					{canHoldCash && <YourShift locations={locations.data} />}
					<ClosedShifts locations={locations.data} />
				</>
			)}
		</section>
	);
}

function timeZoneFor(locations: Location[], locationId: string): string {
	// Locations copy their organisation's time zone, so any location is a safe fallback.
	return (
		locations.find((location) => location.id === locationId)?.timezone ??
		locations[0]?.timezone ??
		"UTC"
	);
}

function YourShift({ locations }: { locations: Location[] }) {
	const current = useCurrentShift();
	const close = useCloseShift();
	const closed = close.data?.shift;

	return (
		<section
			aria-labelledby="your-shift-heading"
			className="flex flex-col gap-3"
		>
			<h2 id="your-shift-heading" className="text-section font-semibold">
				Your cash shift
			</h2>
			{closed?.variancePaisa != null && closed.countedCashPaisa != null && (
				<p
					role="status"
					className="rounded-control bg-available-bg p-3 text-dense text-available"
				>
					{`Shift closed. Expected ${formatPaisa(close.data?.expectedCashPaisa ?? 0)}, counted ${formatPaisa(closed.countedCashPaisa)}: ${describeVariance(closed.variancePaisa)}.`}
				</p>
			)}
			{current.isPending && <p className="text-ink-muted">Loading shift…</p>}
			{current.isError && <FormAlert>{errorMessage(current.error)}</FormAlert>}
			{current.isSuccess && !current.data.shift && (
				<p className="text-ink-muted">
					No cash shift is open.{" "}
					<Link to="/operations" className="font-medium text-brand underline">
						Open one from Operations
					</Link>
					.
				</p>
			)}
			{current.data?.shift && (
				<CloseShiftForm
					key={current.data.shift.id}
					shift={current.data.shift}
					timeZone={timeZoneFor(locations, current.data.shift.locationId)}
					close={close}
				/>
			)}
		</section>
	);
}

function CloseShiftForm({
	shift,
	timeZone,
	close,
}: {
	shift: Shift;
	timeZone: string;
	close: ReturnType<typeof useCloseShift>;
}) {
	const summary = useShiftSummary(shift.id);
	const [counted, setCounted] = useState("");
	const countedPaisa = parseRupees(counted);

	if (summary.isPending) {
		return <p className="text-ink-muted">Loading the drawer total…</p>;
	}
	if (summary.isError) {
		return <FormAlert>{errorMessage(summary.error)}</FormAlert>;
	}

	const { captureCount, cashCapturedPaisa, expectedCashPaisa } = summary.data;

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (countedPaisa !== null) {
			close.mutate({ shiftId: shift.id, countedCashPaisa: countedPaisa });
		}
	}

	return (
		<div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4">
			<p className="text-dense text-ink-muted">
				{`${shift.locationName} · opened ${formatDateTime(shift.openedAt, timeZone)}`}
			</p>
			<dl className="grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-dense tabular-nums">
				<dt className="text-ink-muted">Opening float</dt>
				<dd className="text-right">{formatPaisa(shift.openingFloatPaisa)}</dd>
				<dt className="text-ink-muted">
					{`Cash taken (${captureCount} ${captureCount === 1 ? "payment" : "payments"})`}
				</dt>
				<dd className="text-right">{formatPaisa(cashCapturedPaisa)}</dd>
				<dt className="font-semibold">Expected in drawer</dt>
				<dd className="text-right font-semibold">
					{formatPaisa(expectedCashPaisa)}
				</dd>
			</dl>
			{close.isError && <FormAlert>{errorMessage(close.error)}</FormAlert>}
			<form
				onSubmit={onSubmit}
				noValidate
				className="flex flex-wrap items-end gap-3"
			>
				<TextField
					label="Counted cash (NPR)"
					inputMode="decimal"
					autoComplete="off"
					hint="Count the whole drawer, including the opening float."
					value={counted}
					error={
						counted && countedPaisa === null
							? "Enter an amount such as 1280 or 1280.50."
							: undefined
					}
					onChange={(event) => setCounted(event.target.value)}
				/>
				<Button
					type="submit"
					pending={close.isPending}
					disabled={countedPaisa === null}
				>
					Close shift
				</Button>
			</form>
			<p aria-live="polite" className="text-dense">
				{countedPaisa !== null &&
					`Against the expected ${formatPaisa(expectedCashPaisa)}: ${describeVariance(countedPaisa - expectedCashPaisa)}.`}
			</p>
		</div>
	);
}

function ClosedShifts({ locations }: { locations: Location[] }) {
	const shifts = useClosedShifts();

	return (
		<section
			aria-labelledby="closed-shifts-heading"
			className="flex flex-col gap-3"
		>
			<h2 id="closed-shifts-heading" className="text-section font-semibold">
				Closed shifts
			</h2>
			{shifts.isPending && <p className="text-ink-muted">Loading shifts…</p>}
			{shifts.isError && <FormAlert>{errorMessage(shifts.error)}</FormAlert>}
			{shifts.isSuccess && (
				<DataTable
					caption="Closed cash shifts, most recent first"
					headings={[
						"Location",
						"Staff",
						"Opened",
						"Closed",
						"Float",
						"Expected",
						"Counted",
						"Variance",
					]}
					empty="No closed shifts yet."
					rows={shifts.data.map((shift) => {
						const timeZone = timeZoneFor(locations, shift.locationId);
						return {
							key: shift.id,
							cells: [
								shift.locationName,
								shift.operatorName,
								formatDateTime(shift.openedAt, timeZone),
								shift.closedAt ? formatDateTime(shift.closedAt, timeZone) : "",
								formatPaisa(shift.openingFloatPaisa),
								formatPaisa(shift.expectedCashPaisa ?? 0),
								formatPaisa(shift.countedCashPaisa ?? 0),
								<VarianceBadge
									key="variance"
									paisa={shift.variancePaisa ?? 0}
								/>,
							],
						};
					})}
				/>
			)}
		</section>
	);
}
