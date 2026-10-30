import { type InputHTMLAttributes, type Ref, useId, useState } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
	ref?: Ref<HTMLInputElement>;
	label: string;
	hint?: string;
	error?: string;
};

export function TextField({
	label,
	hint,
	error,
	id,
	type,
	className = "",
	...rest
}: TextFieldProps) {
	const generatedId = useId();
	const [showPassword, setShowPassword] = useState(false);
	const inputId = id ?? generatedId;
	const noteId = `${inputId}-note`;
	const note = error ?? hint;

	return (
		<div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
			<label htmlFor={inputId} className="text-dense font-medium">
				{label}
			</label>
			<div className="relative flex min-w-0">
				<input
					id={inputId}
					type={type === "password" && showPassword ? "text" : type}
					aria-invalid={error ? true : undefined}
					aria-describedby={note ? noteId : undefined}
					className={`w-full min-h-11 rounded-control border bg-surface px-3 py-2 text-body transition-colors hover:border-ink-muted disabled:bg-canvas ${type === "password" ? "pr-20" : ""} ${error ? "border-error" : "border-control"}`}
					{...rest}
				/>
				{type === "password" && (
					<button
						type="button"
						aria-label={showPassword ? "Hide password" : "Show password"}
						aria-pressed={showPassword}
						disabled={rest.disabled}
						onClick={() => setShowPassword(!showPassword)}
						className="absolute inset-y-0 right-1 min-h-11 rounded-control px-3 text-dense font-medium text-brand"
					>
						{showPassword ? "Hide" : "Show"}
					</button>
				)}
			</div>
			{note && (
				<p
					id={noteId}
					className={`text-meta ${error ? "text-error" : "text-ink-muted"}`}
				>
					{note}
				</p>
			)}
		</div>
	);
}
