import type { VisitSummary } from "../app/gate";
import { StatusBadge, type Tone } from "./StatusBadge";

export const VISIT_STAGES: Record<
	VisitSummary["stage"],
	{ tone: Tone; label: string }
> = {
	PARKED: { tone: "occupied", label: "Parked" },
	CHECKOUT_PENDING: { tone: "warning", label: "Payment due" },
	EXIT_READY: { tone: "available", label: "Ready to exit" },
	EXITED: { tone: "neutral", label: "Exited" },
};

export function VisitStage({ stage }: { stage: VisitSummary["stage"] }) {
	const state = VISIT_STAGES[stage];
	return <StatusBadge tone={state.tone}>{state.label}</StatusBadge>;
}

export function VisitProgress({ stage }: { stage: VisitSummary["stage"] }) {
	const step = { PARKED: 1, CHECKOUT_PENDING: 2, EXIT_READY: 3, EXITED: 4 }[
		stage
	];
	return (
		<ol aria-label="Visit progress" className="visit-progress">
			{["Admitted", "Checkout", "Payment", "Exit"].map((label, index) => (
				<li
					key={label}
					aria-current={index === step ? "step" : undefined}
					data-complete={index < step}
				>
					<span aria-hidden="true" className="visit-step-number">
						{index < step ? "✓" : index + 1}
					</span>
					<span>{label}</span>
				</li>
			))}
		</ol>
	);
}
