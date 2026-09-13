import { SquareParking } from "lucide-react";

export function OperationsPage() {
	return (
		<section
			aria-labelledby="operations-heading"
			className="flex flex-col gap-6"
		>
			<h1 id="operations-heading" className="text-page font-semibold">
				Operations
			</h1>
			<div className="rounded-panel border border-inset bg-surface p-8 text-center">
				<SquareParking aria-hidden className="mx-auto size-10 text-ink-muted" />
				<h2 className="mt-3 text-section font-semibold">No locations yet</h2>
				<p className="mt-1 text-ink-muted">
					Occupancy appears here once locations and bays are set up.
				</p>
			</div>
		</section>
	);
}
