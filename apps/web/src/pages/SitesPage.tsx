import { useState } from "react";
import type { components } from "../../generated/schema";
import { type Location, useBays, useLocations, useTariffs } from "../app/sites";
import { LocationSelect } from "../components/LocationSelect";
import { StatusBadge, type Tone } from "../components/StatusBadge";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatPaisa } from "../lib/money";

type Schemas = components["schemas"];

const MODE: Record<Schemas["BayModeEnum"], string> = {
	WALK_IN: "Walk-in",
	RESERVABLE: "Reservable",
};
const STATUS: Record<
	Schemas["TariffStatusEnum"],
	{ tone: Tone; label: string }
> = {
	CURRENT: { tone: "available", label: "In force" },
	SCHEDULED: { tone: "warning", label: "Scheduled" },
	SUPERSEDED: { tone: "neutral", label: "Superseded" },
};

function formatDuration(seconds: number): string {
	if (seconds === 0) return "None";
	if (seconds % 3600 === 0) return `${seconds / 3600} h`;
	if (seconds % 60 === 0) return `${seconds / 60} min`;
	return `${seconds} s`;
}

function LoadError({ what }: { what: string }) {
	return (
		<p role="alert" className="rounded-control bg-error-bg p-3 text-error">
			{`${what} could not be loaded. Retry in a moment.`}
		</p>
	);
}

export function SitesPage() {
	const [selectedId, setSelectedId] = useState<string>();
	const locations = useLocations();
	const location =
		locations.data?.find((item) => item.id === selectedId) ??
		locations.data?.[0];

	return (
		<section aria-labelledby="sites-heading" className="flex flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h1 id="sites-heading" className="text-page font-semibold">
					Sites
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
			{locations.isError && <LoadError what="Locations" />}
			{locations.isSuccess && !location && (
				<div className="rounded-panel border border-line bg-surface p-6">
					<h2 className="text-section font-semibold">No locations yet</h2>
					<p className="mt-1 text-ink-muted">
						Locations, bays and tariffs appear here once an owner sets them up.
					</p>
				</div>
			)}
			{location && <LocationDetail key={location.id} location={location} />}
		</section>
	);
}

function LocationDetail({ location }: { location: Location }) {
	const bays = useBays(location.id);
	const tariffs = useTariffs(location.id);
	const startsAt = new Intl.DateTimeFormat("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: location.timezone,
	});
	const walkIn = bays.data?.filter((bay) => bay.mode === "WALK_IN").length;
	const reservable = bays.data?.filter(
		(bay) => bay.mode === "RESERVABLE",
	).length;

	return (
		<>
			<div className="rounded-panel border border-line bg-surface p-4">
				<h2 className="text-section font-semibold">{location.name}</h2>
				<p className="text-ink-muted">{location.address}</p>
				<dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-dense">
					<div className="flex gap-2">
						<dt className="text-ink-muted">Receipt prefix</dt>
						<dd className="font-mono">{location.receiptPrefix}</dd>
					</div>
					<div className="flex gap-2">
						<dt className="text-ink-muted">Time zone</dt>
						<dd>{location.timezone}</dd>
					</div>
					{bays.isSuccess && (
						<div className="flex gap-2">
							<dt className="text-ink-muted">Bays</dt>
							<dd>{`${walkIn} walk-in · ${reservable} reservable`}</dd>
						</div>
					)}
				</dl>
			</div>

			<section
				aria-labelledby="tariffs-heading"
				className="flex flex-col gap-3"
			>
				<h2 id="tariffs-heading" className="text-section font-semibold">
					Tariffs
				</h2>
				{tariffs.isPending && (
					<p className="text-ink-muted">Loading tariffs…</p>
				)}
				{tariffs.isError && <LoadError what="Tariffs" />}
				{tariffs.isSuccess && (
					<div className="overflow-x-auto rounded-panel border border-line bg-surface">
						<table className="w-full min-w-[48rem] text-left text-dense tabular-nums">
							<caption className="sr-only">Tariff versions</caption>
							<thead className="bg-inset text-ink-muted">
								<tr>
									{[
										"Vehicle",
										"Free time",
										"Block",
										"Rate per block",
										"Daily cap",
										"Tax",
										"Starts",
										"Status",
									].map((heading) => (
										<th
											key={heading}
											scope="col"
											className="px-4 py-2 font-medium"
										>
											{heading}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{tariffs.data
									.toSorted(
										(a, b) =>
											a.vehicleClass.localeCompare(b.vehicleClass) ||
											b.effectiveFrom.localeCompare(a.effectiveFrom),
									)
									.map((tariff) => (
										<tr key={tariff.id} className="border-t border-line">
											<td className="px-4 py-3 font-medium">
												{VEHICLE_LABEL[tariff.vehicleClass]}
											</td>
											<td className="px-4 py-3">
												{formatDuration(tariff.graceSeconds)}
											</td>
											<td className="px-4 py-3">
												{formatDuration(tariff.blockSeconds)}
											</td>
											<td className="px-4 py-3">
												{formatPaisa(tariff.blockPaisa)}
											</td>
											<td className="px-4 py-3">
												{tariff.dailyCapPaisa === null
													? "None"
													: formatPaisa(tariff.dailyCapPaisa)}
											</td>
											<td className="px-4 py-3">
												{tariff.taxBps === 0
													? "None"
													: `${tariff.taxBps / 100}%`}
											</td>
											<td className="px-4 py-3">
												{startsAt.format(new Date(tariff.effectiveFrom))}
											</td>
											<td className="px-4 py-3">
												<StatusBadge tone={STATUS[tariff.status].tone}>
													{STATUS[tariff.status].label}
												</StatusBadge>
											</td>
										</tr>
									))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			<section aria-labelledby="bays-heading" className="flex flex-col gap-3">
				<h2 id="bays-heading" className="text-section font-semibold">
					Bays
				</h2>
				{bays.isPending && <p className="text-ink-muted">Loading bays…</p>}
				{bays.isError && <LoadError what="Bays" />}
				{bays.isSuccess && (
					<ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
						{bays.data.map((bay) => (
							<li
								key={bay.id}
								className="flex flex-col gap-1 rounded-control border border-line bg-surface p-3"
							>
								<span className="font-mono font-semibold">{bay.label}</span>
								<span className="text-meta text-ink-muted">
									{`${VEHICLE_LABEL[bay.vehicleClass]} · ${MODE[bay.mode]}`}
								</span>
								{bay.state === "OUT_OF_SERVICE" && (
									<StatusBadge tone="warning">Out of service</StatusBadge>
								)}
							</li>
						))}
					</ul>
				)}
			</section>
		</>
	);
}
