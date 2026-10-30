type LocationOption = { id: string; name: string };

/** Renders nothing for a single location, so one-site organisations see no extra control. */
export function LocationSelect({
	locations,
	value,
	onChange,
}: {
	locations: LocationOption[];
	value: string;
	onChange: (locationId: string) => void;
}) {
	if (locations.length < 2) {
		return null;
	}
	return (
		<label className="flex min-w-0 flex-col gap-1.5 text-dense font-medium">
			<span className="text-ink-muted">Location</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="min-h-11 min-w-0 rounded-control border border-control bg-surface px-3 font-normal"
			>
				{locations.map((location) => (
					<option key={location.id} value={location.id}>
						{location.name}
					</option>
				))}
			</select>
		</label>
	);
}
