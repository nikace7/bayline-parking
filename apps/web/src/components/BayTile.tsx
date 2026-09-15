import {
	Car,
	CheckmarkOutline,
	EventSchedule,
	Scooter,
	WarningAlt,
} from "./icons";

export type BayState = "available" | "occupied" | "reserved" | "outOfService";
export type VehicleClass = "CAR" | "MOTORBIKE";

const states = {
	available: {
		word: "Available",
		Icon: CheckmarkOutline,
		className: "border-available bg-available-bg text-available",
	},
	occupied: {
		word: "Occupied",
		Icon: Car,
		className: "border-occupied bg-occupied-bg text-occupied",
	},
	reserved: {
		word: "Reserved",
		Icon: EventSchedule,
		className: "border-control bg-inset text-ink",
	},
	outOfService: {
		word: "Out of service",
		Icon: WarningAlt,
		className: "border-warning bg-warning-bg text-warning",
	},
} as const;

const classes = {
	CAR: { word: "car", Icon: Car },
	MOTORBIKE: { word: "motorbike", Icon: Scooter },
} as const;

type BayTileProps = {
	label: string;
	state: BayState;
	vehicleClass: VehicleClass;
	duration?: string;
	selected?: boolean;
	onSelect?: () => void;
};

/** Fixed-size tile: focus, hover and selection change outline and shade only, never dimensions. */
export function BayTile({
	label,
	state,
	vehicleClass,
	duration,
	selected,
	onSelect,
}: BayTileProps) {
	const { word, Icon, className } = states[state];
	const { word: classWord, Icon: ClassIcon } = classes[vehicleClass];
	const description = [
		`Bay ${label}`,
		word,
		classWord,
		duration && `parked ${duration}`,
	]
		.filter(Boolean)
		.join(", ");

	return (
		<button
			type="button"
			onClick={onSelect}
			aria-label={description}
			aria-pressed={selected ?? undefined}
			className={`flex h-24 w-28 flex-col justify-between rounded-panel border p-2 text-left transition-colors duration-120 hover:brightness-95 ${className} ${selected ? "ring-2 ring-brand ring-offset-2" : ""}`}
		>
			<span className="flex items-center justify-between">
				<span className="font-mono text-dense font-semibold text-ink">
					{label}
				</span>
				<ClassIcon className="size-4 text-ink-muted" />
			</span>
			<span className="flex items-center gap-1 text-meta font-medium">
				<Icon className="size-3.5" />
				{word}
			</span>
			<span className="text-meta tabular-nums text-ink-muted">
				{duration ?? " "}
			</span>
		</button>
	);
}
