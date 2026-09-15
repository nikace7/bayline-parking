import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { Button } from "../components/Button";
import {
	BaylineMark,
	EventSchedule,
	Location,
	Login,
	Logout,
} from "../components/icons";
import { useSession, useSignOut } from "./session";

function linkClass({ isActive }: { isActive: boolean }) {
	return `inline-flex min-h-11 items-center gap-2 rounded-control px-3 font-medium ${
		isActive
			? "bg-inset text-brand"
			: "text-ink-muted hover:bg-inset hover:text-ink"
	}`;
}

/** The customer side: public discovery for anyone, reservations for a signed-in account. */
export function CustomerShell() {
	const session = useSession();
	const signOut = useSignOut();
	const navigate = useNavigate();
	const user = session.data?.user;

	return (
		<div className="min-h-dvh">
			<header className="border-b border-line bg-surface">
				<div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2">
					<Link
						to="/park"
						className="flex min-h-11 items-center gap-2 font-semibold text-brand"
					>
						<BaylineMark />
						Bayline
					</Link>
					<nav
						aria-label="Customer"
						className="flex flex-wrap items-center gap-1"
					>
						<NavLink to="/park" className={linkClass}>
							<Location className="size-4" />
							Find parking
						</NavLink>
						{user && (
							<NavLink to="/account/reservations" className={linkClass}>
								<EventSchedule className="size-4" />
								My reservations
							</NavLink>
						)}
						{user ? (
							<Button
								variant="secondary"
								pending={signOut.isPending}
								onClick={() =>
									signOut.mutate(undefined, {
										onSuccess: () => navigate("/park", { replace: true }),
									})
								}
							>
								<Logout className="size-4" />
								Sign out
							</Button>
						) : (
							<NavLink to="/login" className={linkClass}>
								<Login className="size-4" />
								Sign in
							</NavLink>
						)}
					</nav>
				</div>
			</header>
			<main className="mx-auto max-w-5xl p-4 md:p-6">
				<Outlet />
			</main>
		</div>
	);
}
