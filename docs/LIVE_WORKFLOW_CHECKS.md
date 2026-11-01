# Real browser workflow checks

Verified 1 November 2026. These checks complement the mocked layout tests and API integration suite with a compiled React SPA talking to actual Django sessions, CSRF and PostgreSQL.

## Run locally

After `pnpm setup:local` and installing Chromium with `pnpm --filter web exec playwright install chromium`:

```bash
pnpm db:up
pnpm test:live
```

`test:live` builds the production SPA, then explicitly runs `backend/config/tests/live_browser_check.py`. The filename intentionally avoids the ordinary `test_*.py` discovery pattern, so unit/integration checks do not unexpectedly require a browser. CI runs this explicit check after the normal browser suite and Chromium installation.

The harness uses pytest-django's transactional live server and the separately configured `TEST_DATABASE_URL`. It seeds synthetic records and a generated test password in that database, runs five Chromium scenarios sequentially without retries, verifies saved database rows, and tears the test database down. Do not run another PostgreSQL test command against the same test database concurrently. Demo records and `.env` credentials are unchanged.

The test-only URLconf serves compiled files and the normal API on an ephemeral loopback port. A readiness marker prevents the Playwright suite from accidentally using the ordinary demo gateway or an external deployment. Do not point the standalone browser config at another service; use the root command.

## Scenarios and database evidence

| Scenario | Browser actions | PostgreSQL assertions |
|---|---|---|
| Authentication | Incorrect password, correct password, session reload and sign-out | Real Django authentication/session middleware; no mocked login response |
| Paid walk-in | Operator admits a vehicle; cashier quotes, confirms checkout and collects NPR 50; operator records exit; receipt original/reprint requests | Exited session, exactly one NPR 50 ledger entry and two print events |
| Membership and shift | Owner opens NPR 1,000 float, sells a NPR 1,000.50 pass, collects payment, views receipt, creates and collects a NPR 1,200 renewal, closes the shift | Two active passes, two membership captures, expected/counted NPR 3,200.50 and zero variance |
| Walk-up member on mobile | At 390px, owner creates a name-only profile, sells a NPR 500 pass and collects cash | Unlinked customer with blank contacts, active pass and exactly one NPR 500 capture; no document overflow |
| Customer booking | Customer holds, confirms and cancels a reservation, then reloads it | Stored cancellation for the correct vehicle |

The paid walk-in fixture publishes a **test-only zero-grace tariff** and waits until one second has elapsed. This avoids a five-minute test delay; the demo's ordinary five-minute grace policy is unchanged. Printing stubs only `window.print()` to avoid a hardware dialog. Print-event requests, copy numbering, receipts and payments still use the actual API/database.

Browser failures are saved under ignored `apps/web/test-results/live/`. Tracing is disabled for this authentication suite. The successful browser summary is included in pytest's passed-test output; the outer pytest check also verifies ledger/database state after the browser exits.

## Gate role correction

The live check exposed controls that the server correctly refused: a cashier could see admission and exit buttons. Manager/auditor views also offered checkout actions their roles could not perform. The UI now follows the existing API permissions:

| Gate action | Owner | Operator | Cashier | Manager / Auditor |
|---|---|---|---|---|
| Admit / check in | Yes | Yes | No | No |
| Quote / confirm checkout | Yes | Yes | Yes | No |
| Collect cash with a shift | Yes | No | Yes | No |
| Record exit | Yes | Yes | No | No |

Read access still follows organisation/location scope. Server permissions remain authoritative. Five component regressions were reproduced before the fix; allowed operator/cashier hand-offs are exercised through the live browser.

## Latest results and limits

- 116 frontend tests, 40 backend unit tests, 102 PostgreSQL integration tests, 11 existing Chromium PWA/layout tests and five live Chromium journeys passed. Lint, app/browser TypeScript checks, contracts and production build passed.
- Browser configuration/specs now have dedicated TypeScript coverage and are included in canonical lint. Node type declarations are a development dependency only.
- The actual local gateway was restarted/rebuilt. A fresh Chromium browser signed in as `owner@northgate.test` using `DEMO_PASSWORD` from `.env`, retained its session after reload and signed out. No secret was printed or changed. Local preview: `http://localhost:4330/login`.
- The walk-up milestone also verified authenticated customer-directory access and valid name-only forms through the rebuilt local gateway, with desktop/390px screenshots. Those preview checks did not create demo customers or payments. See `CUSTOMER_PROFILES.md` for migration evidence.
- The isolated harness does not exercise Caddy; the separate local sign-in check covers that gateway's auth path. Existing service-worker checks remain separate because this suite blocks service workers to keep live write checks deterministic.
- These checks do not establish physical printer output, a production deployment, offline transaction sync or successful sign-in in the user's existing browser profile. Finish active work before accepting a PWA update prompt.
