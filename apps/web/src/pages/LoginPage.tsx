import { type ChangeEvent, type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { homePath, useSession, useSignIn } from "../app/session";
import { Button } from "../components/Button";
import { AuthLayout, FormAlert } from "../components/Page";
import { TextField } from "../components/TextField";

const EMPTY = { email: "", password: "" };

export function LoginPage() {
	const session = useSession();
	const signIn = useSignIn();
	const navigate = useNavigate();
	const [form, setForm] = useState(EMPTY);

	if (session.data?.user) {
		return <Navigate to={homePath(session.data)} replace />;
	}

	const error = signIn.error instanceof ApiError ? signIn.error : null;
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
		signIn.mutate(form, {
			onSuccess: (signedIn) => navigate(homePath(signedIn), { replace: true }),
		});
	}

	return (
		<AuthLayout title="Sign in">
			<form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
				{signIn.isError && (
					<FormAlert>
						{error?.message ??
							"Could not sign in. Check the connection and retry."}
					</FormAlert>
				)}
				<TextField
					label="Email"
					type="email"
					autoComplete="username"
					required
					{...field("email")}
				/>
				<TextField
					label="Password"
					type="password"
					autoComplete="current-password"
					required
					{...field("password")}
				/>
				<Button
					type="submit"
					pending={signIn.isPending}
					disabled={session.isPending}
				>
					Sign in
				</Button>
			</form>
			<p className="mt-6 text-dense text-ink-muted">
				New operator?{" "}
				<Link className="font-medium text-brand underline" to="/register">
					Register an organisation
				</Link>
			</p>
			<p className="mt-2 text-dense text-ink-muted">
				Looking for parking?{" "}
				<Link className="font-medium text-brand underline" to="/park">
					Find and reserve a bay
				</Link>
			</p>
		</AuthLayout>
	);
}
