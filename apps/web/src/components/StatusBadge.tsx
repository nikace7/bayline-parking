import type { ReactNode } from "react";
import {
	Car,
	CheckmarkOutline,
	ErrorFilled,
	type IconComponent,
	Time,
	WarningAlt,
} from "./icons";

const tones = {
	available: {
		Icon: CheckmarkOutline,
		className: "bg-available-bg text-available",
	},
	occupied: { Icon: Car, className: "bg-occupied-bg text-occupied" },
	warning: { Icon: WarningAlt, className: "bg-warning-bg text-warning" },
	error: { Icon: ErrorFilled, className: "bg-error-bg text-error" },
	neutral: { Icon: Time, className: "bg-inset text-ink-muted" },
} satisfies Record<string, { Icon: IconComponent; className: string }>;

export type Tone = keyof typeof tones;

/** Colour is never the only signal: every tone carries an icon and a visible word. */
export function StatusBadge({
	tone,
	children,
}: {
	tone: Tone;
	children: ReactNode;
}) {
	const { Icon, className } = tones[tone];
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-control px-2 py-0.5 text-meta font-medium ${className}`}
		>
			<Icon className="size-3.5" />
			{children}
		</span>
	);
}
