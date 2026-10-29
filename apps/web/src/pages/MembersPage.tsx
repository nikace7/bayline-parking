import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "../api/client";
import {
	type Location,
	useActiveRoles,
	useCurrentShift,
	useLocations,
} from "../app/gate";
import {
	type MemberPass,
	useMemberPasses,
	usePassPayment,
	useRenewPass,
	useSellPass,
} from "../app/members";
import { Button } from "../components/Button";
import { LocationSelect } from "../components/LocationSelect";
import { FormAlert } from "../components/Page";
import { TextField } from "../components/TextField";
import { VEHICLE_LABEL } from "../lib/labels";
import { formatPaisa, parseRupees } from "../lib/money";
import { formatDateTime, zonedTimeToIso } from "../lib/time";

export function MembersPage() {
	const locations = useLocations();
	const [locationId, setLocationId] = useState("");
	const selected =
		locations.data?.find((location) => location.id === locationId) ??
		locations.data?.[0];
	return (
		<section className="flex flex-col gap-6" aria-labelledby="members-heading">
			<h1 id="members-heading" className="text-page font-semibold">
				Members
			</h1>
			{locations.isPending && <p>Loading locations…</p>}
			{locations.isError && (
				<FormAlert>{errorMessage(locations.error)}</FormAlert>
			)}
			{locations.data?.length === 0 && (
				<p>Create a location before selling passes.</p>
			)}
			{selected && (
				<>
					<LocationSelect
						locations={locations.data ?? []}
						value={selected.id}
						onChange={setLocationId}
					/>
					<MembershipWorkspace key={selected.id} location={selected} />
				</>
			)}
		</section>
	);
}

function MembershipWorkspace({ location }: { location: Location }) {
	const roles = useActiveRoles();
	const canSell = roles.includes("OWNER") || roles.includes("MANAGER");
	const canPay = roles.includes("OWNER") || roles.includes("CASHIER");
	const shift = useCurrentShift();
	const [search, setSearch] = useState("");
	const [plate, setPlate] = useState("");
	const passes = useMemberPasses(location.id, plate);
	const [renewing, setRenewing] = useState<MemberPass | null>(null);
	const payment = usePassPayment();
	return (
		<>
			<p className="text-ink-muted">
				{location.name} · Times use {location.timezone}. Passes activate after
				payment.
			</p>
			{canSell && <SaleForm location={location} />}
			<form
				className="flex flex-wrap items-end gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					setPlate(search.trim());
				}}
			>
				<TextField
					label="Search by plate"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
				<Button type="submit" variant="secondary">
					Search passes
				</Button>
			</form>
			{passes.isPending && <p>Loading passes…</p>}
			{passes.isError && <FormAlert>{errorMessage(passes.error)}</FormAlert>}
			{payment.isError && <FormAlert>{errorMessage(payment.error)}</FormAlert>}
			{payment.data?.receiptId && (
				<p role="status">
					Cash recorded.{" "}
					<Link
						className="text-brand underline"
						to={`/receipts/${payment.data.receiptId}`}
					>
						Receipt {payment.data.receiptNumber}
					</Link>
				</p>
			)}
			{canPay && !shift.data?.shift && (
				<p>
					Open a cash shift in{" "}
					<Link to="/operations" className="text-brand underline">
						Operations
					</Link>{" "}
					before taking payment.
				</p>
			)}
			{passes.data?.pages
				.flatMap((page) => page.data)
				.map((pass) => (
					<article
						key={pass.id}
						className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4"
						aria-label={`Pass ${pass.reference}`}
					>
						<h2 className="text-section font-semibold">{pass.reference}</h2>
						<p>
							{pass.customerName} · {pass.customerEmail}
						</p>
						<p>
							{pass.plates.join(", ")} · {pass.locationNames.join(", ")}
						</p>
						<p>
							{pass.status} · {formatDateTime(pass.startsAt, location.timezone)}{" "}
							– {formatDateTime(pass.endsAt, location.timezone)}
						</p>
						<p>
							Up to {pass.maxVehicles} vehicle(s) parked at once. Coverage per
							visit: {pass.coveredSeconds / 3600} hours.
						</p>
						<p>
							Price {formatPaisa(pass.pricePaisa)} · Paid{" "}
							{formatPaisa(pass.paidPaisa)} · Due{" "}
							{formatPaisa(pass.duePaisa ?? 0)}
						</p>
						<div className="flex flex-wrap gap-3">
							{canSell &&
								(pass.status === "ACTIVE" || pass.status === "EXPIRED") && (
									<Button variant="secondary" onClick={() => setRenewing(pass)}>
										Renew
									</Button>
								)}
							{canPay &&
								pass.status === "PENDING" &&
								pass.invoiceId &&
								(pass.duePaisa ?? 0) > 0 && (
									<Button
										disabled={
											shift.data?.shift?.locationId !== location.id ||
											(payment.isSuccess &&
												payment.variables?.invoiceId === pass.invoiceId)
										}
										pending={payment.isPending}
										onClick={() =>
											payment.mutate({
												invoiceId: pass.invoiceId as string,
												amountPaisa: pass.duePaisa as number,
											})
										}
									>
										Take cash {formatPaisa(pass.duePaisa ?? 0)}
									</Button>
								)}
						</div>
					</article>
				))}
			{passes.isSuccess &&
				!passes.data.pages.some((page) => page.data.length) && (
					<p>No passes match this location and plate.</p>
				)}
			{passes.hasNextPage && (
				<Button
					variant="secondary"
					pending={passes.isFetchingNextPage}
					onClick={() => passes.fetchNextPage()}
				>
					Next page
				</Button>
			)}
			{renewing && (
				<RenewForm
					key={renewing.id}
					memberPass={renewing}
					location={location}
					onClose={() => setRenewing(null)}
				/>
			)}
		</>
	);
}

function SaleForm({ location }: { location: Location }) {
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
			className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
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
				className="grid gap-3 sm:grid-cols-2"
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

function RenewForm({
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
			className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
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
