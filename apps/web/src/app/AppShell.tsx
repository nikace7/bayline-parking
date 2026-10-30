import { useEffect, useRef, useState } from "react";
import {
	Link,
	Navigate,
	NavLink,
	Outlet,
	useLocation,
	useNavigate,
} from "react-router";
import { errorMessage } from "../api/client";
import { Button } from "../components/Button";
import {
	BaylineMark,
	ColorPalette,
	EventSchedule,
	Grid,
	Location,
	Logout,
	Report,
	UserMultiple,
	Wallet,
} from "../components/icons";
import { FormAlert, FullPageMessage } from "../components/Page";
import { useSession, useSignOut, useSwitchOrganisation } from "./session";

const NAV = [
	{
		to: "/operations",
		label: "Operations",
		Icon: Grid,
		mobile: true,
		group: "Workspace",
	},
	{
		to: "/reservations",
		label: "Reservations",
		Icon: EventSchedule,
		mobile: true,
		group: "Workspace",
	},
	{
		to: "/members",
		label: "Members",
		Icon: UserMultiple,
		mobile: true,
		group: "Workspace",
	},
	{
		to: "/shifts",
		label: "Shifts",
		Icon: Wallet,
		mobile: true,
		group: "Workspace",
	},
	{
		to: "/reports",
		label: "Reports",
		Icon: Report,
		mobile: false,
		group: "Workspace",
	},
	{
		to: "/settings/sites",
		label: "Sites",
		Icon: Location,
		mobile: false,
		group: "Management",
	},
	{
		to: "/settings/staff",
		label: "Staff",
		Icon: UserMultiple,
		mobile: false,
		group: "Management",
	},
	{
		to: "/gallery",
		label: "UI gallery",
		Icon: ColorPalette,
		mobile: false,
		group: "Management",
	},
];

export function AppShell() {
	const session = useSession();
	const signOut = useSignOut();
	const switchOrganisation = useSwitchOrganisation();
	const navigate = useNavigate();
	const route = useLocation();
	const [moreOpen, setMoreOpen] = useState(false);
	const moreButton = useRef<HTMLButtonElement>(null);
	const moreMenu = useRef<HTMLElement>(null);
	useEffect(() => {
		if (moreOpen) moreMenu.current?.querySelector("a")?.focus();
	}, [moreOpen]);

	if (session.isPending) {
		return <FullPageMessage>Loading your workspace…</FullPageMessage>;
	}
	if (session.isError) {
		return (
			<FullPageMessage>
				We could not reach Bayline. Check the connection and reload.
			</FullPageMessage>
		);
	}

	const { user, memberships, activeOrganisationId } = session.data;
	if (!user) {
		return <Navigate to="/login" replace />;
	}

	const handleSignOut = () =>
		signOut.mutate(undefined, {
			onSuccess: () => navigate("/login", { replace: true }),
		});

	if (!activeOrganisationId) {
		return (
			<FullPageMessage>
				<p>This account has no staff access to an organisation.</p>
				<p className="mt-2">
					<Link
						to="/account/reservations"
						className="font-medium text-brand underline"
					>
						Go to your reservations
					</Link>
				</p>
				<Button className="mt-4" variant="secondary" onClick={handleSignOut}>
					Sign out
				</Button>
			</FullPageMessage>
		);
	}

	const activeMembership = memberships.find(
		(membership) => membership.organisationId === activeOrganisationId,
	);
	const currentPage =
		NAV.find((item) => route.pathname.startsWith(item.to))?.label ?? "Receipt";
	return (
		<div data-print="bare" className="workspace">
			<a href="#main-content" className="skip-link" data-print="hide">
				Skip to content
			</a>
			<aside className="sidebar" data-print="hide">
				<Link
					to="/operations"
					className="flex min-h-24 items-center gap-3 px-6 text-section font-semibold"
				>
					<BaylineMark /> Bayline
				</Link>
				<nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
					{["Workspace", "Management"].map((group) => (
						<div key={group} className="mb-8">
							<p className="eyebrow px-3 text-rail-muted">{group}</p>
							<ul className="mt-3 flex flex-col gap-1">
								{NAV.filter((item) => item.group === group).map(
									({ to, label, Icon }) => (
										<li key={to}>
											<NavLink to={to} className="side-link">
												<Icon className="size-5 shrink-0" />
												{label}
											</NavLink>
										</li>
									),
								)}
							</ul>
						</div>
					))}
				</nav>
				<div className="m-5 border-t border-rail-line pt-5 text-meta text-rail-muted">
					<p className="font-medium text-on-rail">Parking operations</p>
					<p className="mt-1">A clear view of the everyday.</p>
				</div>
			</aside>
			<div
				data-print="bare"
				className="flex min-w-0 flex-col pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-0"
			>
				<header data-print="hide" className="workspace-bar">
					<div className="min-w-0 flex-1">
						<p className="mb-1 text-meta text-ink-muted">
							Staff workspace{" "}
							<span className="hidden sm:inline"> / {currentPage}</span>
						</p>
						{memberships.length > 1 ? (
							<select
								aria-label="Organisation"
								value={activeOrganisationId}
								disabled={switchOrganisation.isPending}
								onChange={(event) =>
									switchOrganisation.mutate(event.target.value)
								}
								className="min-h-11 w-full max-w-xs border border-control bg-surface px-3 text-dense font-medium"
							>
								{memberships.map((membership) => (
									<option
										key={membership.organisationId}
										value={membership.organisationId}
									>
										{membership.organisationName}
									</option>
								))}
							</select>
						) : (
							<p
								className="truncate font-semibold"
								title={activeMembership?.organisationName}
							>
								{activeMembership?.organisationName}
							</p>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-4">
						<div className="hidden max-w-44 items-center gap-3 lg:flex">
							<span
								aria-hidden="true"
								className="grid size-10 shrink-0 place-items-center rounded-full bg-inset font-semibold text-brand"
							>
								{user.name.slice(0, 1).toUpperCase()}
							</span>
							<div className="min-w-0">
								<p className="truncate text-dense font-medium">{user.name}</p>
								<p className="text-meta capitalize text-ink-muted">
									{activeMembership?.roles
										.map((role) => role.toLowerCase())
										.join(" · ")}
								</p>
							</div>
						</div>
						<Button
							variant="secondary"
							pending={signOut.isPending}
							onClick={handleSignOut}
						>
							<Logout className="size-4" />
							Sign out
						</Button>
					</div>
				</header>
				<main
					id="main-content"
					tabIndex={-1}
					data-print="bare"
					className="workspace-main flex-1"
				>
					{switchOrganisation.isError && (
						<div className="mb-6">
							<FormAlert>{errorMessage(switchOrganisation.error)}</FormAlert>
						</div>
					)}
					{signOut.isError && (
						<div className="mb-6">
							<FormAlert>{errorMessage(signOut.error)}</FormAlert>
						</div>
					)}
					<Outlet />
				</main>
			</div>
			<div className="mobile-nav" data-print="hide">
				{moreOpen && (
					<nav
						id="more-destinations"
						ref={moreMenu}
						aria-label="More destinations"
						className="more-panel"
						onKeyDown={(event) => {
							if (event.key === "Escape") {
								setMoreOpen(false);
								moreButton.current?.focus();
							}
						}}
					>
						<p className="eyebrow text-ink-muted">More destinations</p>
						<ul className="grid grid-cols-2 gap-2">
							{NAV.filter((item) => !item.mobile).map(({ to, label, Icon }) => (
								<li key={to}>
									<NavLink
										to={to}
										onClick={() => {
											setMoreOpen(false);
											document.getElementById("main-content")?.focus();
										}}
										className="flex min-h-12 items-center gap-3 rounded-control bg-canvas px-3 text-dense font-medium"
									>
										<Icon className="size-5" />
										{label}
									</NavLink>
								</li>
							))}
						</ul>
					</nav>
				)}
				<nav aria-label="Main">
					<ul className="grid grid-cols-5">
						{NAV.filter((item) => item.mobile).map(({ to, label, Icon }) => (
							<li key={to}>
								<NavLink
									to={to}
									className="mobile-link"
									onClick={() => setMoreOpen(false)}
								>
									<Icon className="size-5" />
									{label}
								</NavLink>
							</li>
						))}
						<li>
							<button
								ref={moreButton}
								type="button"
								aria-expanded={moreOpen}
								aria-controls={moreOpen ? "more-destinations" : undefined}
								onClick={() => setMoreOpen(!moreOpen)}
								className="mobile-link"
							>
								<Grid className="size-5" />
								More
							</button>
						</li>
					</ul>
				</nav>
			</div>
		</div>
	);
}
