import { type ChangeEvent, type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { homePath, useCustomerRegister, useSession } from "../app/session";
import { Button } from "../components/Button";
import { AuthLayout, FormAlert } from "../components/Page";
import { TextField } from "../components/TextField";

const EMPTY = { name: "", email: "", password: "" };

export function CustomerRegisterPage() {
	const session = useSession();
	const register = useCustomerRegister();
	const navigate = useNavigate();
	const [form, setForm] = useState(EMPTY);

	if (session.data?.user) {
		return <Navigate to={homePath(session.data)} replace />;
	}

	const error = register.error instanceof ApiError ? register.error : null;
	const field = (name: keyof typeof EMPTY) => ({
		name,
		value: form[name],
		error: error?.fieldError(name),
		onChange: (event: ChangeEvent<HTMLInputElement>) => {
			const { value } = event.target;
			setForm((current) => ({ ...current, [name]: value }));
		},
	});

	function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		register.mutate(form, {
			onSuccess: () => navigate("/park", { replace: true }),
		});
	}

	return (
		<AuthLayout
			title="Create your parking account"
			description="Keep your reservations together and arrive with a bay reserved."
		>
			<form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
				{register.isError && (
					<FormAlert>
						{error?.message ??
							"Registration failed. Check the connection and retry."}
					</FormAlert>
				)}
				<TextField
					label="Your name"
					autoComplete="name"
					required
					{...field("name")}
				/>
				<TextField
					label="Email"
					type="email"
					autoComplete="email"
					required
					{...field("email")}
				/>
				<TextField
					label="Password"
					type="password"
					autoComplete="new-password"
					hint="At least 12 characters."
					required
					{...field("password")}
				/>
				<Button
					type="submit"
					pending={register.isPending}
					disabled={session.isPending}
				>
					Create account
				</Button>
			</form>
			<p className="mt-6 text-dense text-ink-muted">
				Already have an account?{" "}
				<Link className="font-medium text-brand underline" to="/login">
					Sign in
				</Link>
			</p>
		</AuthLayout>
	);
}
