import { useRegisterSW } from "virtual:pwa-register/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Button } from "../components/Button";

export function PwaBoundary({ children }: { children: ReactNode }) {
	const previousFocus = useRef<HTMLElement | null>(null);
	const offlineHeading = useRef<HTMLHeadingElement>(null);
	const subscribe = useCallback((listener: () => void) => {
		function changed() {
			if (!navigator.onLine) {
				previousFocus.current =
					document.activeElement instanceof HTMLElement
						? document.activeElement
						: null;
			}
			listener();
		}
		window.addEventListener("online", changed);
		window.addEventListener("offline", changed);
		return () => {
			window.removeEventListener("online", changed);
			window.removeEventListener("offline", changed);
		};
	}, []);
	const online = useSyncExternalStore(subscribe, () => navigator.onLine);
	useEffect(() => {
		if (!online) {
			offlineHeading.current?.focus();
		} else if (previousFocus.current?.isConnected) {
			previousFocus.current.focus();
			previousFocus.current = null;
		}
	}, [online]);
	const [registrationFailed, setRegistrationFailed] = useState(false);
	const [updateFailed, setUpdateFailed] = useState(false);
	const [updating, setUpdating] = useState(false);
	const {
		offlineReady: [offlineReady, setOfflineReady],
		needRefresh: [needRefresh],
		updateServiceWorker,
	} = useRegisterSW({ onRegisterError: () => setRegistrationFailed(true) });

	async function update() {
		setUpdating(true);
		setUpdateFailed(false);
		try {
			await updateServiceWorker(true);
		} catch {
			setUpdateFailed(true);
		} finally {
			setUpdating(false);
		}
	}

	return (
		<>
			{online && (needRefresh || offlineReady || registrationFailed) && (
				<aside
					data-print="hide"
					className="border-b border-line bg-surface px-4 py-3"
				>
					{registrationFailed ? (
						<p role="alert">
							Offline access could not be prepared. You can keep working online.
							Reload to retry.
						</p>
					) : needRefresh ? (
						<div className="flex flex-wrap items-center gap-3">
							<p role="status">
								An app update is ready. Finish your work in all Bayline tabs
								before updating.
							</p>
							<Button variant="secondary" pending={updating} onClick={update}>
								Update app
							</Button>
							{updateFailed && (
								<p role="alert">
									The update failed. Keep working and try again when connected.
								</p>
							)}
						</div>
					) : (
						<div className="flex flex-wrap items-center gap-3">
							<p role="status">
								App saved for offline access. Parking actions still need a
								connection.
							</p>
							<Button
								variant="secondary"
								onClick={() => setOfflineReady(false)}
							>
								Dismiss
							</Button>
						</div>
					)}
				</aside>
			)}
			{/* Keep mounted forms so a temporary disconnection does not discard typed values. */}
			<div data-print={online ? "bare" : "hide"} hidden={!online}>
				{children}
			</div>
			{!online && (
				<main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
					<p className="font-semibold text-brand">Bayline Parking</p>
					<h1
						ref={offlineHeading}
						tabIndex={-1}
						className="text-page font-semibold"
					>
						You’re offline
					</h1>
					<p>
						The app is available, but live parking records need a connection.
						Your open forms will return when this device reconnects.
					</p>
					<p>
						No parking entries or payments are queued in this version. Reconnect
						before admitting vehicles, collecting payments or making
						reservations.
					</p>
					<p role="status">Waiting for a connection…</p>
				</main>
			)}
		</>
	);
}
