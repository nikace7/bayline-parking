import { type ReactNode, type RefObject, useId, useState } from "react";
import type { Reservation } from "../app/reservations";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { RESERVATION_STATUS } from "../lib/labels";
import { formatClock } from "../lib/time";

export type ReservationAction = {
	reservationId: string;
	kind: "move" | "cancel";
};
const matching = (text: string) => text.replace(/\s/g, "").toLocaleLowerCase();

/** Presentation of the existing complete, location/day-scoped query. */
export function ReservationDirectory({
	reservations,
	timezone,
	canManage,
	action,
	onAction,
	searchRef,
	children,
}: {
	reservations: Reservation[];
	timezone: string;
	canManage: boolean;
	action?: ReservationAction;
	onAction: (action: ReservationAction, trigger: HTMLButtonElement) => void;
	searchRef: RefObject<HTMLInputElement | null>;
	children?: ReactNode;
}) {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("");
	const [conflictsOnly, setConflictsOnly] = useState(false);
	const statusId = useId();
	const conflictCount = reservations.filter((item) => item.conflict).length;
	const filtered = Boolean(search || status || conflictsOnly);
	const rows = reservations.filter(
		(item) =>
			(!status || item.status === status) &&
			(!conflictsOnly || item.conflict) &&
			[item.plate, item.customerName, item.reference, item.bayLabel].some(
				(value) => matching(value).includes(matching(search)),
			),
	);

	return (
		<div className="reservation-directory">
			<div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
				<TextField
					ref={searchRef}
					type="search"
					label="Find reservation"
					placeholder="Plate, name, reference or bay"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="min-w-0 flex-1 basis-64"
				/>
				<div className="flex min-w-0 flex-col gap-1.5 text-dense font-medium">
					<label htmlFor={statusId}>Reservation status</label>
					<select
						id={statusId}
						value={status}
						onChange={(event) => setStatus(event.target.value)}
						className="min-h-11 border border-control bg-surface px-3 font-normal"
					>
						<option value="">All statuses</option>
						{Object.entries(RESERVATION_STATUS).map(([value, { label }]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</div>
				<Button
					variant="secondary"
					aria-pressed={conflictsOnly}
					onClick={() => setConflictsOnly(!conflictsOnly)}
					className="reservation-conflict-filter"
				>
					Bay conflicts ({conflictCount})
				</Button>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 sm:px-5">
				<p className="text-dense tabular-nums text-ink-muted">
					{rows.length} of {reservations.length} reservations
				</p>
				{filtered && (
					<Button
						variant="secondary"
						onClick={() => {
							setSearch("");
							setStatus("");
							setConflictsOnly(false);
							searchRef.current?.focus();
						}}
					>
						Clear reservation filters
					</Button>
				)}
			</div>
			{children}
			<div className="reservation-columns" aria-hidden="true">
				<span>Time / bay</span>
				<span>Vehicle / customer</span>
				<span>Status</span>
				<span>Actions</span>
			</div>
			<ul aria-label="Reservation results">
				{rows.map((reservation) => {
					const { label, tone } = RESERVATION_STATUS[reservation.status];
					const movable =
						reservation.status === "HOLD" || reservation.status === "CONFIRMED";
					return (
						<li
							key={reservation.id}
							className="reservation-row"
							data-selected={action?.reservationId === reservation.id}
						>
							<div>
								<p className="text-dense font-medium tabular-nums">
									<span className="sr-only">Reserved time: </span>
									{formatClock(reservation.startsAt, timezone)}–
									{formatClock(reservation.endsAt, timezone)}
								</p>
								<p className="mt-1 text-dense text-ink-muted">
									Bay <span>{reservation.bayLabel}</span>
								</p>
							</div>
							<div className="min-w-0">
								<p className="break-words font-mono font-semibold">
									{reservation.plate}
								</p>
								<p className="mt-1 break-words text-dense">
									{reservation.customerName}
								</p>
								<p className="mt-1 break-words font-mono text-meta text-ink-muted">
									<span className="sr-only">Reference: </span>
									{reservation.reference}
								</p>
							</div>
							<div className="flex flex-wrap items-start gap-1.5">
								<StatusBadge tone={tone}>{label}</StatusBadge>
								{reservation.conflict && (
									<StatusBadge tone="error">Bay still occupied</StatusBadge>
								)}
							</div>
							<div className="reservation-row-actions">
								{canManage &&
									movable &&
									(["move", "cancel"] as const).map((kind) => (
										<Button
											key={kind}
											variant="secondary"
											aria-label={`${kind === "move" ? "Move" : "Cancel"} ${reservation.reference}`}
											aria-pressed={
												action?.reservationId === reservation.id &&
												action.kind === kind
											}
											onClick={(event) =>
												onAction(
													{ reservationId: reservation.id, kind },
													event.currentTarget,
												)
											}
										>
											{kind === "move" ? "Move" : "Cancel"}
										</Button>
									))}
							</div>
						</li>
					);
				})}
			</ul>
			{rows.length === 0 && (
				<p className="empty-state">
					{filtered
						? "No reservations match your filters."
						: "No reservations on this date."}
				</p>
			)}
		</div>
	);
}
