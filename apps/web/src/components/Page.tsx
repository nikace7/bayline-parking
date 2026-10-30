import type { ReactNode } from "react";
import { BaylineMark, Car, ErrorFilled } from "./icons";

export function AuthLayout({
	title,
	description = "Sign in to manage parking, payments and reservations.",
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<main className="auth-layout">
			<aside className="auth-story" aria-label="About Bayline">
				<p className="flex items-center gap-3 text-section font-semibold">
					<BaylineMark /> Bayline
				</p>
				<div className="my-12 max-w-md">
					<p className="eyebrow text-rail-muted">Parking, with a clear view</p>
					<h2 className="text-4xl font-medium leading-tight tracking-tight">
						A calmer way to
						<br />
						run a busy car park.
					</h2>
					<p className="mt-5 leading-relaxed text-rail-muted">
						From the first arrival to the final cash count. Keep your spaces,
						people and payments in order.
					</p>
					<div className="parking-illustration" aria-hidden="true">
						{["A01", "A02", "A03", "B01", "B02", "B03"].map((bay, index) => (
							<span key={bay}>
								{index === 1 || index === 5 ? <Car className="size-7" /> : bay}
							</span>
						))}
					</div>
					<p className="text-dense text-rail-muted">
						Built for the everyday rhythm of parking in Nepal.
					</p>
				</div>
				<p className="text-meta text-rail-muted">
					Bayline · Parking operations
				</p>
			</aside>
			<div className="auth-content">
				<div className="auth-form">
					<p className="mb-10 flex items-center gap-3 text-section font-semibold text-brand">
						<BaylineMark />
						Bayline
					</p>
					<h1 className="text-page font-semibold">{title}</h1>
					<p className="mb-8 mt-2 text-dense text-ink-muted">{description}</p>
					{children}
				</div>
			</div>
		</main>
	);
}

export function PageHeader({
	id,
	title,
	description,
	actions,
}: {
	id: string;
	title: ReactNode;
	description: string;
	actions?: ReactNode;
}) {
	return (
		<header className="page-heading">
			<div className="min-w-0">
				<h1 id={id} className="text-page font-semibold">
					{title}
				</h1>
				<p className="page-description">{description}</p>
			</div>
			{actions && (
				<div className="flex min-w-0 flex-wrap items-center gap-3">
					{actions}
				</div>
			)}
		</header>
	);
}

export function Metric({
	label,
	value,
	note,
}: {
	label: string;
	value: ReactNode;
	note: string;
}) {
	return (
		<div className="metric">
			<dt className="text-dense font-medium text-ink-muted">{label}</dt>
			<dd className="metric-value">{value}</dd>
			<dd className="mt-2 text-meta text-ink-muted">{note}</dd>
		</div>
	);
}

export function FormAlert({ children }: { children: ReactNode }) {
	return (
		<div
			role="alert"
			className="flex items-start gap-3 rounded-control border border-error bg-error-bg p-4 text-dense text-error"
		>
			<ErrorFilled className="mt-0.5 size-4 shrink-0" />
			<span>{children}</span>
		</div>
	);
}

export function FullPageMessage({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center p-4 text-center text-ink-muted">
			<div className="w-full max-w-lg rounded-panel border border-line bg-surface p-8">
				{children}
			</div>
		</main>
	);
}
