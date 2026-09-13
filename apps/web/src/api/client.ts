import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "../../generated/schema";

export type ApiErrorBody = {
	error: {
		code: string;
		message: string;
		fieldErrors: Record<string, string[]>;
		retryable: boolean;
	};
	requestId: string | null;
};

export class ApiError extends Error {
	readonly status: number;
	readonly body: ApiErrorBody | null;

	constructor(status: number, body: ApiErrorBody | null) {
		super(body?.error.message ?? `Request failed with status ${status}.`);
		this.status = status;
		this.body = body;
	}

	get code(): string | undefined {
		return this.body?.error.code;
	}

	fieldError(field: string): string | undefined {
		return this.body?.error.fieldErrors[field]?.[0];
	}
}

function isErrorBody(value: unknown): value is ApiErrorBody {
	return typeof value === "object" && value !== null && "error" in value;
}

function readCookie(name: string): string | undefined {
	const prefix = `${name}=`;
	return document.cookie
		.split("; ")
		.find((part) => part.startsWith(prefix))
		?.slice(prefix.length);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Django rotates the token at login, so read the cookie on every write rather than caching it. */
const csrf: Middleware = {
	onRequest({ request }) {
		const token = readCookie("csrftoken");
		if (token && !SAFE_METHODS.has(request.method)) {
			request.headers.set("X-CSRFToken", token);
		}
		return request;
	},
};

export const api = createClient<paths>({
	baseUrl: "",
	credentials: "same-origin",
});
api.use(csrf);

type Outcome<T> = { data?: T; error?: unknown; response: Response };

/** Resolves a JSON call to its `data` payload, or throws ApiError carrying the error envelope. */
export async function unwrap<T>(
	call: Promise<Outcome<{ data: T }>>,
): Promise<T> {
	const { data, error, response } = await call;
	if (!response.ok || data === undefined) {
		throw new ApiError(response.status, isErrorBody(error) ? error : null);
	}
	return data.data;
}
