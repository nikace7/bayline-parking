# Handover

Start here when picking up Bayline in a new session. Rewrite **Current state** and **Next session** before ending every session. Update the rest when a convention changes.

Verified results per milestone are in [PROGRESS.md](PROGRESS.md), reasons in [DECISIONS.md](DECISIONS.md) and the specification in [BLUEPRINT.md](BLUEPRINT.md) (v1.1).

## Current state (15 September 2026)

- **M0–M3 are on `main`**, merged through PRs #1–#4 on `nikace7/bayline-parking` (private) with CI green.
- **M4 Reservations and the design system update share one PR** from `feat/design-system` to `main`.
  - The branch holds the 9 reviewed M4 commits, with the design commits on top.
  - `feat/m4-reservations` was never pushed on its own.
- **Verification:** all checks pass. See the design system and M4 sections of PROGRESS.md.
- **M4 code review:** the independent review found one medium issue (an unlocked hold-limit count), now fixed and covered by a race test.
- **Design review:** one medium finding is fixed with a test: bookings starting just after midnight were missing at the gate before midnight. PROGRESS has all three findings.
- **Design audit is half done:**
  - Tokens, fonts and the public pages were checked in the browser.
  - Signed-in screens have not been checked visually; PROGRESS lists them.
- **Local database:** at the user's request, the demo accounts in the development database use a password the user chose, not `DEMO_PASSWORD`. A fresh seed brings back `DEMO_PASSWORD`. Ask the user for it; never write it down.

## Next session

1. **Watch CI on the PR.** Rebase-merge only when the user asks.
2. **Finish the design audit:**
   - The user signs in in the Browser pane: `owner@northgate.test` first, then `bina@customer.test`.
   - Check the screens PROGRESS lists at 360, 768 and 1280px, and fix cheap findings.
3. **Start M5:** once merged, branch `feat/m5-member-passes` from `main`.
4. **Read the spec before building M5:** the passes parts of blueprint sections 3–5, P09, and D25–D32 (the cash and idempotency rules passes must fit).

## Roadmap

| Milestone | Status | Scope (blueprint section 8) |
|---|---|---|
| M0 Foundation | Merged | Workspace, auth, envelope, scoping, audit, contracts, tokens |
| M1 Sites and tariffs | Merged | Locations, bays, tariff versions, shared calculator vectors |
| M2 Gate journey (cash) | Merged | Entry, quote, invoice, cash shift, capture, exit, idempotency, lock order |
| M3 Shift, receipts, reports | Merged | Shift close, receipt counters, print CSS, PDF/XLSX reports |
| M4 Reservations | In PR with the design system | Customers, holds, exclusion constraint, check-in, relocation, worker |
| M5 Member passes | Next | Pass-first lock order, entitlement, renewal invoices; P09 |
| M6 Payment integrity | — | Fixture QR, Khalti sandbox adapter, lookup worker, refunds/voids; P10–P14 |
| M7 Offline and devices | — | PWA outbox, device sync, conflict queue, Capacitor shell; P23, P24, P26, P27 |
| M8 Polish and evidence | — | Responsive/keyboard passes, screenshots, `docs/API.md`, `OPERATIONS.md`, `EVALUATION.md`, `DEMO.md`, `CASE_STUDY.md` |

## Working agreements

- **Branches:** one feature branch per milestone (`feat/mN-short-name`), merged into `main` by rebase.
- **Commits:**
  - Use conventional commits grouped by concern, typically accounts, sites, parking, worker/infra, tests, contracts, web, seed, docs.
  - Keep each commit green where the dependencies allow.
  - End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
  - End PR bodies with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Ask the user first before:**
  - pushing, opening a PR or merging;
  - enabling Auto-fix.
- **Never:**
  - enable auto-merge unless asked;
  - skip hooks (`--no-verify`).
- **Secrets:**
  - Never print or commit `.env`. `DEMO_PASSWORD` lives there.
  - The folder above this repository holds unrelated private files; do not open them.
- **Config files:** don't edit lint or format configs such as `biome.json`. A config-protection hook blocks it; narrow lint paths or move files instead.
- **Browser checks:** the agent's browser policy forbids typing passwords or creating accounts. Signed-in screens are covered by component tests with a mocked API, and PROGRESS lists accounts for a manual pass.
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
    - teal for primary actions and "available", blue for occupied, amber for warnings, red for errors.
    - `contrast.test.ts` must pass after any token change.
  - **Surfaces** stay flat: no shadows, gradients or blur. Corners are 6px on controls and 10px on panels, on the 4px spacing scale.
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
