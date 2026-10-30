import { type FormEvent, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";
import { type MemberPass, useRenewPass, useSellPass } from "../app/members";
import type { Location } from "../app/sites";
import { Button } from "../components/Button";
import { FormAlert } from "../components/Page";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";
import { parseRupees } from "../lib/money";
import { zonedTimeToIso } from "../lib/time";

export function SaleForm({ location }: { location: Location }) {
	const sale = useSellPass();
	const [email, setEmail] = useState("");
	const [plate, setPlate] = useState("");
	const [vehicleClass, setVehicleClass] = useState<"CAR" | "MOTORBIKE">("CAR");
	const [starts, setStarts] = useState("");
	const [ends, setEnds] = useState("");
	const [price, setPrice] = useState("");
	const [error, setError] = useState("");
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const pricePaisa = parseRupees(price);
		if (!pricePaisa || !starts || !ends || ends <= starts) {
			setError("Enter a positive price and an end time after the start.");
			return;
		}
		setError("");
		sale.mutate({
			email: email.trim(),
			locationId: location.id,
			vehicles: [{ plate: plate.trim(), vehicleClass }],
			startsAt: zonedTimeToIso(starts, location.timezone),
			endsAt: zonedTimeToIso(ends, location.timezone),
			pricePaisa,
			maxVehicles: 1,
		});
	}
	return (
		<form
			onSubmit={submit}
			className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5 sm:p-6"
		>
			<h2 className="text-section font-semibold">Sell a single-vehicle pass</h2>
			<p className="text-ink-muted">
				The customer must already have an account. This pass covers{" "}
				{location.name}.
			</p>
			{(error || sale.isError) && (
				<FormAlert>{error || errorMessage(sale.error)}</FormAlert>
			)}
			{sale.data && (
				<p role="status">
					Pass {sale.data.reference} created. Take payment to activate it.
				</p>
			)}
			<fieldset
				disabled={sale.isPending || sale.isSuccess}
				className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
			>
				<TextField
					label="Customer email"
					type="email"
					required
					value={email}
					onChange={(event) => setEmail(event.target.value)}
				/>
				<TextField
					label="Plate"
					required
					maxLength={32}
					value={plate}
					onChange={(event) => setPlate(event.target.value)}
				/>
				<label className="flex flex-col gap-1">
					Vehicle class
					<select
						className="min-h-11 border border-control bg-surface px-3"
						value={vehicleClass}
						onChange={(event) =>
							setVehicleClass(event.target.value as typeof vehicleClass)
						}
					>
						{Object.entries(VEHICLE_LABEL).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
				<TextField
					label="Price (NPR)"
					inputMode="decimal"
					required
					value={price}
					onChange={(event) => setPrice(event.target.value)}
				/>
				<TextField
					label="Starts at"
					type="datetime-local"
					required
					value={starts}
					onChange={(event) => setStarts(event.target.value)}
				/>
				<TextField
					label="Ends at"
					type="datetime-local"
					required
					value={ends}
					onChange={(event) => setEnds(event.target.value)}
				/>
			</fieldset>
			<Button type="submit" pending={sale.isPending} disabled={sale.isSuccess}>
				Sell pass
			</Button>
			{sale.isSuccess && (
				<Button
					variant="secondary"
					onClick={() => {
						sale.reset();
						setEmail("");
						setPlate("");
						setStarts("");
						setEnds("");
						setPrice("");
					}}
				>
					New sale
				</Button>
			)}
		</form>
	);
}

export function RenewForm({
	memberPass,
	location,
	onClose,
}: {
	memberPass: MemberPass;
	location: Location;
	onClose: () => void;
}) {
	const renewal = useRenewPass();
	const heading = useRef<HTMLHeadingElement>(null);
	useEffect(() => {
		const trigger = document.activeElement;
		heading.current?.focus();
		return () => {
			if (trigger instanceof HTMLElement && trigger.isConnected)
				trigger.focus();
		};
	}, []);
	const [ends, setEnds] = useState("");
	const [price, setPrice] = useState("");
	const [error, setError] = useState("");
	return (
		<form
			className="flex flex-col gap-4 rounded-panel border border-brand bg-surface p-5 sm:p-6"
			onSubmit={(event) => {
				event.preventDefault();
				const pricePaisa = parseRupees(price);
				if (
					!pricePaisa ||
					!ends ||
					Date.parse(zonedTimeToIso(ends, location.timezone)) <=
						Math.max(Date.now(), Date.parse(memberPass.endsAt))
				) {
					setError(
						"Enter a positive price and an end after the current pass expiry and now.",
					);
					return;
				}
				setError("");
				renewal.mutate({
					passId: memberPass.id,
					body: {
						locationId: location.id,
						endsAt: zonedTimeToIso(ends, location.timezone),
						pricePaisa,
					},
				});
			}}
		>
			<h2 ref={heading} tabIndex={-1} className="text-section font-semibold">
				Renew {memberPass.reference}
			</h2>
			<p>
				A new pass starts at the later of now or the current expiry. Payment is
				required.
			</p>
			{(error || renewal.isError) && (
				<FormAlert>{error || errorMessage(renewal.error)}</FormAlert>
			)}
			{renewal.data && (
				<p role="status">
					Renewal {renewal.data.reference} created. Take payment to activate it.
				</p>
			)}
			<TextField
				label="Renewal ends at"
				type="datetime-local"
				required
				value={ends}
				onChange={(event) => setEnds(event.target.value)}
			/>
			<TextField
				label="Renewal price (NPR)"
				required
				inputMode="decimal"
				value={price}
				onChange={(event) => setPrice(event.target.value)}
			/>
			<Button
				type="submit"
				pending={renewal.isPending}
				disabled={renewal.isSuccess}
			>
				Create renewal
			</Button>
			<Button
				variant="secondary"
				disabled={renewal.isPending}
				onClick={onClose}
			>
				Close renewal
			</Button>
		</form>
	);
}
