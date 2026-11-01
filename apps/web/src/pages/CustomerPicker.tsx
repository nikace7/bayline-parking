import { type FormEvent, useState } from "react";
import { ApiError, errorMessage } from "../api/client";
import {
	type Customer,
	type useCreateCustomer,
	useCustomers,
} from "../app/customers";
import { Button } from "../components/Button";
import { FormAlert } from "../components/Page";
import { TextField } from "../components/TextField";

export function CustomerPicker({
	create,
	selected,
	onSelect,
	enabled,
	disabled,
}: {
	create: ReturnType<typeof useCreateCustomer>;
	selected: Customer | undefined;
	onSelect: (customer: Customer | undefined) => void;
	enabled: boolean;
	disabled: boolean;
}) {
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");
	const profiles = useCustomers(query, enabled);
	const rows = new Map(
		profiles.data?.pages
			.flatMap((page) => page.data)
			.map((row) => [row.id, row]),
	);
	if (selected) rows.set(selected.id, selected);
	return (
		<fieldset
			disabled={disabled || create.isPending}
			className="flex min-w-0 flex-col gap-4"
		>
			<legend className="sr-only">Choose a customer profile</legend>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					setQuery(search.trim());
				}}
				className="flex flex-wrap items-end gap-3"
			>
				<TextField
					label="Find customer"
					hint="Search by name, phone or email."
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					className="min-w-0 flex-1 basis-52"
				/>
				<Button type="submit" variant="secondary">
					Search customers
				</Button>
			</form>
			{profiles.isPending && enabled && (
				<p className="text-dense text-ink-muted">Loading customers…</p>
			)}
			{profiles.isError && (
				<FormAlert>{errorMessage(profiles.error)}</FormAlert>
			)}
			<label className="flex min-w-0 flex-col gap-1.5 text-dense font-medium">
				Customer profile
				<select
					className="min-h-11 w-full border border-control bg-surface px-3 font-normal"
					value={selected?.id ?? ""}
					onChange={(event) => onSelect(rows.get(event.target.value))}
				>
					<option value="">Choose a customer</option>
					{[...rows.values()].map((row) => (
						<option key={row.id} value={row.id}>
							{row.name} · {row.phone || row.email || "No contact recorded"}
						</option>
					))}
				</select>
			</label>
			{profiles.isSuccess && rows.size === 0 && (
				<p className="text-dense text-ink-muted">
					No matching customers. Create a profile below.
				</p>
			)}
			{profiles.hasNextPage && (
				<Button
					variant="secondary"
					pending={profiles.isFetchingNextPage}
					onClick={() => profiles.fetchNextPage()}
				>
					Load more customers
				</Button>
			)}
			{selected && (
				<p className="text-dense text-ink-muted">
					{selected.name} ·{" "}
					{selected.hasOnlineAccount
						? "Online account linked"
						: "No online account"}{" "}
					· Profile {selected.id.slice(0, 8)}
				</p>
			)}
			<CreateCustomer create={create} onCreated={onSelect} />
		</fieldset>
	);
}

function CreateCustomer({
	create,
	onCreated,
}: {
	create: ReturnType<typeof useCreateCustomer>;
	onCreated: (customer: Customer) => void;
}) {
	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState("");
	const failure = create.error instanceof ApiError ? create.error : null;
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!name.trim()) {
			setError("Enter a customer name.");
			return;
		}
		setError("");
		create.mutate(
			{ name: name.trim(), phone: phone.trim(), email: email.trim() },
			{ onSuccess: onCreated },
		);
	}
	return (
		<details className="border-t border-line pt-3">
			<summary className="min-h-11 py-2 text-dense font-medium text-brand">
				Create a customer
			</summary>
			<form onSubmit={submit} className="mt-3 flex flex-col gap-4">
				<p className="text-dense text-ink-muted">
					A name is enough. Contact details are optional and do not link an
					online account.
				</p>
				{(error || create.isError) && (
					<FormAlert>{error || errorMessage(create.error)}</FormAlert>
				)}
				{create.isSuccess && (
					<p role="status">Customer ready. You can now sell their pass.</p>
				)}
				<fieldset
					disabled={create.isPending || create.isSuccess}
					className="grid min-w-0 gap-4 sm:grid-cols-3"
				>
					<TextField
						label="Customer name"
						required
						maxLength={120}
						value={name}
						error={failure?.fieldError("name")}
						onChange={(event) => setName(event.target.value)}
					/>
					<TextField
						label="Phone (optional)"
						type="tel"
						inputMode="tel"
						maxLength={32}
						value={phone}
						error={failure?.fieldError("phone")}
						onChange={(event) => setPhone(event.target.value)}
					/>
					<TextField
						label="Email (optional)"
						type="email"
						maxLength={254}
						value={email}
						error={failure?.fieldError("email")}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</fieldset>
				<div className="flex flex-wrap gap-3">
					<Button
						type="submit"
						pending={create.isPending}
						disabled={create.isSuccess}
					>
						Create customer
					</Button>
					{create.isSuccess && (
						<Button
							variant="secondary"
							onClick={() => {
								create.reset();
								setName("");
								setPhone("");
								setEmail("");
							}}
						>
							Create another customer
						</Button>
					)}
				</div>
			</form>
		</details>
	);
}
