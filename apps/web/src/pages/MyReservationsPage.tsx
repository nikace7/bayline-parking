import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { errorMessage } from "../api/client";
import {
	useCancelReservation,
	useConfirmReservation,
	useMyReservation,
	useMyReservations,
} from "../app/reservations";
import { useSession } from "../app/session";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FormAlert, PageHeader } from "../components/Page";
import { ReservationFacts } from "../components/ReservationFacts";
import { StatusBadge } from "../components/StatusBadge";
import { RESERVATION_STATUS } from "../lib/labels";
import { formatClock, formatDateTime } from "../lib/time";

function useSignedIn() {
	const session = useSession();
	return {
		pending: session.isPending,
		signedOut: session.isSuccess && !session.data.user,
		signedIn: Boolean(session.data?.user),
	};
}

export function MyReservationsPage() {
	const account = useSignedIn();
	const reservations = useMyReservations(account.signedIn);

	if (account.signedOut) {
		return <Navigate to="/login" replace />;
	}

	return (
		<section
			aria-labelledby="my-reservations-heading"
			className="flex flex-col gap-4"
		>
			<PageHeader
				id="my-reservations-heading"
				title="My reservations"
				description="Your upcoming arrivals and previous bookings, together in one place."
				actions={
					<Link
						to="/park"
						className="inline-flex min-h-11 items-center rounded-control bg-brand px-4 text-dense font-medium text-on-brand hover:bg-brand-strong"
					>
						Reserve another bay
					</Link>
				}
			/>
			{(account.pending || reservations.isPending) && (
				<p className="text-ink-muted">Loading reservations…</p>
			)}
			{reservations.isError && (
				<FormAlert>{errorMessage(reservations.error)}</FormAlert>
			)}
			{reservations.isSuccess && (
				<DataTable
					caption="Your reservations, latest first"
					headings={["Reference", "Location", "Bay", "When", "Status"]}
					empty="No reservations yet."
					rows={reservations.data.map((reservation) => ({
						key: reservation.id,
						cells: [
							<Link
								key="reference"
								to={`/account/reservations/${reservation.id}`}
								className="font-mono font-semibold text-brand underline"
							>
								{reservation.reference}
							</Link>,
							reservation.locationName,
							reservation.bayLabel,
							`${formatDateTime(reservation.startsAt, reservation.timezone)}–${formatClock(reservation.endsAt, reservation.timezone)}`,
							<StatusBadge
								key="status"
								tone={RESERVATION_STATUS[reservation.status].tone}
							>
								{RESERVATION_STATUS[reservation.status].label}
							</StatusBadge>,
						],
					}))}
				/>
			)}
		</section>
	);
}

export function ReservationDetailPage() {
	const { reservationId = "" } = useParams();
	const account = useSignedIn();
	const reservation = useMyReservation(reservationId, account.signedIn);
	const confirm = useConfirmReservation();
	const cancel = useCancelReservation();
	const [cancelling, setCancelling] = useState(false);

	if (account.signedOut) {
		return <Navigate to="/login" replace />;
	}
	if (account.pending || reservation.isPending) {
		return <p className="text-ink-muted">Loading reservation…</p>;
	}
	if (reservation.isError) {
		return <FormAlert>{errorMessage(reservation.error)}</FormAlert>;
	}

	const { status } = reservation.data;
	const failure = confirm.error ?? cancel.error;

	return (
		<section
			aria-labelledby="reservation-heading"
			className="flex max-w-xl flex-col gap-4"
		>
			<Link
				to="/account/reservations"
				className="text-dense font-medium text-brand underline"
			>
				All reservations
			</Link>
			<PageHeader
				id="reservation-heading"
				title={
					<>
						Reservation{" "}
						<span className="font-mono">{reservation.data.reference}</span>
					</>
				}
				description="Keep this reference ready when you arrive at the gate."
				actions={
					<StatusBadge tone={RESERVATION_STATUS[status].tone}>
						{RESERVATION_STATUS[status].label}
					</StatusBadge>
				}
			/>
			{failure && <FormAlert>{errorMessage(failure)}</FormAlert>}
			<div className="rounded-panel border border-line bg-surface p-4">
				<ReservationFacts reservation={reservation.data} />
			</div>
			{status === "HOLD" && reservation.data.holdExpiresAt && (
				<p className="text-dense text-warning">
					Held until{" "}
					{formatClock(
						reservation.data.holdExpiresAt,
						reservation.data.timezone,
					)}
					. Confirm to keep the bay.
				</p>
			)}
			{status === "CANCELLED" && reservation.data.cancelReason && (
				<p className="text-dense text-ink-muted">
					Cancelled: {reservation.data.cancelReason}
				</p>
			)}
			<p className="text-dense text-ink-muted">
				Show the reference at the gate. Check-in opens 10 minutes before your
				start and closes 15 minutes after.
			</p>
			<div className="flex flex-wrap gap-2">
				{status === "HOLD" && (
					<Button
						pending={confirm.isPending}
						onClick={() => confirm.mutate(reservationId)}
					>
						Confirm reservation
					</Button>
				)}
				{(status === "HOLD" || status === "CONFIRMED") &&
					(cancelling ? (
						<>
							<Button
								variant="danger"
								pending={cancel.isPending}
								onClick={() =>
									cancel.mutate(
										{ reservationId },
										{ onSettled: () => setCancelling(false) },
									)
								}
							>
								Yes, cancel it
							</Button>
							<Button variant="secondary" onClick={() => setCancelling(false)}>
								Keep reservation
							</Button>
						</>
					) : (
						<Button variant="secondary" onClick={() => setCancelling(true)}>
							Cancel reservation
						</Button>
					))}
			</div>
		</section>
	);
}
