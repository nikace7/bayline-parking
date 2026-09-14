import { SquareParking } from "lucide-react";
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
import { type BayState, BayTile } from "../components/BayTile";
import { LocationSelect } from "../components/LocationSelect";
import { formatClock, formatElapsed } from "../lib/time";
import { EntryPanel, ShiftBar, VisitPanel } from "./GatePanels";

function tileState(bay: Bay, visit?: VisitSummary): BayState {
	if (visit) return "occupied";
	return bay.state === "OUT_OF_SERVICE" ? "outOfService" : "available";
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
				<div className="rounded-panel border border-inset bg-surface p-8 text-center">
					<SquareParking
						aria-hidden
						className="mx-auto size-10 text-ink-muted"
					/>
					<h2 className="mt-3 text-section font-semibold">No locations yet</h2>
					<p className="mt-1 text-ink-muted">
						Bays appear here once an owner sets up{" "}
						<Link
							to="/settings/sites"
							className="font-medium text-brand underline"
						>
							sites
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
			<p className="text-dense text-ink-muted tabular-nums">
				<span className="font-semibold text-ink">{visitByBay.size}</span> parked
				· <span className="font-semibold text-ink">{walkInFree}</span> walk-in
				bays free · as of {formatClock(asOf, location.timezone, true)}
			</p>
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
				<ul
					aria-label={`Bays at ${location.name}`}
					className="flex flex-wrap gap-2"
				>
					{bays.data.map((bay) => {
						const visit = visitByBay.get(bay.id);
						return (
							<li key={bay.id}>
								<BayTile
									label={bay.label}
									vehicleClass={bay.vehicleClass}
									state={tileState(bay, visit)}
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
					className="flex flex-col gap-4 rounded-panel border border-inset bg-surface p-4"
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
					{selectedBay && !selectedVisit && (
						<EntryPanel
							key={selectedBay.id}
							bay={selectedBay}
							location={location}
						/>
					)}
				</aside>
			</div>
		</>
	);
}
