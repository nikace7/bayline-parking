import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { FullPageMessage } from "../components/Page";

export function NotFoundPage() {
	return (
		<FullPageMessage>
			<h1 className="text-page font-semibold text-ink">Page not found</h1>
			<p className="mt-2">
				<Link className="font-medium text-brand underline" to="/operations">
					Go to operations
				</Link>
			</p>
		</FullPageMessage>
	);
}

export function RouteErrorPage() {
	const error = useRouteError();
	const detail = isRouteErrorResponse(error)
		? `${error.status} ${error.statusText}`
		: "This screen hit an unexpected error.";

	return (
		<FullPageMessage>
			<h1 className="text-page font-semibold text-ink">Something went wrong</h1>
			<p className="mt-2">{detail}</p>
			<p className="mt-4">
				<a className="font-medium text-brand underline" href="/operations">
					Reload operations
				</a>
			</p>
		</FullPageMessage>
	);
}
