import { useId, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "../api/client";
import { useActiveRoles, useCurrentShift } from "../app/gate";
import {
	type MemberPass,
	useMemberPasses,
	usePassPayment,
} from "../app/members";
import { type Location, useLocations } from "../app/sites";
import { Button } from "../components/Button";
import { LocationSelect } from "../components/LocationSelect";
import { FormAlert, PageHeader } from "../components/Page";
import { StatusBadge } from "../components/StatusBadge";
import { TextField } from "../components/TextField";
import { formatPaisa } from "../lib/money";
import { formatDateTime } from "../lib/time";
import { RenewForm, SaleForm } from "./MembershipForms";

export function MembersPage() {
	const locations = useLocations();
	const [locationId, setLocationId] = useState("");
	const selected =
		locations.data?.find((location) => location.id === locationId) ??
		locations.data?.[0];
	return (
		<section className="flex flex-col gap-6" aria-labelledby="members-heading">
			<PageHeader
				id="members-heading"
				title="Members"
				description="Find a pass, manage renewals and keep membership payments together."
				actions={
					selected && (
						<LocationSelect
							locations={locations.data ?? []}
							value={selected.id}
							onChange={setLocationId}
						/>
					)
				}
			/>
			{locations.isPending && <p>Loading locations…</p>}
			{locations.isError && (
				<FormAlert>{errorMessage(locations.error)}</FormAlert>
			)}
			{locations.data?.length === 0 && (
				<p>Create a location before selling passes.</p>
			)}
			{selected && (
				<MembershipWorkspace key={selected.id} location={selected} />
			)}
		</section>
	);
}

function MembershipWorkspace({ location }: { location: Location }) {
	const roles = useActiveRoles();
	const canSell = roles.includes("OWNER") || roles.includes("MANAGER");
	const [saleOpen, setSaleOpen] = useState(false);
	const saleId = useId();
	const canPay = roles.includes("OWNER") || roles.includes("CASHIER");
	const shift = useCurrentShift();
	const [search, setSearch] = useState("");
	const [plate, setPlate] = useState("");
	const passes = useMemberPasses(location.id, plate);
	const [renewing, setRenewing] = useState<MemberPass | null>(null);
	const payment = usePassPayment();
	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<p className="text-dense text-ink-muted">
					{location.name} · Times use {location.timezone}. Passes activate after
					payment.
				</p>
				{canSell && (
					<Button
						aria-expanded={saleOpen}
						aria-controls={saleId}
						onClick={() => setSaleOpen(!saleOpen)}
					>
						{saleOpen ? "Hide sale form" : "Sell a member pass"}
					</Button>
				)}
			</div>
			{canSell && (
				<div id={saleId} hidden={!saleOpen}>
					<SaleForm location={location} />
				</div>
			)}

			<form
				className="filter-bar"
				onSubmit={(event) => {
					event.preventDefault();
					setPlate(search.trim());
				}}
			>
				<TextField
					label="Search by plate"
					placeholder="Enter a vehicle plate"
					className="flex-1 basis-56"
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
						className="flex min-w-0 flex-col gap-4 rounded-panel border border-line bg-surface p-5 [overflow-wrap:anywhere]"
						aria-label={`Pass ${pass.reference}`}
					>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="font-mono text-section font-semibold">
								{pass.reference}
							</h2>
							<StatusBadge
								tone={
									pass.status === "ACTIVE"
										? "available"
										: pass.status === "PENDING"
											? "warning"
											: "neutral"
								}
							>
								{pass.status}
							</StatusBadge>
						</div>
						<p className="font-medium">
							{[pass.customerName, pass.customerEmail, pass.customerPhone]
								.filter(Boolean)
								.join(" · ")}
						</p>
						<p className="text-dense text-ink-muted">
							{pass.plates.join(", ")} · {pass.locationNames.join(", ")}
						</p>
						<p className="text-dense text-ink-muted">
							{formatDateTime(pass.startsAt, location.timezone)} –{" "}
							{formatDateTime(pass.endsAt, location.timezone)}
						</p>
						<p className="text-dense text-ink-muted">
							Up to {pass.maxVehicles} vehicle(s) parked at once. Coverage per
							visit: {pass.coveredSeconds / 3600} hours.
						</p>
						<p className="border-t border-line pt-4 text-dense tabular-nums">
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
					<div className="empty-state rounded-panel border border-line bg-surface">
						<h2 className="font-semibold text-ink">No matching passes</h2>
						<p className="mt-2 text-dense">
							No passes match this location and plate.
						</p>
					</div>
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
