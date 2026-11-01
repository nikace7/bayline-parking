# Handover

Start here when picking up Bayline in a new session. Rewrite **Current state** and **Next session** before ending every session. Update the rest when a convention changes.

Verified results per milestone are in [PROGRESS.md](PROGRESS.md), reasons in [DECISIONS.md](DECISIONS.md) and the specification in [BLUEPRINT.md](BLUEPRINT.md) (v1.1).

## Current state (1 November 2026)

### Latest open-lot capacity milestone

- Branch `codex/open-lot-capacity` continues the published walk-up branch. Sites can create/configure open areas; Operations admits by area/plate alongside numbered bays, then quotes, collects and records exit through the existing VisitPanel. See `OPEN_LOT_CAPACITY.md` and D59.
- `sites/zones.py` owns setup/read queries; `parking/services.py` owns capacity guards. Admission, configuration and exit lock the same pool. Exit takes pool before session/invoice; pass entitlement locks before pool/bay. Keep these orders and the pinned-tariff class for nullable-bay reads.
- Applied sites 0006–0008 and parking 0004–0006 after a full local dump. Customer/user/payment counts, captured totals, business ID digests and historical visit/bay links matched before/after. Scope FKs and bay/pool XOR protect new relationships. Rollback refuses pool-linked history; restore rehearsal is pending.
- Verified 125 frontend tests, 40 backend unit tests, 113 PostgreSQL integration tests, 11 existing Chromium checks and six live journeys. Lint, app/browser TypeScript, contracts and build passed. Django, Python, database, React, TypeScript and general reviews completed; polling draft/focus loss and parent cached-data loss were fixed with regressions.
- Local gateway is rebuilt and ready. Fresh owner login, scoped zones GET, valid create-area form and desktop/390px checks passed without creating demo areas or transactions. Browser write workflows use the isolated database.
- `app/zones.ts`, `ZoneSetup.tsx` and `OpenLotBoard.tsx` own the new UI. Preserve stable form identities, explicit revision reload, cached forms on background errors, pending pool-selection locks and replay keys. Current sale UI still creates one vehicle at one location; pool setup UI creates one vehicle-class pool per area (API supports both).
- Next is registered devices plus durable outbox/server acknowledgements/conflict recovery. Offline writes, fiscal billing, payment exceptions, verified customer claiming, hardware and production cutover remain separate work.

### Previous walk-up customer milestone

- Branch `codex/walk-up-customers` continues the published live-workflow branch. Owners/managers can search/create tenant-owned customer profiles with a name only, then sell/renew passes without online registration. Contact matches never merge profiles or link accounts. See `CUSTOMER_PROFILES.md` and D58.
- `accounts/customers.py` owns creation/search; `app/customers.ts` owns typed queries/mutations; `CustomerPicker.tsx` owns the independent search/create forms. Sale accepts exactly one of `customerId` or legacy `email`. Preserve the pending/retry locks and tenant scoping.
- Verified 116 frontend tests, 40 backend unit tests, 102 PostgreSQL integration tests, 11 existing Chromium checks and five live browser journeys. Lint, both TypeScript configurations, contracts and build passed. Django/Python, database, React/TypeScript, security and general reviews reported no remaining findings.
- Applied accounts migrations 0005/0006 locally after a full database dump. Business ID digests, counts and captured totals matched before/after; linked contacts backfilled correctly. Rollback refuses unlinked customers before removing contacts. Backup/evidence are ignored under `artifacts/tmp/`; restore rehearsal is still pending.
- Local gateway has the new UI and schema. Fresh authenticated directory access, name-only form validity and desktop/390px layout checks passed. The live test database covers actual create/sale/capture. Do not reset credentials or reseed the demo for testing.
- Open-lot zones/capacity are now delivered in the latest milestone above. Profile editing/merging and verified account claiming remain deferred. Offline transactions and hardware verification remain pending.

### Previous real workflow verification

- Branch `codex/live-workflow-verification` continues the published UI refresh. `pnpm test:live` now exercises four real Django/PostgreSQL browser journeys, then asserts persisted ledger/pass/shift/session/reservation records in the separate test database. See `LIVE_WORKFLOW_CHECKS.md`.
- Fixed the gate role-control mismatch without changing server permissions: only owner/operator admission and exit; owner/operator/cashier checkout; cash only for owner/cashier with the appropriate shift. Read-only roles retain information views.
- Verified 113 frontend tests, 40 backend unit tests, 88 PostgreSQL integration tests, 11 existing browser checks and four live browser journeys, plus lint, both TypeScript configurations, contracts and build. Browser sources are now covered by canonical lint/typecheck. CI includes the live check.
- Local containers had stopped; restarted and rebuilt the gateway. Fresh Chromium sign-in with `.env` owner credentials, reload and sign-out passed through the actual local gateway. Credentials/demo transactions were unchanged. The user's existing browser profile still needs their confirmation.

### Latest UI/UX refresh

- Work is on `codex/ui-experience-refresh`, based on the published M5 branch. Design reference: the sibling `parking-project/parking-redesign-fe`, read only. See `UI_DESIGN.md` and D57 for the adapted navy/slate design, screen coverage and conventions.
- Staff/customer/auth/receipt/offline surfaces share updated controls and headings. Operations has bay/plate search and status filters with whole-site totals; mobile More exposes all destinations and supports keyboard focus/Escape. Password visibility and scrollable table focus are supported.
- Verified 108 frontend tests, 40 backend unit tests, lint/typecheck/build and 11 Chromium tests. Layout checks cover 11 staff/customer routes at 360/768/1440px and three auth screens. Synthetic APIs are mocked; PWA cache tests use actual browser storage.
- Reviews caught and resolved receipt print decoration and mobile menu focus issues. Offline transactions, physical printers and production release remain pending.
- Local gateway has been rebuilt and verified at `http://localhost:4330/login`, including API readiness and new asset content. Existing installed clients should accept the prompted update after finishing active work. This verification does not resolve the user's unconfirmed manual login issue.

### Latest structure review

- Shared retry identity is in `api/useIdempotencyKey.ts`; site queries/types are in `app/sites.ts`; membership sale/renewal forms are in `pages/MembershipForms.tsx`. Preserve these owners when adding screens.
- Fixed malformed API error handling and membership pagination/cancellation drift. Verified 100 frontend tests, five Chromium scenarios, lint, typecheck and build. Backend was unchanged; the preceding PostgreSQL run passed 88 integration tests.
- Read `CODE_STRUCTURE.md` for findings, maintenance conventions and remaining priorities. Billing still directly creates/activates parking pass records; the blueprint now documents that exception instead of claiming strict isolation.
- The complete `feat/m5-member-passes` branch was pushed and verified at `e9fb462`. Subsequent UI changes use their own branch; a push does not deploy or merge it.

### Latest pagination/database verification

- Operational list queries follow all cursor pages and preserve filters/cancellation. A large-site browser regression verifies 105 bays and 101 parked visits without truncating totals.
- The real PostgreSQL integration suite now passes all 88 tests. Older notes below saying database integration was not run are historical.
- Totals remain a polled multi-request view, not a transactional snapshot. Offline cash/entry sync is still pending.
- Keep manual login troubleshooting distinct: automated login works, but the user has not yet confirmed successful sign-in in their browser. Do not change tenancy or bypass authentication to resolve it.

### Membership continuation

- Staff membership UI now exists at `/members`: sale/renewal, plate lookup/pagination and cash collection with receipt links. It is reachable in mobile navigation.
- The original sale UI required an existing customer email; the latest walk-up milestone above replaces this default with independent profiles while retaining the email path. One vehicle at one location remains the sale UI scope.
- Verified: 85 frontend tests, 40 backend unit tests, 4 Chromium tests (membership API mocked), lint, typecheck and build. No current live database/browser verification is claimed.
- Detailed results and limitations are in the M5 staff section of `docs/PROGRESS.md`; the latest verification above supersedes its older test counts.

### PWA continuation — 29 October 2026

- User selected PWA-only development, with offline accessibility; no Flutter or Capacitor client.
- Static PWA assets, offline reload/screen, form preservation across temporary disconnects and prompted updates are implemented. Details and test commands: `docs/PWA.md`.
- This is offline shell access, not offline parking/cash operation. API data is not persisted, and durable IndexedDB outbox/device sync remain pending.
- Continue the new Nepal architecture with `docs/NEPAL-ARCHITECTURE-PROPOSAL.md`, completing core operator flows and domain fit before transactional offline sync. M5 backend and membership screens now exist on this branch.
- The state and next-session notes dated 17 September below are historical and do not supersede this PWA direction.

- **M0–M4 and the design system update are on `main`**, merged through PRs #1–#5 on `nikace7/bayline-parking` (private). CI is green on `main` after the rebase merge of #5.
  - #5 carried the 9 reviewed M4 commits with the design commits on top; `feat/m4-reservations` was never pushed on its own.
- **Verification:** all checks pass. See the design system and M4 sections of PROGRESS.md.
- **M4 code review:** the independent review found one medium issue (an unlocked hold-limit count), now fixed and covered by a race test.
- **Design review:** one medium finding is fixed with a test: bookings starting just after midnight were missing at the gate before midnight. PROGRESS has all three findings.
- **Design audit is half done:**
  - Tokens, fonts and the public pages were checked in the browser.
  - Signed-in screens have not been checked visually; PROGRESS lists them.
- **M4 has had no manual signed-in pass** through booking, relocation and check-in.
- **Local credentials:** the November check verified the seeded owner's `DEMO_PASSWORD` from `.env`. An older September note about a separately chosen password is historical. Never print credentials, commit them or reset accounts to make tests pass.

## Next session

1. Build registered-device/IndexedDB/server sync as one complete milestone before enabling offline parking or cash writes; see `docs/PWA.md`. Open lots and independent profiles are implemented and verified; reuse `pnpm test:live`. Define single-device capacity authority and provisional receipt policy before disconnected admissions.
2. Scope remaining Nepal calendar/fiscal billing and financial exceptions with validated site requirements; account claiming/profile management remain separate identity work.
3. Test target devices/printers and operator usability, then prepare the production deployment/release. Local browser automation does not certify hardware or the user's existing profile.

## Earlier next-session notes (17 September 2026)

1. **Finish the design audit:**
   - The user signs in in the Browser pane: `owner@northgate.test` first, then `bina@customer.test`.
   - Check the screens PROGRESS lists at 360, 768 and 1280px, and fix cheap findings.
2. **Build M5 on `feat/m5-member-passes`,** branched from `main` on 17 September 2026.
3. **Read the spec before building M5:** the passes parts of blueprint sections 3–5, P09, and D25–D32 (the cash and idempotency rules passes must fit).

## Roadmap

| Milestone | Status | Scope (blueprint section 8) |
|---|---|---|
| M0 Foundation | Merged | Workspace, auth, envelope, scoping, audit, contracts, tokens |
| M1 Sites and tariffs | Merged | Locations, bays, tariff versions, shared calculator vectors |
| M2 Gate journey (cash) | Merged | Entry, quote, invoice, cash shift, capture, exit, idempotency, lock order |
| M3 Shift, receipts, reports | Merged | Shift close, receipt counters, print CSS, PDF/XLSX reports |
| M4 Reservations | Merged | Customers, holds, exclusion constraint, check-in, relocation, worker |
| M5 Member passes | Built and locally verified, not merged | Pass-first lock order, entitlement, sale/payment/renewal and receipts; P09 |
| M6 Payment integrity | — | Fixture QR, Khalti sandbox adapter, lookup worker, refunds/voids; P10–P14 |
| M7 Offline and devices | Shell implemented | PWA only; transaction outbox, device sync and conflict queue pending; P23, P24, P26, P27 |
| M8 Polish and evidence | — | Responsive/keyboard passes, screenshots, `docs/API.md`, `OPERATIONS.md`, `EVALUATION.md`, `DEMO.md`, `CASE_STUDY.md` |

## Working agreements

- **Branches:** one feature branch per milestone; use `codex/` for current work. Pushing does not merge or deploy it.
- **Commits:**
  - Use conventional commits grouped by concern, typically accounts, sites, parking, worker/infra, tests, contracts, web, seed, docs.
  - Keep each commit green where the dependencies allow.
  - Use accurate authorship; do not carry another tool's attribution into new commits.
- **Authorization:** the user has already requested pushes of completed commits. Continue focused commits and branch pushes; opening/merging PRs or public deployment needs separate authorization.
- **Never:**
  - enable auto-merge unless asked;
  - skip hooks (`--no-verify`).
- **Secrets:**
  - Never print or commit `.env`. `DEMO_PASSWORD` lives there.
  - The folder above this repository holds unrelated private files; do not open them.
- **Config files:** don't edit lint or format configs such as `biome.json`. A config-protection hook blocks it; narrow lint paths or move files instead.
- **Browser checks:** use the isolated live harness for write workflows. Local gateway authentication may use synthetic demo credentials without printing them. Never point the write harness at the demo or production database. Physical devices and the user's existing browser profile need separate checks.
- **Finishing a milestone:**
  1. Run every check in "Run and verify" below.
  2. Run an independent code-review agent and fix what it confirms.
  3. Add a PROGRESS section with the same shape as the earlier ones:
     - Delivered;
     - Verification, a table of actual runs;
     - the acceptance matrix;
     - Found during;
     - Not verified / known limitations;
     - Next.
  4. Add DECISIONS rows in the format `| D | date | decision | why | revisit when |`.

## Run and verify

Requirements: Node 24+, pnpm 10, Python 3.12 with uv, Docker.

```bash
pnpm setup:local        # .env with generated secrets, deps, PostgreSQL on 127.0.0.1:54330, migrations
pnpm db:seed            # synthetic demo data; rerunning changes nothing
pnpm dev                # Vite on :4330 proxying /api to Django on :8330 (no worker)
pnpm demo:up            # Compose: db, api, worker, Caddy gateway on :4330
```

Run these before every commit batch:

| Check | Command |
|---|---|
| Lint | `pnpm lint` (Biome, then Ruff; if Ruff fails, Biome output may be cut short, so rerun) |
| Typecheck | `pnpm typecheck` |
| Unit tests | `pnpm test:unit` (Vitest, then backend tests without a database) |
| Integration tests | `pnpm test:integration` (pytest on real PostgreSQL through `TEST_DATABASE_URL`) |
| Build | `pnpm build` |
| Contracts | `pnpm contracts:generate` after any API change. After committing, `pnpm contracts:check`, which diffs against git |
| Migrations and seed | `pnpm db:migrate`, then `pnpm db:seed` twice (the second run must add nothing) |
| Stack | `pnpm demo:up`, then probe through Caddy on `http://localhost:4330` |

Seeded accounts all use `DEMO_PASSWORD`:
- **North Gate staff:** `owner@`, `manager@`, `operator@`, `cashier@` and `auditor@northgate.test`.
- **Riverside:** `owner@riverside.test`.
- **Customers:** `asha@customer.test` and `bina@customer.test`.

## Code map

```text
backend/config/              settings, urls, api.py (envelope, ApiError, exception handler), clock.py (now, frozen),
                             transactions.py (retry_on_conflict, conflict_on), management/commands/{seed_demo,worker}.py
backend/modules/accounts/    organisations, users, members, customers, audit, permissions.py
                             (current_member, require_roles, ensure_roles), idempotency.py (idempotent, purge_expired)
backend/modules/sites/       locations, bays (with revision), tariff versions, tariff calculator
backend/modules/parking/     vehicles, parking sessions, gate entry/exit and bay changes (services.py),
                             reservations (reservations.py)
backend/modules/billing/     shifts, quotes, invoices, cash payments, receipts
backend/modules/reports/     collections and vehicle log as JSON/PDF/XLSX
apps/web/src/app/            data hooks per area (gate.ts, reservations.ts, session.ts), AppShell, CustomerShell
apps/web/src/pages/          screens and their tests; components/ and lib/ (time, money, labels, tariff)
apps/web/generated/          TypeScript types generated from contracts/openapi.yaml
fixtures/                    tariff vectors shared by pytest and Vitest
infra/                       compose.yaml, Caddyfile, gateway image
```

## Conventions in code

- **Wire contract:**
  - Responses use a `{data}` envelope. Errors use `{error:{code,message,fieldErrors,retryable},requestId}`.
  - Lists use cursor pages. JSON is camelCase on the wire.
  - Status codes: foreign organisation or location → 404 (checked before roles); wrong role → 403; missing `expectedRevision` or `Idempotency-Key` → 428; conflicts → 409 with a stable code.
- **Services:**
  - Views stay thin; services run in `@transaction.atomic`.
  - Scope with `for_org(...)` first, then `ensure_roles`.
  - Every write calls `record_audit`.
  - Named constraints map to 409 codes through `conflict_on`.
  - Money-path transactions retry deadlocks with `retry_on_conflict`.
- **Global lock order:** customer account (holds only) → bays (UUID ascending) → reservation → vehicle → parking session → invoice → shift → receipt counter. M5 must slot pass locks into this order and record it in DECISIONS.
- **Idempotency:** `idempotent(request, operation=, payload=, perform=, organisation=None)` stores the response in the same transaction. Customers pass the location's organisation.
- **Money and time:**
  - Money is integer paisa.
  - Server time always comes from `config.clock.now()`; tests freeze it with `clock.frozen(...)`.
  - Report and board dates are local to the location's time zone.
- **Tests:**
  - Fixtures in `backend/conftest.py`: `api`, `csrf`, `owner`, `other_owner`, `make_member`, `signed_in`, `customer`, `gate`.
  - Race tests use `django_db(transaction=True)`, threads behind a `Barrier`, and `connection.close()` in each thread. They must use separate connections, never sequential calls.
- **Web:**
  - TanStack Query hooks call the typed `openapi-fetch` client.
  - Mutations with side effects keep one key from `useIdempotencyKey` across retries.
- **Style (D51–D54):**
  - **Colours** come only from the tokens in `apps/web/styles.css`:
    - `canvas` for the page, `surface` for panels, `inset` for fills, `line` for borders, `control` for input borders;
    - muted blue for primary actions, navy for navigation, teal for available, blue for occupied, amber for warnings, red for errors (D57).
    - `contrast.test.ts` must pass after any token change.
  - **Surfaces** stay flat: no shadows, gradients or blur. Corners are 8px on controls and 12px on panels, on the 4px spacing scale. Status badges may be pills (D57).
  - **Type:**
    - Plex Sans 400, 500 and 600.
    - Plex Mono at 600, never 500, for plates and references.
    - `tabular-nums` on money and times.
  - **Icons** come only from `components/icons.tsx` and always sit beside a word. To add one, copy its path from the `@carbon/icons` SVG. Don't install the package, which runs telemetry.
  - **Copy:**
    - buttons start with a verb;
    - no "successfully", "please" or exclamation marks;
    - empty states name the next step.
- **Simplifications:** mark deliberate ones in code with a `ponytail:` comment naming the limit and the upgrade path.

## Gotchas

- **Stopped containers:** Docker Desktop restarts leave the Bayline containers stopped; run `pnpm db:up` or `pnpm demo:up`. The dev server, integration tests and the demo stack share the one PostgreSQL container on port 54330.
- **Temp files:** on Windows, Git Bash's `/tmp` is not Node's or Python's `C:\tmp`. Use the session scratchpad, or pipe output (`curl … | node -e …`).
- **Seed timing:** seeded reservations are timed from the seed run. After about 35 minutes the overstay conflict clears (the waiting booking becomes a no-show). `pnpm demo:reset` is in the blueprint but not implemented, so a fresh database is the only way back.
- **Line length:** Ruff allows 100 characters, and long comments are the usual failure.
- **Slow Vitest:** about 40 seconds. The repository sits in a OneDrive-synced folder and jsdom start-up is slow.
- **CRLF warnings:** Git warns about CRLF on new migration files; `.gitattributes` normalises them, so ignore the warning.
- **Report downloads:** declaring binary responses makes openapi-fetch type bodies as strings. The client is typed for `application/json` only, and reports download through plain links.
- **Vite HMR:** the websocket fails when the browser opens `localhost` while Vite listens on `127.0.0.1`. Reload the page after edits.
- **CSS in Vitest:** CSS imports are blanked, even with `?raw`. `test.css.include` in `vite.config.ts` lets `styles.css` through for the contrast test.

## Deferred work

Collected from PROGRESS "known limitations"; pick up when a milestone needs it.

- **Missing screens and APIs:**
  - no screen for bay mode or state (API only);
  - no API or screen for location assignments;
  - no forms to create locations, bays or tariffs;
  - no discounts.
- **Lists:** the gate, sites, customer bookings, staff board and closed shifts read only the first page.
- **Reservations:** no confirmation code or QR, no advance payment and no customer receipts.
- **Worker:** has no lease; its sweeps are safe to run twice because rows are claimed with SKIP LOCKED.
- **Cash and receipts:**
  - no manager close of an abandoned shift and no adjustments after close;
  - no physical printer tested; a cancelled print dialog counts as a copy.
- **Seed:** refunds wait for M6 (captures total NPR 300); passes, offline visits and devices wait for M5 and M7.
- **Design (M8):**
  - mobile tabs for Entry, Find vehicle, Reservations and Shift;
  - a navigation rail from 768 to 1199px;
  - a top bar with location, shift and connectivity;
  - Plex Sans Devanagari in the PDF reports.
- **Tooling:** no Playwright/axe suite or screenshots yet (M8). Biome does not lint `styles.css`.
