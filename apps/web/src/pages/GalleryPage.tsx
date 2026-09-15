import type { ReactNode } from "react";
import { Link } from "react-router";
import { BayTile } from "../components/BayTile";
import { Button } from "../components/Button";
import {
	ArrowLeft,
	Car,
	CheckmarkOutline,
	ColorPalette,
	Download,
	ErrorFilled,
	EventSchedule,
	Grid,
	type IconComponent,
	Location,
	Login,
	Logout,
	Printer,
	Report,
	Scooter,
	Time,
	UserMultiple,
	Wallet,
	WarningAlt,
} from "../components/icons";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { formatPaisa } from "../lib/money";

const COLOURS = [
	["Canvas", "bg-canvas", "#F2F4F3"],
	["Surface", "bg-surface", "#FFFFFF"],
	["Inset", "bg-inset", "#E8EDEB"],
	["Line", "bg-line", "#D3DCD8"],
	["Control border", "bg-control", "#6B7D78"],
	["Primary text", "bg-ink", "#172B2B"],
	["Secondary text", "bg-ink-muted", "#4B6262"],
	["Brand / available", "bg-brand", "#00645C"],
	["Occupied", "bg-occupied", "#385B94"],
	["Warning", "bg-warning", "#805600"],
	["Error", "bg-error", "#A62B34"],
] as const;

const TYPE_SCALE = [
	["Occupancy count · 40", "text-count"],
	["Page · 28", "text-page"],
	["Section · 20", "text-section"],
	["Body and controls · 16", "text-body"],
	["Dense table · 14", "text-dense"],
	["Metadata · 12", "text-meta"],
] as const;

const ICONS: [string, IconComponent][] = [
	["Grid", Grid],
	["EventSchedule", EventSchedule],
	["Wallet", Wallet],
	["Report", Report],
	["Location", Location],
	["UserMultiple", UserMultiple],
	["ColorPalette", ColorPalette],
	["Login", Login],
	["Logout", Logout],
	["CheckmarkOutline", CheckmarkOutline],
	["Car", Car],
	["Scooter", Scooter],
	["WarningAlt", WarningAlt],
	["ErrorFilled", ErrorFilled],
	["Time", Time],
	["Download", Download],
	["ArrowLeft", ArrowLeft],
	["Printer", Printer],
];

const AMOUNTS = [5_000, 10_000, 130_000, -2_000, 12_345_678_901];

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section
			aria-labelledby={id}
			className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6"
		>
			<h2 id={id} className="text-section font-semibold">
				{title}
			</h2>
			{children}
		</section>
	);
}

export function GalleryPage() {
	return (
		<main className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-8">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-page font-semibold">Bayline UI gallery</h1>
				<Link className="font-medium text-brand underline" to="/operations">
					Back to operations
				</Link>
			</header>

			<Section id="gallery-colour" title="Colour tokens">
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{COLOURS.map(([name, swatch, hex]) => (
						<li key={name} className="flex flex-col gap-1">
							<span
								className={`h-12 rounded-control border border-line ${swatch}`}
							/>
							<span className="text-dense font-medium">{name}</span>
							<span className="font-mono text-meta text-ink-muted">{hex}</span>
						</li>
					))}
				</ul>
			</Section>

			<Section id="gallery-type" title="Type">
				{TYPE_SCALE.map(([label, size]) => (
					<p key={size} className={`${size} font-medium`}>
						{label}
					</p>
				))}
				<p className="text-body">
					IBM Plex Sans 400 · <span className="font-medium">500</span> ·{" "}
					<span className="font-semibold">600</span>
				</p>
				<p className="text-body">
					IBM Plex Sans Devanagari:{" "}
					<span className="font-medium">बा २ प ४५६७</span>
				</p>
				<p className="text-body">
					IBM Plex Mono:{" "}
					<span className="font-mono font-semibold">BA 12 PA 3456</span> ·{" "}
					<span className="font-mono">NGC-000042</span>
				</p>
			</Section>

			<Section id="gallery-icons" title="Icons">
				<p className="text-dense text-ink-muted">
					IBM Carbon glyphs: 16px in dense UI, 20px in navigation, always beside
					a word.
				</p>
				<ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
					{ICONS.map(([name, Icon]) => (
						<li key={name} className="flex items-center gap-2">
							<Icon className="size-5" />
							<span className="font-mono text-meta text-ink-muted">{name}</span>
						</li>
					))}
				</ul>
			</Section>

			<Section id="gallery-controls" title="Controls">
				<div className="flex flex-wrap gap-3">
					<Button>Confirm entry</Button>
					<Button variant="secondary">Cancel</Button>
					<Button variant="danger">Void session</Button>
					<Button pending>Recording cash</Button>
					<Button disabled>Exit not ready</Button>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<TextField label="Plate" defaultValue="BA 12 PA 3456" />
					<TextField
						label="Counted cash"
						hint="Enter the physical count."
						inputMode="numeric"
					/>
					<TextField
						label="Discount reason"
						error="A reason is required for discounts."
					/>
				</div>
			</Section>

			<Section id="gallery-status" title="Status">
				<div className="flex flex-wrap gap-2">
					<StatusBadge tone="available">Available</StatusBadge>
					<StatusBadge tone="occupied">Occupied</StatusBadge>
					<StatusBadge tone="warning">Payment pending</StatusBadge>
					<StatusBadge tone="error">Sync conflict</StatusBadge>
					<StatusBadge tone="neutral">Fixture mode</StatusBadge>
				</div>
				<div className="flex flex-wrap gap-3">
					<BayTile label="A-01" state="available" vehicleClass="CAR" />
					<BayTile
						label="A-02"
						state="occupied"
						vehicleClass="CAR"
						duration="1h 35m"
					/>
					<BayTile label="M-07" state="reserved" vehicleClass="MOTORBIKE" />
					<BayTile label="A-09" state="outOfService" vehicleClass="CAR" />
				</div>
			</Section>

			<Section id="gallery-money" title="Money">
				<table className="w-full max-w-sm text-dense">
					<caption className="sr-only">Integer paisa formatted as NPR</caption>
					<thead className="text-left text-ink-muted">
						<tr>
							<th scope="col" className="py-1 font-medium">
								Paisa
							</th>
							<th scope="col" className="py-1 text-right font-medium">
								Display
							</th>
						</tr>
					</thead>
					<tbody className="tabular-nums">
						{AMOUNTS.map((paisa) => (
							<tr key={paisa} className="border-t border-line">
								<td className="py-2 font-mono">{paisa}</td>
								<td className="py-2 text-right">{formatPaisa(paisa)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</Section>
		</main>
	);
}
