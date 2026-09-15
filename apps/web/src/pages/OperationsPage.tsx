import { useState } from "react";
import { Link } from "react-router";
import {
	type Bay,
	type Location,
	useActiveRoles,
	useBays,
	useLocations,
	useParkedVisits,
	type VisitSummary,
} from "../app/gate";
import { dueReservation, useStaffReservations } from "../app/reservations";
import { type BayState, BayTile } from "../components/BayTile";
import { LocationSelect } from "../components/LocationSelect";
import { formatClock, formatElapsed, todayIn } from "../lib/time";
import { ArrivalPanel, EntryPanel, ShiftBar, VisitPanel } from "./GatePanels";

function tileState(
	bay: Bay,
	visit: VisitSummary | undefined,
	isReserved: boolean,
): BayState {
	if (visit) return "occupied";
	if (bay.state === "OUT_OF_SERVICE") return "outOfService";
	return isReserved ? "reserved" : "available";
}

export function OperationsPage() {
	const [selectedId, setSelectedId] = useState<string>();
	const locations = useLocations();
	const location =
		locations.data?.find((item) => item.id === selectedId) ??
		locations.data?.[0];

	return (
		<section
			aria-labelledby="operations-heading"
			className="flex flex-col gap-6"
		>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h1 id="operations-heading" className="text-page font-semibold">
					Operations
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
				<p role="alert" className="rounded-control bg-error-bg p-3 text-error">
					Locations could not be loaded. Retry in a moment.
				</p>
			)}
			{locations.isSuccess && !location && (
				<div className="rounded-panel border border-line bg-surface p-6">
					<h2 className="text-section font-semibold">No locations yet</h2>
					<p className="mt-1 text-ink-muted">
						Bays appear here once an owner sets up a location in{" "}
						<Link
							to="/settings/sites"
							className="font-medium text-brand underline"
						>
							Sites
						</Link>
						.
					</p>
				</div>
			)}
			{location && <Gate key={location.id} location={location} />}
		</section>
	);
}

function Gate({ location }: { location: Location }) {
	const bays = useBays(location.id);
	const visits = useParkedVisits(location.id);
	// Shares the arrival panel's query, so marking due bays costs no extra request.
	const reservations = useStaffReservations({
		locationId: location.id,
		date: todayIn(location.timezone),
	});
	const roles = useActiveRoles();
	const [selectedBayId, setSelectedBayId] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const canTakeCash = roles.includes("OWNER") || roles.includes("CASHIER");

	if (bays.isPending || visits.isPending) {
		return <p className="text-ink-muted">Loading bays…</p>;
	}
	if (bays.isError || visits.isError) {
		return (
			<p role="alert" className="rounded-control bg-error-bg p-3 text-error">
				Occupancy could not be loaded. Retry in a moment.
			</p>
		);
	}

	const now = Date.now();
	const visitByBay = new Map(visits.data.map((visit) => [visit.bayId, visit]));
	const selectedBay = bays.data.find((bay) => bay.id === selectedBayId);
	const selectedVisit = selectedBay && visitByBay.get(selectedBay.id);
	const walkInFree = bays.data.filter(
		(bay) =>
			bay.mode === "WALK_IN" &&
			bay.state === "ACTIVE" &&
			!visitByBay.has(bay.id),
	).length;
	const asOf = new Date(visits.dataUpdatedAt).toISOString();

	function select(bayId: string) {
		setSelectedBayId(bayId);
		setNotice(undefined);
	}

	return (
		<>
			{canTakeCash && <ShiftBar location={location} />}
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
				<dl className="flex gap-8">
					<div>
						<dt className="text-dense text-ink-muted">Parked</dt>
						<dd className="text-count font-semibold tabular-nums">
							{visitByBay.size}
						</dd>
					</div>
					<div>
						<dt className="text-dense text-ink-muted">Walk-in bays free</dt>
						<dd className="text-count font-semibold tabular-nums">
							{walkInFree}
						</dd>
					</div>
				</dl>
				<p className="text-dense text-ink-muted tabular-nums">
					As of {formatClock(asOf, location.timezone, true)}
				</p>
			</div>
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<ul
					aria-label={`Bays at ${location.name}`}
					className="flex flex-wrap gap-2"
				>
					{bays.data.map((bay) => {
						const visit = visitByBay.get(bay.id);
						const isReserved =
							bay.mode === "RESERVABLE" &&
							dueReservation(reservations.data ?? [], bay.id, now) !==
								undefined;
						return (
							<li key={bay.id}>
								<BayTile
									label={bay.label}
									vehicleClass={bay.vehicleClass}
									state={tileState(bay, visit, isReserved)}
									duration={
										visit &&
										formatElapsed(visit.enteredAt, visits.dataUpdatedAt)
									}
									selected={bay.id === selectedBayId}
									onSelect={() => select(bay.id)}
								/>
							</li>
						);
					})}
				</ul>
				<aside
					aria-label="Selected bay"
					className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4"
				>
					{notice && (
						<p
							role="status"
							className="rounded-control bg-available-bg p-3 text-dense text-available"
						>
							{notice}
						</p>
					)}
					{!selectedBay && !notice && (
						<p className="text-ink-muted">
							Select a bay to admit a vehicle or check one out.
						</p>
					)}
					{selectedBay && selectedVisit && (
						<VisitPanel
							key={selectedVisit.id}
							visitId={selectedVisit.id}
							location={location}
							canTakeCash={canTakeCash}
							onExited={(visit) => {
								setNotice(`${visit.plate} left bay ${visit.bayLabel}.`);
								setSelectedBayId(undefined);
							}}
						/>
					)}
					{selectedBay &&
						!selectedVisit &&
						(selectedBay.mode === "RESERVABLE" ? (
							<ArrivalPanel
								key={selectedBay.id}
								bay={selectedBay}
								location={location}
							/>
						) : (
							<EntryPanel
								key={selectedBay.id}
								bay={selectedBay}
								location={location}
							/>
						))}
				</aside>
			</div>
		</>
	);
}
