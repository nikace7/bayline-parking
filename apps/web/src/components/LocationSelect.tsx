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
		<label className="flex items-center gap-2 text-dense">
			<span className="text-ink-muted">Location</span>
			<select
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="min-h-11 rounded-control border border-control bg-surface px-3"
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
