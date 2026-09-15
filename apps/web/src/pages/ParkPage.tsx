import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { ApiError, errorMessage } from "../api/client";
import {
	type PublicLocation,
	type Reservation,
	useAvailability,
	useConfirmReservation,
	useHold,
	usePublicLocations,
	type VehicleClass,
} from "../app/reservations";
import { useSession } from "../app/session";
import { Button } from "../components/Button";
import { FormAlert } from "../components/Page";
import { ReservationFacts } from "../components/ReservationFacts";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatClock, zonedTimeToIso } from "../lib/time";

const STAYS = [
	{ minutes: 30, label: "30 minutes" },
	{ minutes: 60, label: "1 hour" },
	{ minutes: 120, label: "2 hours" },
	{ minutes: 240, label: "4 hours" },
	{ minutes: 480, label: "8 hours" },
	{ minutes: 720, label: "12 hours" },
];
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const SELECT_CLASS =
	"min-h-11 rounded-control border border-control bg-surface px-3 font-normal";

export function ParkPage() {
	const locations = usePublicLocations();
	const [locationId, setLocationId] = useState<string>();
	const selected = locations.data?.find((item) => item.id === locationId);

	return (
		<section aria-labelledby="park-heading" className="flex flex-col gap-6">
			<div>
				<h1 id="park-heading" className="text-page font-semibold">
					Find parking
				</h1>
				<p className="text-ink-muted">
					Reserve a bay ahead of time. A bay stays on hold for five minutes
					while you confirm.
				</p>
			</div>
			{locations.isPending && (
				<p className="text-ink-muted">Loading locations…</p>
			)}
			{locations.isError && (
				<FormAlert>{errorMessage(locations.error)}</FormAlert>
			)}
			{locations.isSuccess && (
				<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
					<ul aria-label="Parking locations" className="flex flex-col gap-2">
						{locations.data.length === 0 && (
							<li className="text-ink-muted">
								No location takes reservations yet.
							</li>
						)}
						{locations.data.map((location) => (
							<li
								key={location.id}
								className={`flex flex-wrap items-center justify-between gap-3 rounded-panel border bg-surface p-4 ${location.id === locationId ? "border-brand" : "border-line"}`}
							>
								<div>
									<h2 className="font-semibold">{location.name}</h2>
									<p className="text-dense text-ink-muted">
										{location.organisationName} · {location.address}
									</p>
									<p className="text-dense tabular-nums">
										{location.reservableBays} reservable{" "}
										{location.reservableBays === 1 ? "bay" : "bays"}
									</p>
								</div>
								<Button
									variant={location.id === locationId ? "primary" : "secondary"}
									disabled={!location.reservableBays}
									aria-label={`Reserve at ${location.name}`}
									onClick={() => setLocationId(location.id)}
								>
									Reserve
								</Button>
							</li>
						))}
					</ul>
					{selected ? (
						<ReserveForm key={selected.id} location={selected} />
					) : (
						<p className="rounded-panel border border-line bg-surface p-4 text-ink-muted">
							Choose a location to see its free bays.
						</p>
					)}
				</div>
			)}
		</section>
	);
}

function ReserveForm({ location }: { location: PublicLocation }) {
	const session = useSession();
	const hold = useHold();
	const confirm = useConfirmReservation();
	const [vehicleClass, setVehicleClass] = useState<VehicleClass>("CAR");
	const [arrival, setArrival] = useState("");
	const [minutes, setMinutes] = useState(60);
	const [plate, setPlate] = useState("");

	const startsAt = LOCAL_DATE_TIME.test(arrival)
		? zonedTimeToIso(arrival, location.timezone)
		: null;
	const endsAt =
		startsAt && new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();
	const availability = useAvailability(
		startsAt && endsAt
			? { locationId: location.id, vehicleClass, startsAt, endsAt }
			: null,
	);
	const reservation = confirm.data ?? hold.data;

	if (reservation) {
		return <HeldReservation reservation={reservation} confirm={confirm} />;
	}

	const timeError =
		availability.error instanceof ApiError
			? (availability.error.fieldError("startsAt") ??
				availability.error.fieldError("endsAt"))
			: undefined;
	const free = availability.data?.availableBays ?? 0;

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (startsAt && endsAt) {
			hold.mutate({
				locationId: location.id,
				vehicleClass,
				plate,
				startsAt,
				endsAt,
			});
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			noValidate
			aria-labelledby="reserve-heading"
			className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4"
		>
			<div>
				<h2 id="reserve-heading" className="text-section font-semibold">
					Reserve at {location.name}
				</h2>
				<p className="text-dense text-ink-muted">
					Times are local to the location ({location.timezone}).
				</p>
			</div>
			{hold.isError && <FormAlert>{errorMessage(hold.error)}</FormAlert>}
			{availability.isError && !timeError && (
				<FormAlert>{errorMessage(availability.error)}</FormAlert>
			)}
			<label className="flex flex-col gap-1 text-dense font-medium">
				Vehicle
				<select
					value={vehicleClass}
					onChange={(event) =>
						setVehicleClass(event.target.value as VehicleClass)
					}
					className={SELECT_CLASS}
				>
					{(Object.keys(VEHICLE_LABEL) as VehicleClass[]).map((value) => (
						<option key={value} value={value}>
							{VEHICLE_LABEL[value]}
						</option>
					))}
				</select>
			</label>
			<TextField
				label="Arrival"
				type="datetime-local"
				value={arrival}
				error={timeError}
				onChange={(event) => setArrival(event.target.value)}
			/>
			<label className="flex flex-col gap-1 text-dense font-medium">
				Stay
				<select
					value={minutes}
					onChange={(event) => setMinutes(Number(event.target.value))}
					className={SELECT_CLASS}
				>
					{STAYS.map((stay) => (
						<option key={stay.minutes} value={stay.minutes}>
							{stay.label}
						</option>
					))}
				</select>
			</label>
			<p aria-live="polite" className="text-dense tabular-nums">
				{availability.isSuccess &&
					(free
						? `${free} ${free === 1 ? "bay" : "bays"} free for this time.`
						: "No bay is free for this time. Try another time.")}
			</p>
			{session.data?.user ? (
				<>
					<TextField
						label="Plate"
						autoComplete="off"
						maxLength={16}
						value={plate}
						onChange={(event) => setPlate(event.target.value)}
					/>
					<Button
						type="submit"
						pending={hold.isPending}
						disabled={!plate.trim() || !free}
					>
						Hold a bay
					</Button>
				</>
			) : (
				<p className="text-dense text-ink-muted">
					<Link to="/login" className="font-medium text-brand underline">
						Sign in
					</Link>{" "}
					or{" "}
					<Link
						to="/account/register"
						className="font-medium text-brand underline"
					>
						create an account
					</Link>{" "}
					to hold a bay.
				</p>
			)}
		</form>
	);
}

function HeldReservation({
	reservation,
	confirm,
}: {
	reservation: Reservation;
	confirm: ReturnType<typeof useConfirmReservation>;
}) {
	const confirmed = reservation.status === "CONFIRMED";
	return (
		<div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4">
			{confirmed ? (
				<p
					role="status"
					className="rounded-control bg-available-bg p-3 text-available"
				>
					Reservation {reservation.reference} is confirmed.
				</p>
			) : (
				<p className="rounded-control bg-warning-bg p-3 text-warning">
					Bay {reservation.bayLabel} is held until{" "}
					{reservation.holdExpiresAt &&
						formatClock(reservation.holdExpiresAt, reservation.timezone)}
					. Confirm to keep it.
				</p>
			)}
			{confirm.isError && <FormAlert>{errorMessage(confirm.error)}</FormAlert>}
			<ReservationFacts reservation={reservation} />
			{confirmed ? (
				<Link
					to={`/account/reservations/${reservation.id}`}
					className="font-medium text-brand underline"
				>
					View reservation
				</Link>
			) : (
				<Button
					pending={confirm.isPending}
					onClick={() => confirm.mutate(reservation.id)}
				>
					Confirm reservation
				</Button>
			)}
		</div>
	);
}
