import { SquareParking } from "lucide-react";
import { Link } from "react-router";

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
				<h2 className="mt-3 text-section font-semibold">
					Occupancy is not live yet
				</h2>
				<p className="mt-1 text-ink-muted">
					Bays fill here once gate entry is enabled. Locations, bays and tariffs
					are in{" "}
					<Link
						to="/settings/sites"
						className="font-medium text-brand underline"
					>
						Sites
					</Link>
					.
				</p>
			</div>
		</section>
	);
}
