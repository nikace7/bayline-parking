import { type FormEvent, useId, useState } from "react";
import { errorMessage } from "../api/client";
import { useActiveRoles } from "../app/gate";
import type { Location } from "../app/sites";
import {
	type CapacityPool,
	useCreateZone,
	useUpdatePool,
	useZones,
} from "../app/zones";
import { Button } from "../components/Button";
import { FormAlert } from "../components/Page";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";

function capacityValue(value: string) {
	if (!/^\d+$/.test(value)) return null;
	const amount = Number(value);
	return Number.isSafeInteger(amount) && amount <= 100000 ? amount : null;
}

export function ZoneSetup({ location }: { location: Location }) {
	const zones = useZones(location.id);
	const roles = useActiveRoles();
	const canEdit = roles.includes("OWNER") || roles.includes("MANAGER");
	return (
		<section aria-labelledby="zones-heading" className="flex flex-col gap-4">
			<div>
				<h2 id="zones-heading" className="text-section font-semibold">
					Open-lot capacity
				</h2>
				<p className="text-dense text-ink-muted">
					Set the number of vehicles each shared parking area can hold. Existing
					numbered bays stay separate.
				</p>
			</div>
			{zones.isPending && <p>Loading parking areas…</p>}
			{zones.isError && <FormAlert>{errorMessage(zones.error)}</FormAlert>}
			{zones.data && (
				<ul className="grid gap-3 sm:grid-cols-2">
					{zones.data
						.filter((zone) => zone.mode === "OPEN_CAPACITY")
						.map((zone) => (
							<li
								key={zone.id}
								className="min-w-0 rounded-panel border border-line bg-surface p-5"
							>
								<h3 className="font-semibold">{zone.name}</h3>
								{zone.pools.map((pool) => (
									<div key={pool.id} className="mt-3 flex flex-col gap-2">
										<p className="text-dense">
											{VEHICLE_LABEL[pool.vehicleClass]} · {pool.occupied} /{" "}
											{pool.capacity} parked ·{" "}
											{pool.state === "ACTIVE" ? "Active" : "Out of service"}
										</p>
										{canEdit && (
											<PoolSettings
												key={pool.id}
												location={location}
												zoneId={zone.id}
												pool={pool}
											/>
										)}
									</div>
								))}
							</li>
						))}
				</ul>
			)}
			{canEdit && <CreateZone location={location} />}
		</section>
	);
}

function CreateZone({ location }: { location: Location }) {
	const create = useCreateZone(location.id);
	const classId = useId();
	const [name, setName] = useState("");
	const [vehicleClass, setVehicleClass] =
		useState<CapacityPool["vehicleClass"]>("MOTORBIKE");
	const [capacity, setCapacity] = useState("");
	const amount = capacityValue(capacity);
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (amount === null) return;
		create.mutate({
			name: name.trim(),
			pools: [{ vehicleClass, capacity: amount }],
		});
	}
	return (
		<details className="rounded-panel border border-line bg-surface p-5">
			<summary className="min-h-11 py-2 font-medium text-brand">
				Add an open parking area
			</summary>
			{create.isSuccess ? (
				<div className="flex flex-col items-start gap-3">
					<p role="status">
						Parking area created. It is available in Operations.
					</p>
					<Button
						variant="secondary"
						onClick={() => {
							create.reset();
							setName("");
							setCapacity("");
						}}
					>
						Add another area
					</Button>
				</div>
			) : (
				<form onSubmit={submit} className="mt-4">
					<fieldset
						disabled={create.isPending}
						className="grid min-w-0 gap-4 sm:grid-cols-3"
					>
						{create.isError && (
							<div className="sm:col-span-3">
								<FormAlert>{errorMessage(create.error)}</FormAlert>
							</div>
						)}
						<TextField
							label="Area name"
							required
							maxLength={120}
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
						<div className="flex min-w-0 flex-col gap-1.5 text-dense font-medium">
							<label htmlFor={classId}>Area vehicle class</label>
							<select
								id={classId}
								className="min-h-11 rounded-control border border-control bg-surface px-3"
								value={vehicleClass}
								onChange={(event) =>
									setVehicleClass(
										event.target.value as CapacityPool["vehicleClass"],
									)
								}
							>
								<option value="MOTORBIKE">Motorbike</option>
								<option value="CAR">Car</option>
							</select>
						</div>
						<TextField
							label="Vehicle capacity"
							required
							inputMode="numeric"
							value={capacity}
							onChange={(event) => setCapacity(event.target.value)}
							hint="Whole vehicles, from 0 to 100,000."
						/>
						<Button
							type="submit"
							pending={create.isPending}
							disabled={amount === null || !name.trim()}
						>
							Create parking area
						</Button>
					</fieldset>
				</form>
			)}
		</details>
	);
}

function PoolSettings({
	location,
	zoneId,
	pool,
}: {
	location: Location;
	zoneId: string;
	pool: CapacityPool;
}) {
	const update = useUpdatePool(location.id, zoneId, pool.id);
	const stateId = useId();
	const [draftRevision, setDraftRevision] = useState(pool.revision);
	const [capacity, setCapacity] = useState(String(pool.capacity));
	const [state, setState] = useState(pool.state);
	const amount = capacityValue(capacity);
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (amount === null) return;
		update.mutate(
			{ expectedRevision: draftRevision, capacity: amount, state },
			{
				onSuccess: (saved) => {
					setDraftRevision(saved.revision);
					setCapacity(String(saved.capacity));
					setState(saved.state);
				},
			},
		);
	}
	return (
		<details>
			<summary className="min-h-11 py-2 text-dense font-medium text-brand">
				Edit {VEHICLE_LABEL[pool.vehicleClass].toLowerCase()} capacity
			</summary>
			<form onSubmit={submit}>
				{pool.revision !== draftRevision && (
					<div role="alert" className="my-3 text-dense text-warning">
						Capacity changed since you started editing. Your draft is preserved.
						<Button
							variant="secondary"
							onClick={() => {
								setDraftRevision(pool.revision);
								setCapacity(String(pool.capacity));
								setState(pool.state);
								update.reset();
							}}
						>
							Load latest settings
						</Button>
					</div>
				)}
				{update.isSuccess && <p role="status">Capacity saved.</p>}
				<fieldset
					disabled={update.isPending}
					className="flex min-w-0 flex-col gap-3"
				>
					{update.isError && (
						<FormAlert>{errorMessage(update.error)}</FormAlert>
					)}
					<TextField
						label="New capacity"
						required
						inputMode="numeric"
						value={capacity}
						onChange={(event) => setCapacity(event.target.value)}
						hint="Cannot be lower than vehicles still parked."
					/>
					<div className="flex flex-col gap-1.5 text-dense font-medium">
						<label htmlFor={stateId}>Area state</label>
						<select
							id={stateId}
							className="min-h-11 rounded-control border border-control bg-surface px-3"
							value={state}
							onChange={(event) =>
								setState(event.target.value as CapacityPool["state"])
							}
						>
							<option value="ACTIVE">Active</option>
							<option value="OUT_OF_SERVICE">Out of service</option>
						</select>
					</div>
					<Button
						type="submit"
						pending={update.isPending}
						disabled={amount === null || pool.revision !== draftRevision}
					>
						Save capacity
					</Button>
				</fieldset>
			</form>
		</details>
	);
}
