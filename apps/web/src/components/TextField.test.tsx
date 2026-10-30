import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TextField } from "./TextField";

it("lets users inspect a password without submitting or losing validation context", () => {
	const submit = vi.fn((event) => event.preventDefault());
	render(
		<form onSubmit={submit}>
			<TextField
				label="Password"
				type="password"
				autoComplete="current-password"
				defaultValue="synthetic-password"
				error="Check your password."
			/>
		</form>,
	);
	const field = screen.getByLabelText("Password");
	fireEvent.click(screen.getByRole("button", { name: "Show password" }));
	expect(field).toHaveAttribute("type", "text");
	expect(field).toHaveAttribute("aria-invalid", "true");
	expect(field).toHaveAttribute("autocomplete", "current-password");
	fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
	expect(field).toHaveAttribute("type", "password");
	expect(field).toHaveValue("synthetic-password");
	expect(submit).not.toHaveBeenCalled();
});
