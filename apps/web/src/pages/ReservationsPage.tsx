import { type FormEvent, useState } from "react";
import { errorMessage } from "../api/client";
import {
	type Location,
	useActiveRoles,
	useBays,
	useLocations,
} from "../app/gate";
import {
	type Reservation,
	useCancelReservation,
	useRelocate,
	useStaffReservations,
} from "../app/reservations";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { LocationSelect } from "../components/LocationSelect";
import { FormAlert } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { RESERVATION_STATUS } from "../lib/labels";
import { formatClock, todayIn } from "../lib/time";

type Action = { reservationId: string; kind: "move" | "cancel" };

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
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h1 id="reservations-heading" className="text-page font-semibold">
					Reservations
				</h1>
				{location && (
					<LocationSelect
						locations={locations.data ?? []}
						value={location.id}
						onChange={setSelectedId}
					/>
				)}
			</div>
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
	const [action, setAction] = useState<Action>();
	const [notice, setNotice] = useState<string>();
	const selected = reservations.data?.find(
		(item) => item.id === action?.reservationId,
	);
	const conflicts = reservations.data?.filter((item) => item.conflict) ?? [];
	const zone = location.timezone;

	function start(next: Action) {
		setAction(next);
		setNotice(undefined);
	}

	function finish(message: string) {
		setAction(undefined);
		setNotice(message);
	}

	return (
		<>
			<TextField
				label="Date"
				type="date"
				value={date}
				className="max-w-xs"
				onChange={(event) => setDate(event.target.value)}
			/>
			{notice && (
				<p
					role="status"
					className="rounded-control bg-available-bg p-3 text-dense text-available"
				>
					{notice}
				</p>
			)}
			{conflicts.length > 0 && (
				<p className="rounded-control bg-error-bg p-3 text-dense text-error">
					{conflicts.length === 1
						? "1 reservation is waiting for a bay that a vehicle is still occupying."
						: `${conflicts.length} reservations are waiting for bays that vehicles are still occupying.`}{" "}
					Move or cancel them before their arrival.
				</p>
			)}
			{reservations.isPending && (
				<p className="text-ink-muted">Loading reservations…</p>
			)}
			{reservations.isError && (
				<FormAlert>{errorMessage(reservations.error)}</FormAlert>
			)}
			{reservations.isSuccess && (
				<DataTable
					caption={`Reservations at ${location.name} on ${date}`}
					headings={[
						"Time",
						"Bay",
						"Plate",
						"Customer",
						"Reference",
						"Status",
						...(canManage ? ["Actions"] : []),
					]}
					empty="No reservations on this date."
					rows={reservations.data.map((reservation) => {
						const { tone, label } = RESERVATION_STATUS[reservation.status];
						const movable =
							reservation.status === "HOLD" ||
							reservation.status === "CONFIRMED";
						return {
							key: reservation.id,
							cells: [
								`${formatClock(reservation.startsAt, zone)}–${formatClock(reservation.endsAt, zone)}`,
								reservation.bayLabel,
								reservation.plate,
								reservation.customerName,
								<span key="reference" className="font-mono">
									{reservation.reference}
								</span>,
								<span key="status" className="flex flex-wrap gap-1">
									<StatusBadge tone={tone}>{label}</StatusBadge>
									{reservation.conflict && (
										<StatusBadge tone="error">Bay still occupied</StatusBadge>
									)}
								</span>,
								...(canManage
									? [
											movable ? (
												<span key="actions" className="flex flex-wrap gap-2">
													<Button
														variant="secondary"
														aria-label={`Move ${reservation.reference}`}
														onClick={() =>
															start({
																reservationId: reservation.id,
																kind: "move",
															})
														}
													>
														Move
													</Button>
													<Button
														variant="secondary"
														aria-label={`Cancel ${reservation.reference}`}
														onClick={() =>
															start({
																reservationId: reservation.id,
																kind: "cancel",
															})
														}
													>
														Cancel
													</Button>
												</span>
											) : (
												""
											),
										]
									: []),
							],
						};
					})}
				/>
			)}
			{selected && action?.kind === "move" && (
				<MoveForm
					key={selected.id}
					reservation={selected}
					location={location}
					onDone={finish}
					onClose={() => setAction(undefined)}
				/>
			)}
			{selected && action?.kind === "cancel" && (
				<CancelForm
					key={selected.id}
					reservation={selected}
					onDone={finish}
					onClose={() => setAction(undefined)}
				/>
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
	const [bayId, setBayId] = useState("");
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
			className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4"
		>
			<h2 id="move-heading" className="text-section font-semibold">
				Move {reservation.reference} from bay {reservation.bayLabel}
			</h2>
			{relocate.isError && (
				<FormAlert>{errorMessage(relocate.error)}</FormAlert>
			)}
			{bays.isError && <FormAlert>{errorMessage(bays.error)}</FormAlert>}
			<label className="flex max-w-xs flex-col gap-1 text-dense font-medium">
				Move to bay
				<select
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
			</label>
			<p className="text-meta text-ink-muted">
				The server rechecks both bays; a bay with an overlapping reservation or
				an overstaying vehicle is refused.
			</p>
			<div className="flex flex-wrap gap-2">
				<Button type="submit" pending={relocate.isPending} disabled={!bayId}>
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

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
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
			className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4"
		>
			<h2 id="cancel-heading" className="text-section font-semibold">
				Cancel {reservation.reference} for {reservation.customerName}
			</h2>
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
					disabled={!reason.trim()}
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
