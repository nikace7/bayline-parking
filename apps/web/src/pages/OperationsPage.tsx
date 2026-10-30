import { useState } from "react";
import { Link } from "react-router";
import {
	useActiveRoles,
	useParkedVisits,
	type VisitSummary,
} from "../app/gate";
import { dueReservation, useStaffReservations } from "../app/reservations";
import { type Bay, type Location, useBays, useLocations } from "../app/sites";
import { type BayState, BayTile } from "../components/BayTile";
import { Button } from "../components/Button";
import { Grid } from "../components/icons";
import { LocationSelect } from "../components/LocationSelect";
import { Metric, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
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
			<PageHeader
				id="operations-heading"
				title="Operations"
				description="A clear view of your parking spaces. Select a bay to manage an arrival or exit."
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
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("all");
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
	const outOfService = bays.data.filter(
		(bay) => bay.state === "OUT_OF_SERVICE",
	).length;
	const visibleBays = bays.data.filter((bay) => {
		const visit = visitByBay.get(bay.id);
		const isReserved =
			bay.mode === "RESERVABLE" &&
			dueReservation(reservations.data ?? [], bay.id, now) !== undefined;
		const query = search.trim().toLocaleLowerCase();
		return (
			(status === "all" || tileState(bay, visit, isReserved) === status) &&
			`${bay.label} ${visit?.plate ?? ""}`.toLocaleLowerCase().includes(query)
		);
	});

	function select(bayId: string) {
		setSelectedBayId(bayId);
		setNotice(undefined);
	}

	return (
		<>
			<dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
				<Metric
					label="Parked"
					value={visitByBay.size}
					note="Vehicles currently on site"
				/>
				<Metric
					label="Walk-in bays free"
					value={walkInFree}
					note="Active walk-in spaces"
				/>
				<Metric
					label="Total bays"
					value={bays.data.length}
					note={location.name}
				/>
				<Metric
					label="Out of service"
					value={outOfService}
					note="Unavailable for new arrivals"
				/>
			</dl>
			{canTakeCash && <ShiftBar location={location} />}
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="bay-board">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
						<div>
							<h2 className="text-section font-semibold">Parking board</h2>
							<p className="mt-1 text-meta text-ink-muted">
								{location.name} · As of{" "}
								{formatClock(asOf, location.timezone, true)}
							</p>
						</div>
						<span className="rounded-full bg-inset px-3 py-1 text-meta font-medium text-brand">
							{visibleBays.length} of {bays.data.length} bays
						</span>
					</div>
					<div className="flex flex-wrap items-end gap-3 border-b border-line p-5">
						<TextField
							label="Search bays or plates"
							placeholder="e.g. A01 or a vehicle plate"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="min-w-0 flex-1 basis-48"
						/>
						<label className="flex min-w-0 flex-col gap-1.5 text-dense font-medium">
							Bay status
							<select
								value={status}
								onChange={(event) => setStatus(event.target.value)}
								className="min-h-11 border border-control bg-surface px-3 font-normal"
							>
								<option value="all">All bays</option>
								<option value="available">Available</option>
								<option value="occupied">Occupied</option>
								<option value="reserved">Reserved</option>
								<option value="outOfService">Out of service</option>
							</select>
						</label>
						{selectedBay && (
							<a
								className="min-h-11 py-3 text-dense font-medium text-brand underline xl:hidden"
								href="#selected-bay"
							>
								Go to selected bay
							</a>
						)}
					</div>
					{visibleBays.length === 0 && (
						<div className="empty-state">
							<Grid />
							<p>No bays match your filters.</p>
							<Button
								variant="secondary"
								className="mt-4"
								onClick={() => {
									setSearch("");
									setStatus("all");
								}}
							>
								Clear filters
							</Button>
						</div>
					)}
					<ul aria-label={`Bays at ${location.name}`} className="board-grid">
						{visibleBays.map((bay) => {
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
					<section
						className="flex flex-wrap gap-2 border-t border-line px-5 py-3"
						aria-label="Bay legend"
					>
						<StatusBadge tone="available">Available</StatusBadge>
						<StatusBadge tone="occupied">Occupied</StatusBadge>
						<StatusBadge tone="neutral">Reserved</StatusBadge>
						<StatusBadge tone="warning">Out of service</StatusBadge>
					</section>
				</div>
				<aside
					id="selected-bay"
					aria-label="Selected bay"
					className="selected-panel"
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
						<div className="empty-state">
							<Grid />
							<h2 className="mb-2 font-semibold text-ink">
								Ready when you are
							</h2>
							<p className="text-dense text-ink-muted">
								Select a bay to admit a vehicle or check one out.
							</p>
						</div>
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
