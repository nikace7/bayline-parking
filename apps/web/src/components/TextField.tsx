import { type InputHTMLAttributes, useId } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	hint?: string;
	error?: string;
};

export function TextField({
	label,
	hint,
	error,
	id,
	className = "",
	...rest
}: TextFieldProps) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const noteId = `${inputId}-note`;
	const note = error ?? hint;

	return (
		<div className={`flex flex-col gap-1 ${className}`}>
			<label htmlFor={inputId} className="text-dense font-medium">
				{label}
			</label>
			<input
				id={inputId}
				aria-invalid={error ? true : undefined}
				aria-describedby={note ? noteId : undefined}
				className={`min-h-11 rounded-control border bg-surface px-3 ${error ? "border-error" : "border-control"}`}
				{...rest}
			/>
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
