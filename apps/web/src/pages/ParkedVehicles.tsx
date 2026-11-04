import { useEffect, useId, useRef, useState } from "react";
import type { VisitSummary } from "../app/gate";
import type { Location } from "../app/sites";
import { Button } from "../components/Button";
import { Grid } from "../components/icons";
import { TextField } from "../components/TextField";
import { VISIT_STAGES, VisitStage } from "../components/VisitStage";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatClock, formatElapsed } from "../lib/time";
import { VisitPanel } from "./GatePanels";

const matching = (text: string) => text.replace(/\s/g, "").toLocaleLowerCase();

export function ParkedVehicles({
	location,
	visits,
	asOf,
	canTakeCash,
	canCheckout,
	canExit,
}: {
	location: Location;
	visits: VisitSummary[];
	asOf: number;
	canTakeCash: boolean;
	canCheckout: boolean;
	canExit: boolean;
}) {
	const [search, setSearch] = useState("");
	const statusId = useId();
	const [status, setStatus] = useState("");
	const [selected, setSelected] = useState<string>();
	const [notice, setNotice] = useState("");
	const panel = useRef<HTMLElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (selected) panel.current?.focus();
	}, [selected]);
	const rows = visits.filter(
		(visit) =>
			(!status || visit.stage === status) &&
			matching(`${visit.plate} ${visit.bayLabel}`).includes(matching(search)),
	);
	function close() {
		setSelected(undefined);
		if (trigger.current?.isConnected) trigger.current.focus();
		else input.current?.focus();
	}
	return (
		<section
			aria-label="Parked vehicles"
			className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"
		>
			<div className="vehicle-directory">
				<header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
					<div>
						<h2 className="text-section font-semibold">Parked vehicles</h2>
						<p className="mt-1 text-meta text-ink-muted">
							Find any parked vehicle across bays and open areas.
						</p>
					</div>
					<span className="text-dense tabular-nums text-ink-muted">
						{rows.length} of {visits.length} vehicles
					</span>
				</header>
				<div className="flex flex-wrap items-end gap-3 p-5">
					<TextField
						ref={input}
						label="Find parked vehicle"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Plate or parking space"
						className="min-w-0 flex-1 basis-52"
						type="search"
					/>
					<div className="flex min-w-0 flex-col gap-1.5 text-dense font-medium">
						<label htmlFor={statusId}>Visit status</label>
						<select
							id={statusId}
							className="min-h-11 border border-control bg-surface px-3"
							value={status}
							onChange={(event) => setStatus(event.target.value)}
						>
							<option value="">All visits</option>
							{(["PARKED", "CHECKOUT_PENDING", "EXIT_READY"] as const).map(
								(stage) => (
									<option value={stage} key={stage}>
										{VISIT_STAGES[stage].label}
									</option>
								),
							)}
						</select>
					</div>
				</div>
				<div className="vehicle-columns" aria-hidden="true">
					<span>Vehicle / space</span>
					<span>Arrived</span>
					<span>Duration</span>
					<span>Status</span>
					<span />
				</div>
				<ul aria-label="Parked vehicle results">
					{rows.map((visit) => (
						<li
							key={visit.id}
							className="vehicle-row"
							data-selected={selected === visit.id}
						>
							<div className="min-w-0">
								<p className="break-words font-mono font-semibold">
									{visit.plate}
								</p>
								<p className="mt-1 text-meta text-ink-muted">
									{visit.bayId ? "Bay" : "Area"} {visit.bayLabel} ·{" "}
									{VEHICLE_LABEL[visit.vehicleClass]}
								</p>
							</div>
							<p className="text-dense text-ink-muted">
								<span className="vehicle-mobile-label">Arrived </span>
								{formatClock(visit.enteredAt, location.timezone)}
							</p>
							<p className="text-dense tabular-nums">
								<span className="vehicle-mobile-label">Parked for </span>
								{formatElapsed(visit.enteredAt, asOf)}
							</p>
							<div className="vehicle-row-status">
								<VisitStage stage={visit.stage} />
							</div>
							<Button
								variant="secondary"
								className="vehicle-row-action"
								aria-label={`View ${visit.plate}`}
								aria-pressed={selected === visit.id}
								onClick={(event) => {
									trigger.current = event.currentTarget;
									if (selected === visit.id) panel.current?.focus();
									setSelected(visit.id);
									setNotice("");
								}}
							>
								View visit
							</Button>
						</li>
					))}
				</ul>
				{rows.length === 0 && (
					<div className="empty-state">
						<Grid />
						<p>
							{visits.length
								? "No vehicles match your filters."
								: "No vehicles are parked here."}
						</p>
						{(search || status) && (
							<Button
								className="mt-3"
								variant="secondary"
								onClick={() => {
									setSearch("");
									setStatus("");
								}}
							>
								Clear vehicle filters
							</Button>
						)}
					</div>
				)}
			</div>
			<aside
				ref={panel}
				tabIndex={-1}
				aria-label="Vehicle details"
				className="selected-panel"
			>
				{selected ? (
					<>
						<div className="flex justify-end">
							<Button variant="secondary" onClick={close}>
								Close vehicle details
							</Button>
						</div>
						<VisitPanel
							key={selected}
							visitId={selected}
							location={location}
							canTakeCash={canTakeCash}
							canCheckout={canCheckout}
							canExit={canExit}
							onExited={(visit) => {
								setNotice(`${visit.plate} exited.`);
								close();
							}}
						/>
					</>
				) : (
					<div className="empty-state">
						<Grid />
						<h2 className="mt-2 font-semibold text-ink">Select a vehicle</h2>
						<p className="mt-2 text-dense text-ink-muted">
							Review its visit and continue checkout.
						</p>
					</div>
				)}
				{notice && (
					<p
						role="status"
						className="rounded-control bg-available-bg p-3 text-dense text-available"
					>
						{notice}
					</p>
				)}
			</aside>
		</section>
	);
}
