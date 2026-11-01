import { type FormEvent, useState } from "react";
import { errorMessage } from "../api/client";
import { useAdmit, type VisitSummary } from "../app/gate";
import type { Location } from "../app/sites";
import { type CapacityPool, useZones } from "../app/zones";
import { Button } from "../components/Button";
import { FormAlert } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";
import { VisitPanel } from "./GatePanels";

export function OpenLotBoard({
	location,
	visits,
	canManageGate,
	canTakeCash,
	canCheckout,
	occupancyUnavailable = false,
}: {
	location: Location;
	visits: VisitSummary[];
	canManageGate: boolean;
	canTakeCash: boolean;
	canCheckout: boolean;
	occupancyUnavailable?: boolean;
}) {
	const zones = useZones(location.id);
	const admit = useAdmit();
	const [poolId, setPoolId] = useState<string>();
	const [visitId, setVisitId] = useState<string>();
	if (zones.isPending)
		return <p className="text-ink-muted">Loading open parking areas…</p>;
	if (!zones.data) return <FormAlert>{errorMessage(zones.error)}</FormAlert>;
	const areas = zones.data.filter((zone) => zone.mode === "OPEN_CAPACITY");
	if (!areas.length) return null;
	const options = areas.flatMap((zone) =>
		zone.pools.map((pool) => ({ zone, pool })),
	);
	const selected = options.find((item) => item.pool.id === poolId);
	return (
		<section aria-label="Open parking areas" className="flex flex-col gap-4">
			{zones.isError && (
				<FormAlert>
					Capacity could not be refreshed. Your draft is preserved; reconnect
					before admitting another vehicle.
				</FormAlert>
			)}
			<div>
				<h2 className="text-section font-semibold">Open parking areas</h2>
				<p className="text-dense text-ink-muted">
					Choose an area for arrivals. Vehicles keep their space until exit is
					recorded.
				</p>
			</div>
			<ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{options.map(({ zone, pool }) => (
					<li key={pool.id}>
						<button
							type="button"
							disabled={admit.isPending}
							aria-pressed={pool.id === poolId}
							aria-label={`${zone.name} · ${VEHICLE_LABEL[pool.vehicleClass]}`}
							className={`w-full rounded-panel border bg-surface p-4 text-left ${pool.id === poolId ? "border-brand" : "border-line"}`}
							onClick={() => {
								if (pool.id !== poolId) admit.reset();
								setPoolId(pool.id);
								setVisitId(undefined);
							}}
						>
							<span className="block font-semibold">{zone.name}</span>
							<span className="block text-dense text-ink-muted">
								{VEHICLE_LABEL[pool.vehicleClass]} · {pool.occupied} /{" "}
								{pool.capacity} parked
							</span>
							<StatusBadge
								tone={
									pool.state !== "ACTIVE"
										? "warning"
										: pool.occupied >= pool.capacity
											? "occupied"
											: "available"
								}
							>
								{pool.state !== "ACTIVE"
									? "Out of service"
									: `${Math.max(0, pool.capacity - pool.occupied)} spaces free`}
							</StatusBadge>
						</button>
					</li>
				))}
			</ul>
			{selected && (
				<div className="grid gap-5 rounded-panel border border-line bg-surface p-5 lg:grid-cols-2">
					<div className="flex min-w-0 flex-col gap-4">
						<h3 className="font-semibold">
							{selected.zone.name} · {VEHICLE_LABEL[selected.pool.vehicleClass]}
						</h3>
						{canManageGate && (
							<PoolEntry
								key={selected.pool.id}
								pool={selected.pool}
								admit={admit}
								capacityUnavailable={zones.isError || occupancyUnavailable}
								location={location}
							/>
						)}
						<h4 className="font-medium">Vehicles in this area</h4>
						{visits.filter((visit) => visit.poolId === poolId).length === 0 && (
							<p className="text-dense text-ink-muted">
								No vehicles currently parked here.
							</p>
						)}
						<ul className="flex flex-col gap-2">
							{visits
								.filter((visit) => visit.poolId === poolId)
								.map((visit) => (
									<li key={visit.id}>
										<Button
											variant="secondary"
											aria-pressed={visitId === visit.id}
											onClick={() => setVisitId(visit.id)}
										>
											{visit.plate}
										</Button>
									</li>
								))}
						</ul>
					</div>
					{visitId && (
						<aside aria-label="Selected open-lot vehicle" className="min-w-0">
							<VisitPanel
								key={visitId}
								visitId={visitId}
								location={location}
								canTakeCash={canTakeCash}
								canCheckout={canCheckout}
								canExit={canManageGate}
								onExited={() => setVisitId(undefined)}
							/>
						</aside>
					)}
				</div>
			)}
		</section>
	);
}

function PoolEntry({
	pool,
	location,
	capacityUnavailable,
	admit,
}: {
	pool: CapacityPool;
	location: Location;
	capacityUnavailable: boolean;
	admit: ReturnType<typeof useAdmit>;
}) {
	const [plate, setPlate] = useState("");
	const [admittedPlate, setAdmittedPlate] = useState("");
	if (admit.isSuccess)
		return (
			<div className="flex flex-col gap-3">
				<p role="status">{admittedPlate} admitted.</p>
				<Button
					variant="secondary"
					onClick={() => {
						admit.reset();
						setPlate("");
					}}
				>
					Admit another vehicle
				</Button>
			</div>
		);
	if (pool.state !== "ACTIVE") return <p>This area is out of service.</p>;
	if (pool.occupied >= pool.capacity) return <p>This area is full.</p>;
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setAdmittedPlate(plate.trim());
		admit.mutate({
			locationId: location.id,
			poolId: pool.id,
			plate: plate.trim(),
			vehicleClass: pool.vehicleClass,
		});
	}
	return (
		<form onSubmit={submit}>
			<fieldset
				disabled={admit.isPending || capacityUnavailable}
				className="flex min-w-0 flex-col gap-3"
			>
				{admit.isError && <FormAlert>{errorMessage(admit.error)}</FormAlert>}
				<TextField
					label="Open-lot plate"
					value={plate}
					onChange={(event) => setPlate(event.target.value)}
					required
					maxLength={16}
					autoComplete="off"
				/>
				<Button
					type="submit"
					pending={admit.isPending}
					disabled={!plate.trim()}
				>
					Confirm open-lot entry
				</Button>
			</fieldset>
		</form>
	);
}
