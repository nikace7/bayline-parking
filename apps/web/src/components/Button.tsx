import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

const variants = {
	primary: "bg-brand text-on-brand hover:bg-brand-strong",
	secondary: "border border-control bg-surface text-ink hover:bg-inset",
	danger: "bg-error text-on-brand hover:bg-error-strong",
} as const;

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: keyof typeof variants;
	pending?: boolean;
};

export function Button({
	variant = "primary",
	pending = false,
	disabled,
	className = "",
	children,
	...rest
}: ButtonProps) {
	return (
		<button
			type="button"
			{...rest}
			disabled={disabled || pending}
			aria-busy={pending || undefined}
			className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 font-medium transition-colors duration-120 disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
		>
			{pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
			{children}
		</button>
	);
}
