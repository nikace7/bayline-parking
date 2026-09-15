import { Fragment } from "react";
import type { Reservation } from "../app/reservations";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatClock, formatDateTime } from "../lib/time";

/** A reservation's reference, place and times, in the location's time zone. */
export function ReservationFacts({
	reservation,
}: {
	reservation: Reservation;
}) {
	const zone = reservation.timezone;
	const rows: [string, string][] = [
		["Reference", reservation.reference],
		["Location", `${reservation.locationName}, ${reservation.locationAddress}`],
		[
			"Bay",
			`${reservation.bayLabel} · ${VEHICLE_LABEL[reservation.vehicleClass]}`,
		],
		["Plate", reservation.plate],
		["From", formatDateTime(reservation.startsAt, zone)],
		["Until", formatDateTime(reservation.endsAt, zone)],
		[
			"Check-in",
			`${formatClock(reservation.arrivalOpensAt, zone)}–${formatClock(reservation.arrivalClosesAt, zone)}`,
		],
	];
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-dense">
			{rows.map(([label, value]) => (
				<Fragment key={label}>
					<dt className="text-ink-muted">{label}</dt>
					<dd className={label === "Reference" ? "font-mono" : undefined}>
						{value}
					</dd>
				</Fragment>
			))}
		</dl>
	);
}
