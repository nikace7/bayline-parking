import {
	type FormEvent,
	Fragment,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { Link } from "react-router";
import { errorMessage } from "../api/client";
import {
	type Quote,
	useAdmit,
	useCashPayment,
	useCheckout,
	useCurrentShift,
	useExit,
	useOpenShift,
	useQuote,
	useVisit,
	type Visit,
} from "../app/gate";
import { dueReservation, useStaffReservations } from "../app/reservations";
import type { Bay, Location } from "../app/sites";
import { Button } from "../components/Button";
import { FormAlert } from "../components/Page";
import { StatusBadge, type Tone } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatPaisa, parseRupees } from "../lib/money";
import { formatClock, formatDuration, todayIn } from "../lib/time";

const STAGE: Record<Visit["stage"], { tone: Tone; label: string }> = {
	PARKED: { tone: "occupied", label: "Parked" },
	CHECKOUT_PENDING: { tone: "warning", label: "Payment due" },
	EXIT_READY: { tone: "available", label: "Ready to exit" },
	EXITED: { tone: "neutral", label: "Exited" },
};

function PanelNote({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<h2 className="text-section font-semibold">{title}</h2>
			<p className="text-ink-muted">{children}</p>
		</div>
	);
}

export function ShiftBar({ location }: { location: Location }) {
	const shift = useCurrentShift();
	const openShift = useOpenShift();
	const [float, setFloat] = useState("");

	if (!shift.isSuccess) {
		return null;
	}
	const current = shift.data.shift;
	if (current) {
		const elsewhere = current.locationId !== location.id;
		return (
			<p
				className={`rounded-control p-3 text-dense ${elsewhere ? "bg-warning-bg text-warning" : "bg-available-bg text-available"}`}
			>
				{elsewhere
					? `Your cash shift is open at ${current.locationName}. Taking cash here needs a shift at this location.`
					: `Cash shift open since ${formatClock(current.openedAt, location.timezone)} · opening float ${formatPaisa(current.openingFloatPaisa)}`}
			</p>
		);
	}

	const paisa = parseRupees(float);
	const fieldError =
		float && paisa === null
			? "Enter an amount such as 1000 or 1000.50."
			: openShift.isError
				? errorMessage(openShift.error)
				: undefined;

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (paisa !== null) {
			openShift.mutate({ locationId: location.id, openingFloatPaisa: paisa });
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			noValidate
			className="flex flex-wrap items-end gap-3 rounded-panel border border-line bg-surface p-4"
		>
			<TextField
				label="Opening cash float (NPR)"
				inputMode="decimal"
				autoComplete="off"
				value={float}
				error={fieldError}
				onChange={(event) => setFloat(event.target.value)}
			/>
			<Button
				type="submit"
				pending={openShift.isPending}
				disabled={paisa === null}
			>
				Open cash shift
			</Button>
		</form>
	);
}

export function EntryPanel({
	bay,
	location,
}: {
	bay: Bay;
	location: Location;
}) {
	const admit = useAdmit();
	const [plate, setPlate] = useState("");
	const plateInput = useRef<HTMLInputElement>(null);

	// Scanner input lands in the plate field as soon as a free bay is chosen.
	useEffect(() => plateInput.current?.focus(), []);

	if (bay.state !== "ACTIVE") {
		return (
			<PanelNote title={`Bay ${bay.label}`}>
				This bay is out of service.
			</PanelNote>
		);
	}

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		admit.mutate({
			locationId: location.id,
			bayId: bay.id,
			plate,
			vehicleClass: bay.vehicleClass,
		});
	}

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
			<div>
				<h2 className="text-section font-semibold">Admit to bay {bay.label}</h2>
				<p className="text-dense text-ink-muted">
					{VEHICLE_LABEL[bay.vehicleClass]} bay at {location.name}
				</p>
			</div>
			{admit.isError && <FormAlert>{errorMessage(admit.error)}</FormAlert>}
			<TextField
				ref={plateInput}
				label="Plate"
				autoComplete="off"
				maxLength={16}
				hint="Type the plate or scan it."
				value={plate}
				onChange={(event) => setPlate(event.target.value)}
			/>
			<Button type="submit" pending={admit.isPending} disabled={!plate.trim()}>
				Confirm entry
			</Button>
		</form>
	);
}

/**
 * A reservable bay admits only the reservation whose arrival window is open. Windows on one bay
 * never overlap (bookings last at least 30 minutes), so at most one reservation is due. The
 * server rechecks the window, the plate and any overstaying vehicle.
 */
export function ArrivalPanel({
	bay,
	location,
}: {
	bay: Bay;
	location: Location;
}) {
	const zone = location.timezone;
	const reservations = useStaffReservations({
		locationId: location.id,
		date: todayIn(zone),
	});
	const admit = useAdmit();
	const [plate, setPlate] = useState("");
	const plateInput = useRef<HTMLInputElement>(null);

	useEffect(() => plateInput.current?.focus(), []);

	if (bay.state !== "ACTIVE") {
		return (
			<PanelNote title={`Bay ${bay.label}`}>
				This bay is out of service.
			</PanelNote>
		);
	}
	if (reservations.isPending) {
		return <p className="text-ink-muted">Loading reservations…</p>;
	}
	if (reservations.isError) {
		return <FormAlert>{errorMessage(reservations.error)}</FormAlert>;
	}

	const now = Date.now();
	const waiting = reservations.data.filter(
		(item) => item.bayId === bay.id && item.status === "CONFIRMED",
	);
	const due = dueReservation(waiting, bay.id, now);
	if (!due) {
		const next = waiting.find((item) => Date.parse(item.arrivalOpensAt) > now);
		return (
			<PanelNote title={`Bay ${bay.label}`}>
				{next
					? `Kept for reservation ${next.reference}. Check-in opens at ${formatClock(next.arrivalOpensAt, zone)}.`
					: "This bay is kept for reservations. None is due to arrive now."}
			</PanelNote>
		);
	}
	const reservation = due;

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		admit.mutate({
			locationId: location.id,
			bayId: bay.id,
			plate,
			vehicleClass: bay.vehicleClass,
			reservationId: reservation.id,
		});
	}

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
			<div>
				<h2 className="text-section font-semibold">
					Check in to bay {bay.label}
				</h2>
				<p className="text-dense text-ink-muted">
					Reservation <span className="font-mono">{reservation.reference}</span>{" "}
					· {reservation.customerName} ·{" "}
					{formatClock(reservation.startsAt, zone)}–
					{formatClock(reservation.endsAt, zone)}
				</p>
				<p className="text-dense">
					Expected plate{" "}
					<span className="font-medium">{reservation.plate}</span>
				</p>
			</div>
			{admit.isError && <FormAlert>{errorMessage(admit.error)}</FormAlert>}
			<TextField
				ref={plateInput}
				label="Plate"
				autoComplete="off"
				maxLength={16}
				hint="Type or scan the plate on the vehicle."
				value={plate}
				onChange={(event) => setPlate(event.target.value)}
			/>
			<Button type="submit" pending={admit.isPending} disabled={!plate.trim()}>
				Confirm check-in
			</Button>
		</form>
	);
}

type Fee = Pick<
	Quote,
	| "billableSeconds"
	| "blocks"
	| "basePaisa"
	| "discountPaisa"
	| "taxPaisa"
	| "totalPaisa"
>;

function FeeBreakdown({ fee, caption }: { fee: Fee; caption: string }) {
	const rows: [string, string][] = [
		["Billed time", formatDuration(fee.billableSeconds)],
		["Started blocks", String(fee.blocks)],
		["Base charge", formatPaisa(fee.basePaisa)],
	];
	if (fee.discountPaisa)
		rows.push(["Discount", formatPaisa(-fee.discountPaisa)]);
	if (fee.taxPaisa) rows.push(["Tax", formatPaisa(fee.taxPaisa)]);

	return (
		<div className="rounded-control bg-inset p-3">
			<dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-dense tabular-nums">
				{rows.map(([label, value]) => (
					<Fragment key={label}>
						<dt className="text-ink-muted">{label}</dt>
						<dd className="text-right">{value}</dd>
					</Fragment>
				))}
				<dt className="font-semibold">Total</dt>
				<dd className="text-right font-semibold">
					{formatPaisa(fee.totalPaisa)}
				</dd>
			</dl>
			<p className="mt-2 text-meta text-ink-muted">{caption}</p>
		</div>
	);
}

export function VisitPanel({
	visitId,
	location,
	canTakeCash,
	canCheckout,
	canExit,
	onExited,
}: {
	visitId: string;
	location: Location;
	canTakeCash: boolean;
	canCheckout: boolean;
	canExit: boolean;
	onExited: (visit: Visit) => void;
}) {
	const visit = useVisit(visitId);
	const shift = useCurrentShift();
	const quote = useQuote(visitId);
	const checkout = useCheckout(visitId);
	const cash = useCashPayment(visitId);
	const exit = useExit(visitId);

	if (visit.isPending) {
		return <p className="text-ink-muted">Loading visit…</p>;
	}
	if (visit.isError) {
		return <FormAlert>{errorMessage(visit.error)}</FormAlert>;
	}

	const { stage, invoice, duePaisa } = visit.data;
	const quoted = quote.data;
	const failure = [quote, checkout, cash, exit].find(
		(step) => step.isError,
	)?.error;
	const shiftHere = shift.data?.shift?.locationId === location.id;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-meta text-ink-muted">
						{visit.data.bayId ? "Bay" : "Area"} {visit.data.bayLabel}
					</p>
					<h2 className="text-section font-semibold">{visit.data.plate}</h2>
					<p className="text-dense text-ink-muted">
						Entered {formatClock(visit.data.enteredAt, location.timezone)}
					</p>
				</div>
				<StatusBadge tone={STAGE[stage].tone}>{STAGE[stage].label}</StatusBadge>
			</div>

			{failure && <FormAlert>{errorMessage(failure)}</FormAlert>}

			{stage === "PARKED" && canCheckout && !quoted && (
				<Button
					pending={quote.isPending}
					onClick={() =>
						quote.mutate(undefined, { onSuccess: () => checkout.reset() })
					}
				>
					Get checkout quote
				</Button>
			)}
			{stage === "PARKED" && canCheckout && quoted && (
				<>
					<FeeBreakdown
						fee={quoted}
						caption={`Quote valid until ${formatClock(quoted.expiresAt, location.timezone, true)}`}
					/>
					<Button
						pending={checkout.isPending}
						onClick={() =>
							checkout.mutate(quoted.quoteToken, {
								onError: () => quote.reset(),
							})
						}
					>
						Confirm checkout
					</Button>
				</>
			)}

			{invoice && stage !== "EXITED" && (
				<FeeBreakdown
					fee={invoice}
					caption={`Charged up to ${formatClock(invoice.cutoffAt, location.timezone, true)}`}
				/>
			)}
			{visit.data.receipt && (
				<Link
					to={`/receipts/${visit.data.receipt.id}`}
					className="font-medium text-brand underline"
				>
					Receipt {visit.data.receipt.number}
				</Link>
			)}
			{stage === "CHECKOUT_PENDING" && invoice && duePaisa !== null && (
				<>
					{canTakeCash && shiftHere && (
						<Button
							pending={cash.isPending}
							onClick={() =>
								cash.mutate({ invoiceId: invoice.id, amountPaisa: duePaisa })
							}
						>
							Take cash {formatPaisa(duePaisa)}
						</Button>
					)}
					{canTakeCash && !shiftHere && (
						<p className="text-dense text-ink-muted">
							Open a cash shift at this location to take cash.
						</p>
					)}
					{!canTakeCash && (
						<p className="text-dense text-ink-muted">
							{formatPaisa(duePaisa)} is due. A cashier takes the payment.
						</p>
					)}
				</>
			)}
			{stage === "PARKED" && !canCheckout && (
				<p className="text-dense text-ink-muted">
					Only owners, operators and cashiers can prepare checkout.
				</p>
			)}
			{stage === "EXIT_READY" && !canExit && (
				<p className="text-dense text-ink-muted">
					An owner or operator records the exit at the gate.
				</p>
			)}
			{stage === "EXIT_READY" && canExit && (
				<Button
					pending={exit.isPending}
					onClick={() => exit.mutate(undefined, { onSuccess: onExited })}
				>
					Record exit
				</Button>
			)}
		</div>
	);
}
