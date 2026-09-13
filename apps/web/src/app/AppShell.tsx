import {
	LayoutGrid,
	LogOut,
	Palette,
	SquareParking,
	Users,
} from "lucide-react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router";
import { Button } from "../components/Button";
import { FullPageMessage } from "../components/Page";
import { useSession, useSignOut, useSwitchOrganisation } from "./session";

const NAV = [
	{ to: "/operations", label: "Operations", Icon: LayoutGrid },
	{ to: "/settings/staff", label: "Staff", Icon: Users },
	{ to: "/gallery", label: "UI gallery", Icon: Palette },
];

function navClass({ isActive }: { isActive: boolean }) {
	return `flex min-h-11 items-center gap-3 rounded-control px-3 font-medium ${
		isActive
			? "bg-inset text-brand"
			: "text-ink-muted hover:bg-inset hover:text-ink"
	}`;
}

export function AppShell() {
	const session = useSession();
	const signOut = useSignOut();
	const switchOrganisation = useSwitchOrganisation();
	const navigate = useNavigate();

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
				<Button className="mt-4" variant="secondary" onClick={handleSignOut}>
					Sign out
				</Button>
			</FullPageMessage>
		);
	}

	return (
		<div className="min-h-dvh md:grid md:grid-cols-[224px_1fr]">
			<nav
				aria-label="Main"
				className="hidden border-r border-inset bg-surface md:block"
			>
				<p className="flex h-16 items-center gap-2 px-4 font-semibold text-brand">
					<SquareParking aria-hidden className="size-6" />
					Bayline
				</p>
				<ul className="flex flex-col gap-1 p-2">
					{NAV.map(({ to, label, Icon }) => (
						<li key={to}>
							<NavLink to={to} className={navClass}>
								<Icon aria-hidden className="size-5" />
								{label}
							</NavLink>
						</li>
					))}
				</ul>
			</nav>

			<div className="flex min-w-0 flex-col pb-16 md:pb-0">
				<header className="flex h-16 items-center justify-between gap-3 border-b border-inset bg-surface px-4">
					<label className="flex min-w-0 items-center gap-2 text-dense">
						<span className="hidden text-ink-muted sm:inline">
							Organisation
						</span>
						<select
							aria-label="Organisation"
							value={activeOrganisationId}
							disabled={memberships.length < 2 || switchOrganisation.isPending}
							onChange={(event) =>
								switchOrganisation.mutate(event.target.value)
							}
							className="min-h-11 min-w-0 rounded-control border border-control bg-surface px-3"
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
					</label>
					<div className="flex items-center gap-3">
						<span className="hidden text-dense text-ink-muted sm:inline">
							{user.name}
						</span>
						<Button
							variant="secondary"
							pending={signOut.isPending}
							onClick={handleSignOut}
						>
							<LogOut aria-hidden className="size-4" />
							Sign out
						</Button>
					</div>
				</header>

				<main className="flex-1 p-4 md:p-6">
					<Outlet />
				</main>
			</div>

			<nav
				aria-label="Main"
				className="fixed inset-x-0 bottom-0 border-t border-inset bg-surface md:hidden"
			>
				<ul className="grid grid-cols-3">
					{NAV.map(({ to, label, Icon }) => (
						<li key={to}>
							<NavLink
								to={to}
								className={({ isActive }) =>
									`flex min-h-14 flex-col items-center justify-center gap-0.5 text-meta font-medium ${
										isActive ? "text-brand" : "text-ink-muted"
									}`
								}
							>
								<Icon aria-hidden className="size-5" />
								{label}
							</NavLink>
						</li>
					))}
				</ul>
			</nav>
		</div>
	);
}
