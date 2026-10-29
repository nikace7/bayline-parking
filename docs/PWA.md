# PWA delivery and offline scope

29 October 2026. Accepted client direction: one installable browser PWA. No Flutter migration, Capacitor shell or native Android client.

## Delivered

- Standalone install manifest, 192/512 px PNG icons and Apple touch icon.
- Production service worker precaching static JS, CSS, HTML, WOFF2 fonts and icons. No runtime/API response cache.
- Offline reload of SPA deep links after an initial successful online installation.
- Offline screen explaining that live parking actions still require connectivity.
- Existing mounted forms are hidden, not unmounted, during a network disconnect, so typed values return on reconnect. They are not saved across closing/reloading the app.
- Explicit update prompt; a waiting worker does not automatically reload a cashier's form. Finish work in all Bayline tabs before accepting an update, since activation can reload other open tabs.
- Offline preparation/update failure messages; the online application remains usable.
- Disconnected mutations fail rather than being paused for later in-memory replay. This is not a durable outbox.

The browser's `navigator.onLine` signal drives the offline screen. It does not prove API/database reachability; existing query/action error states handle server outages. A first visit with no network cannot install an uncached application.

## Try it

1. Run `pnpm build`.
2. Run `pnpm --filter web exec vite preview --host 127.0.0.1 --port 4430` for the static shell, or `pnpm demo:up` for the full local stack.
3. Open the app online and wait for “App saved for offline access”. Use the browser's install menu where available.
4. Disconnect, navigate to a SPA route such as `/operations` and reload. The offline screen should load with its fonts.
5. Reconnect. Open forms return without automatic submission.

The static preview has no backend proxy and is intended for shell testing. Real operations use the development/full-stack setup from README. Production requires HTTPS; service workers work on localhost/loopback for testing. Access over a plain HTTP LAN address will not provide service-worker offline access.

## Verification

- `pnpm --filter web test`: includes offline UI, reconnect/form preservation, prompted updates, registration/update failure and cache-policy tests.
- `pnpm typecheck` and `pnpm build`.
- `pnpm --filter web exec playwright install chromium`, then `pnpm --filter web test:pwa` after building.
- Browser scenarios exercise actual CacheStorage/service workers, deep-link offline reload/reconnect, exclusion of private API responses and correct manifest/icon bytes and dimensions. The preview server is started and stopped by Playwright on port 4430.
- CI builds before running the PWA browser suite. Chromium automation does not certify Android/iOS install UX or physical printer support.

Vite PWA uses prompted updates to avoid involuntary reloads during forms. API navigations are excluded from the HTML fallback. Static caches contain no authenticated API responses, and the session/query cache is not persisted to disk by this feature.

## Next complete offline operations milestone

The following are required together before claiming offline parking/cash support:

1. Registered, revocable devices bound to an organisation/location and a defined offline operating policy.
2. IndexedDB outbox with stable command IDs, payload hashes, sequence/dependency references and an explicit record of local persistence failure.
3. Transactional server command application with durable replay outcomes, current authorisation checks and visible conflict/rejection results.
4. Permitted offline tariff/visit context with expiry, clock-drift handling and a policy for capacity, shifts and receipt identity. Private local data needs an explicit retention and account/device switching policy.
5. Staff-visible pending/synced/conflict counts; unsynced money blocks inappropriate shift closure. Network loss, browser restart, response loss and duplicate replay must preserve one financial result.

Do not queue reservations, refunds or provider payments as if they were offline cash walk-ins. Never delete unacknowledged records at midnight. Do not persist the entire React Query cache as a substitute for device sync.

Browser printing uses OS-supported 58/80 mm printers; scanners should expose keyboard input. Vendor SDK-only POS printers need a separately scoped bridge or different hardware. A print dialog does not prove paper delivery.
