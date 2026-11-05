import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { errorMessage } from "../api/client";
import { useActiveRoles } from "../app/gate";
import {
	type Reservation,
	useCancelReservation,
	useRelocate,
	useStaffReservations,
} from "../app/reservations";
import { type Location, useBays, useLocations } from "../app/sites";
import { Button } from "../components/Button";
import { LocationSelect } from "../components/LocationSelect";
import { FormAlert, PageHeader } from "../components/Page";
import { TextField } from "../components/TextField";
import { todayIn } from "../lib/time";
import {
	type ReservationAction,
	ReservationDirectory,
} from "./ReservationDirectory";

export function ReservationsPage() {
	const locations = useLocations();
	const roles = useActiveRoles();
	const [selectedId, setSelectedId] = useState<string>();
	const location =
		locations.data?.find((item) => item.id === selectedId) ??
		locations.data?.[0];
	const canManage = roles.includes("OWNER") || roles.includes("MANAGER");

	return (
		<section
			aria-labelledby="reservations-heading"
			className="flex flex-col gap-6"
		>
			<PageHeader
				id="reservations-heading"
				title="Reservations"
				description="Plan arrivals and resolve bay conflicts before vehicles reach the gate."
				actions={
					location && (
						<LocationSelect
							locations={locations.data ?? []}
							value={location.id}
							onChange={setSelectedId}
						/>
					)
				}
			/>
			{locations.isPending && (
				<p className="text-ink-muted">Loading locations…</p>
			)}
			{locations.isError && (
				<FormAlert>{errorMessage(locations.error)}</FormAlert>
			)}
			{locations.isSuccess && !location && (
				<p className="text-ink-muted">No locations yet.</p>
			)}
			{location && (
				<ReservationBoard
					key={location.id}
					location={location}
					canManage={canManage}
				/>
			)}
		</section>
	);
}

function ReservationBoard({
	location,
	canManage,
}: {
	location: Location;
	canManage: boolean;
}) {
	const [date, setDate] = useState(() => todayIn(location.timezone));
	const reservations = useStaffReservations({ locationId: location.id, date });
	const [action, setAction] = useState<ReservationAction>();
	const [notice, setNotice] = useState<string>();
	const panel = useRef<HTMLElement>(null);
	const search = useRef<HTMLInputElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const restoreFocus = useRef(false);
	const selected = reservations.data?.find(
		(item) => item.id === action?.reservationId,
	);
	useEffect(() => {
		if (action) panel.current?.focus();
		else if (restoreFocus.current) {
			restoreFocus.current = false;
			if (trigger.current?.isConnected) trigger.current.focus();
			else search.current?.focus();
		}
	}, [action]);

	function start(next: ReservationAction, button: HTMLButtonElement) {
		trigger.current = button;
		setAction(next);
		setNotice(undefined);
	}
	function close() {
		restoreFocus.current = true;
		setAction(undefined);
	}
	function finish(message: string) {
		// Successful mutations can remove their row from the active filters.
		trigger.current = null;
		close();
		setNotice(message);
	}

	return (
		<>
			<div className="flex flex-wrap items-end gap-4">
				<TextField
					label="Date"
					type="date"
					value={date}
					className="max-w-xs"
					onChange={(event) => {
						setDate(event.target.value);
						setAction(undefined);
						setNotice(undefined);
					}}
				/>
				<p className="pb-2 text-meta text-ink-muted">
					Times shown in {location.timezone}
				</p>
			</div>
			{notice && (
				<p
					role="status"
					className="rounded-control bg-available-bg p-3 text-dense text-available"
				>
					{notice}
				</p>
			)}
			{reservations.isPending && (
				<p className="text-ink-muted">Loading reservations…</p>
			)}
			{reservations.isError && (
				<FormAlert>{errorMessage(reservations.error)}</FormAlert>
			)}
			{reservations.data && (
				<div hidden={!reservations.isSuccess}>
					<ReservationDirectory
						reservations={reservations.data}
						timezone={location.timezone}
						canManage={canManage}
						action={action}
						onAction={start}
						searchRef={search}
					>
						{selected && action && canManage && (
							<section
								ref={panel}
								tabIndex={-1}
								aria-label="Reservation action"
								className="reservation-action-panel"
							>
								{action.kind === "move" ? (
									<MoveForm
										key={selected.id}
										reservation={selected}
										location={location}
										onDone={finish}
										onClose={close}
									/>
								) : (
									<CancelForm
										key={selected.id}
										reservation={selected}
										onDone={finish}
										onClose={close}
									/>
								)}
							</section>
						)}
					</ReservationDirectory>
				</div>
			)}
		</>
	);
}

function MoveForm({
	reservation,
	location,
	onDone,
	onClose,
}: {
	reservation: Reservation;
	location: Location;
	onDone: (message: string) => void;
	onClose: () => void;
}) {
	const bays = useBays(location.id);
	const relocate = useRelocate();
	const baySelectId = useId();
	const [bayId, setBayId] = useState("");
	const actionable =
		reservation.status === "HOLD" || reservation.status === "CONFIRMED";
	const targets =
		bays.data?.filter(
			(bay) =>
				bay.mode === "RESERVABLE" &&
				bay.state === "ACTIVE" &&
				bay.vehicleClass === reservation.vehicleClass &&
				bay.id !== reservation.bayId,
		) ?? [];

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!actionable || relocate.isPending) return;
		relocate.mutate(
			{
				reservationId: reservation.id,
				bayId,
				expectedRevision: reservation.revision,
			},
			{
				onSuccess: (moved) =>
					onDone(
						`Reservation ${moved.reference} moved to bay ${moved.bayLabel}.`,
					),
			},
		);
	}

	return (
		<form
			onSubmit={onSubmit}
			noValidate
			aria-labelledby="move-heading"
			className="flex flex-col gap-4"
		>
			<h2 id="move-heading" className="text-section font-semibold">
				Move {reservation.reference} from bay {reservation.bayLabel}
			</h2>
			{!actionable && !relocate.isPending && (
				<p>This reservation can no longer be moved.</p>
			)}
			{relocate.isError && (
				<FormAlert>{errorMessage(relocate.error)}</FormAlert>
			)}
			{bays.isError && <FormAlert>{errorMessage(bays.error)}</FormAlert>}
			<div className="flex max-w-xs flex-col gap-1 text-dense font-medium">
				<label htmlFor={baySelectId}>Move to bay</label>
				<select
					id={baySelectId}
					value={bayId}
					onChange={(event) => setBayId(event.target.value)}
					className="min-h-11 rounded-control border border-control bg-surface px-3 font-normal"
				>
					<option value="" disabled>
						Choose a bay
					</option>
					{targets.map((bay) => (
						<option key={bay.id} value={bay.id}>
							{bay.label}
						</option>
					))}
				</select>
			</div>
			<p className="text-meta text-ink-muted">
				These bays match the vehicle type. Availability is checked when you
				confirm the move.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button
					type="submit"
					pending={relocate.isPending}
					disabled={!bayId || !actionable}
				>
					Move reservation
				</Button>
				<Button variant="secondary" onClick={onClose}>
					Close
				</Button>
			</div>
		</form>
	);
}

function CancelForm({
	reservation,
	onDone,
	onClose,
}: {
	reservation: Reservation;
	onDone: (message: string) => void;
	onClose: () => void;
}) {
	const cancel = useCancelReservation();
	const [reason, setReason] = useState("");
	const actionable =
		reservation.status === "HOLD" || reservation.status === "CONFIRMED";

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!actionable || cancel.isPending) return;
		cancel.mutate(
			{ reservationId: reservation.id, reason },
			{
				onSuccess: (cancelled) =>
					onDone(`Reservation ${cancelled.reference} cancelled.`),
			},
		);
	}

	return (
		<form
			onSubmit={onSubmit}
			noValidate
			aria-labelledby="cancel-heading"
			className="flex flex-col gap-4"
		>
			<h2 id="cancel-heading" className="text-section font-semibold">
				Cancel {reservation.reference} for {reservation.customerName}
			</h2>
			{!actionable && !cancel.isPending && (
				<p>This reservation can no longer be cancelled.</p>
			)}
			{cancel.isError && <FormAlert>{errorMessage(cancel.error)}</FormAlert>}
			<TextField
				label="Reason"
				maxLength={240}
				hint="Recorded with the cancellation."
				value={reason}
				onChange={(event) => setReason(event.target.value)}
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					type="submit"
					variant="danger"
					pending={cancel.isPending}
					disabled={!reason.trim() || !actionable}
				>
					Cancel reservation
				</Button>
				<Button variant="secondary" onClick={onClose}>
					Close
				</Button>
			</div>
		</form>
	);
}
