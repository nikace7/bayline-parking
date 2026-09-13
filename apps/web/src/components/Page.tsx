import { CircleAlert, SquareParking } from "lucide-react";
import type { ReactNode } from "react";

export function AuthLayout({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<main className="flex min-h-dvh items-center justify-center p-4">
			<div className="w-full max-w-md rounded-panel border border-inset bg-surface p-6 md:p-8">
				<p className="mb-6 flex items-center gap-2 font-semibold text-brand">
					<SquareParking aria-hidden className="size-6" />
					Bayline
				</p>
				<h1 className="mb-6 text-page font-semibold">{title}</h1>
				{children}
			</div>
		</main>
	);
}

export function FormAlert({ children }: { children: ReactNode }) {
	return (
		<div
			role="alert"
			className="flex items-start gap-2 rounded-control bg-error-bg p-3 text-dense text-error"
		>
			<CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
			<span>{children}</span>
		</div>
	);
}

export function FullPageMessage({ children }: { children: ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center p-4 text-center text-ink-muted">
			<div>{children}</div>
		</main>
	);
}
