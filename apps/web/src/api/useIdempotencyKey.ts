import { useRef } from "react";
import { ApiError } from "./client";

/**
 * One Idempotency-Key per intended change. It survives a network or server failure, so a retry
 * replays the first result instead of repeating the change. A different payload, or a definitive
 * answer from the server, starts a new key.
 */
export function useIdempotencyKey() {
	const current = useRef<{ key: string; payload: string } | null>(null);
	return {
		keyFor(payload: unknown): string {
			const fingerprint = JSON.stringify(payload);
			if (current.current?.payload !== fingerprint) {
				current.current = { key: crypto.randomUUID(), payload: fingerprint };
			}
			return current.current.key;
		},
		settle(error: unknown) {
			if (!error || (error instanceof ApiError && error.status < 500)) {
				current.current = null;
			}
		},
	};
}
