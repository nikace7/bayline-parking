# Progress

## Complete operational lists and database verification — 29 October 2026

### Delivered

- Shared cursor reader follows every page for locations, bays, parked visits, public locations, reservations, closed shifts, tariffs and staff. Member passes retain their explicit load-more workflow.
- Keeps location/status/date/plate filters on the original endpoint; cursor values are opaque query parameters, never URLs to navigate.
- Deduplicates rows by identity, rejects missing pagination metadata/repeated cursors and rejects later-page failures instead of publishing partial lists. Query cancellation propagates through each request and stops page traversal.
- Operational totals now use the complete loaded bay/visit lists. These are still polled, multi-request views rather than an atomic database snapshot; server-side admission/settlement checks remain authoritative.
- Updated test fixtures to include real pagination metadata and added a Chromium large-site regression: 105 bays, 101 parked visits, 4 walk-in bays free, and the last bay visible.

### Verification

- Real PostgreSQL integration: **88 passed**, including auth, tenant isolation, memberships and separate-connection concurrency tests. The suite uses the isolated test database, not demo records.
- Frontend API tests cover pagination failures/cancellation plus current-cookie CSRF handling and error propagation. API client coverage: **97.36% lines, 100% branches**.
- Full frontend suite: **93 tests passed across 17 files**.
- Production build, typecheck, lint and five Chromium scenarios passed. Membership/occupancy browser scenarios mock API data; the existing PWA scenarios exercise actual service workers/cache storage.
- React and paired TypeScript review found no confirmed issues. No backend/API/schema changes were required.

### Limits and next

- Full-list polling removes truncation at current scale; it is not an unbounded-scale reporting design. Measure busy-site load before replacing the board with a server summary and windowed list.
- Manual sign-in in the user's browser remains unresolved; fresh automated browser login previously succeeded. No credential reset or authentication bypass was introduced.
- Next domain work remains email-independent customer profiles/open-lot capacity, then registered-device offline transaction sync. PWA offline entries/payments remain disabled.

## M5 staff membership workflows — 29 October 2026

### Delivered

- `/members`, accessible from desktop and mobile navigation, lists pass/customer/plate/coverage details, filters by location and plate, and follows cursor pagination.
- Owners/managers sell single-vehicle passes at one location and renew active/expired passes. Dates use the selected location's clock; rupees parse to integer paisa. Existing customer accounts are required by the backend.
- Owners/cashiers take the outstanding cash payment using an open shift at the selected location. The API checks the invoice's actual location and settlement; the UI refreshes passes and shift totals and links the receipt.
- Sales, renewals and cash payments reuse idempotency keys after network/server failures. Completed forms require a new-sale action before resubmission; a completed cash action is disabled while its invoice remains visible.
- Membership receipt rendering no longer formats absent parking-session dates. Renewal forms receive keyboard focus and restore the initiating control when closed.

### Verification

- Frontend: 85 tests passed across 16 files. Includes sales, exact paisa/Kathmandu time, roles, renewal focus, pagination, failed-response retry keys, duplicate collection prevention and membership receipts.
- Backend unit: 40 passed. No backend/API/schema changes; PostgreSQL integration suite not rerun.
- Chromium: 4 passed, including a mobile sale → collection → activation → receipt-link flow with mocked API responses, plus the three existing real service-worker tests.
- TypeScript, production build and canonical lint passed. Targeted membership page/hooks coverage before the final focus test: 85.55% lines, 82.02% branches.
- React and paired TypeScript review completed; the renewal focus issue was reproduced and fixed. No remaining confirmed findings.

### Limits and next work

- Browser payment tests do not prove the live backend/database journey. Run PostgreSQL integration and a real synthetic-account walkthrough before treating M5 as production verified.
- The sale form creates one vehicle/one-location passes; existing richer API-created passes can be read. Email-free customer profiles, offline transaction sync and historic receipt discovery are separate work.
- No deployment or push was performed. Work is recorded in focused local Git commits: tests, API actions, receipt fix, staff UI, then documentation.

## PWA offline shell — 29 October 2026

The user selected PWA-only development; Flutter/Capacitor are excluded (D55). This delivery implements installation/static offline access, not offline financial transactions (D56).

### Delivered

- Production service worker and manifest/icons; static app/font precache and deep-link offline reload.
- Explicit offline screen; no API response cache and no queued parking/payment writes. Existing forms survive a temporary disconnect, with keyboard focus handed to the offline heading and restored on reconnect.
- Prompted updates and registration/update error states; no involuntary app reload during a form.
- Real Chromium offline/cache/manifest tests and CI integration. Instructions and next sync milestone: `docs/PWA.md`.

### Verification

- The initial cache-policy tests failed before implementation. The subsequent keyboard-focus regression test also failed before its fix.
- Targeted PWA component coverage: 96.66% lines and 95.65% branches. Coverage applies to `PwaBoundary.tsx`, not the whole application.
- Production build, TypeScript and lint passed. The generated worker precaches 48 entries, approximately 1.12 MiB.
- Three Chromium browser scenarios passed: offline navigation/reload/reconnect, API cache isolation, and manifest/icon validation.
- Full frontend suite: 77 passed across 15 files.
- Backend unit suite: 40 passed. Database integration tests were not rerun because this delivery changes no backend/API/schema code.

### Review and limitations

- Build review resolved a pnpm runtime import failure by making `workbox-window` a direct dependency.
- React review identified focus loss during offline transitions; fixed with a regression test.
- No physical devices/printers, Android/iOS installation UX, production HTTPS deployment or persistent offline transaction sync was verified. `navigator.onLine` does not prove server/database health.
- No changes were made to the sibling parking projects. No external deployment was performed.

### Next

Complete the current operator workflows and Nepal domain fit described in `docs/NEPAL-ARCHITECTURE-PROPOSAL.md`, then implement the registered-device/IndexedDB/server-sync milestone in `docs/PWA.md`. Do not treat an installable shell as completed M7 offline cash capture.

## Design system update — built, audit half done (15 September 2026)

Branch `feat/design-system`, stacked on `feat/m4-reservations`. The user asked for a deliberate, professional look with no generic template styling. The web app now follows the IBM Design Language family (D51–D54):
- IBM Plex type and Carbon icons;
- flat surfaces with 1px borders;
- one cool grey family and one teal brand colour, with other colours only for state.

### Delivered

- **Colour (D52):**
  - A cool neutral palette replaces the warm beige set: `canvas` #F2F4F3, `inset` #E8EDEB, `control` #6B7D78.
  - A new `line` token (#D3DCD8) draws panel, table and divider borders at 1.27:1 against the page and 1.40:1 on panels; the old `inset` borders measured 1.05–1.16:1. These borders are decorative, so WCAG's 3:1 non-text minimum applies only to control borders.
  - `src/lib/contrast.test.ts` reads the tokens from `styles.css`. It fails if a text pair drops below 4.5:1, a control border below 3:1, or `line` below 1.25:1.
- **Type (D53):**
  - Nepali text uses IBM Plex Sans Devanagari, downloaded only for Devanagari characters.
  - Plex Mono loads a real 600 weight, so plates and references are no longer synthesised bold.
  - Noto is removed from the web app. PDF reports keep their committed Noto fonts (D38).
- **Icons (D54):**
  - 18 Carbon glyphs are copied into `components/icons.tsx`, with IBM's Apache-2.0 licence beside them.
  - Both Carbon npm packages run a telemetry postinstall script, so none is installed. Lucide is removed.
  - The logo is a typographic "P" mark, and the button spinner is CSS.
- **Gate:**
  - The occupancy strip shows parked and free walk-in counts at the 40px count size.
  - A reservable bay shows "Reserved" while a confirmed booking's arrival window is open. `dueReservation` makes that check and is shared with the arrival panel.
  - Empty states are left-aligned panels with a next step, not a centred icon.
- **Gallery:** `/gallery` shows the palette, the three typefaces with a Devanagari sample, and every icon.

### Verification (actual runs, Windows 11)

| Check | Command | Result |
|---|---|---|
| Frontend unit | `pnpm test:unit` | 63 passed in 13 files (adds 22 contrast checks and the arrival-window helper) |
| Backend integration on real PostgreSQL | `pnpm test:integration` | 78 passed (adds the staff board's midnight arrival test) |
| Backend unit | `pnpm test:unit` | 36 passed (unchanged) |
| Lint | `pnpm lint` | Biome: 52 files, no issues. Ruff: all checks passed, 84 files formatted |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | JS 437.63 kB (131.67 kB gzip), was 435.77 kB. CSS 44.02 kB (13.58 kB gzip), was 29.24 kB. The extra CSS is `@font-face` rules for the new weights and scripts; a font file downloads only when a page uses its unicode range |
| Dependencies | grep across `apps/web` and `pnpm-lock.yaml` | No `lucide` or `noto-sans-devanagari` left |
| Browser, public pages | `pnpm dev`, computed styles and `document.fonts` | Page background `rgb(242, 244, 243)`, secondary button border `rgb(107, 125, 120)`, panel border `rgb(211, 220, 216)`. Plex Sans Devanagari 500 and Plex Mono 400 and 600 loaded, with no Noto faces. At 360px, `/park`, `/login`, `/register`, `/account/register`, `/gallery` and the 404 page do not scroll sideways |

### Found during the design update

- Vitest blanks CSS imports even with `?raw`, so the contrast test first failed on a missing token. `test.css.include` in `vite.config.ts` now lets `styles.css` through.
- `@carbon/icons` and `@carbon/icons-react` both depend on `@ibm/telemetry-js` and run it at install, so the glyphs are vendored instead (D54).
- Vite's HMR websocket fails when the browser opens `localhost` while the dev server listens on `127.0.0.1`. Reload to see changes.
- The first token edit missed the control colour and the font stacks. Computed styles in the browser caught it.
- **Independent review of the design commits:**
  - **High, not accepted as filed:** `line` measures 1.27:1 on the page, below WCAG's 3:1 non-text minimum. That minimum covers borders needed to identify a control, and control borders have their own 3:1 check. Panel and table borders are decorative, and `line` sits between Carbon's two subtle borders. D52 now records its contrast, and the contrast test keeps it at 1.25:1 or more, which the old borders fail.
  - **Medium, fixed:** the staff board's `date` filter matched a booking's stay, not its arrival window.
    - A booking starting at 00:05 was missing from the previous day's list, although check-in opens at 23:55. Neither the arrival panel nor the "Reserved" tile showed it for those 10 minutes.
    - The filter now reaches 10 minutes past midnight. `test_staff_board_lists_a_booking_due_before_local_midnight` failed without the fix and passes with it.
    - The bug came from M4.
  - **Low, not changed:** the gallery's colour labels copy the hex values, so a palette change could leave them stale. The page only displays them.

### Not verified / known limitations

- **Signed-in screens not checked visually** at 360, 768 or 1280px: `/operations` with its panels, `/reservations`, `/shifts`, `/reports`, a receipt, `/settings/sites`, `/settings/staff`, `/account/reservations` and its detail. No page had a 768px pass. The agent cannot type passwords; the user can sign in in the Browser pane to continue the audit.
- **Structural gaps left for M8:**
  - mobile tabs for Entry, Find vehicle, Reservations and Shift;
  - a navigation rail from 768 to 1199px;
  - a top bar with location, shift and connectivity.
- **PDF reports** still use Noto Sans Devanagari.
- **Biome** still does not lint `styles.css`; the contrast test guards only the colour tokens.

## M4 Reservations — built and verified (15 September 2026)

Branch `feat/m4-reservations`. Adds customer bookings on reservable bays: find a location, hold and confirm a bay, check in at the gate, and handle no-shows and overstays by relocating the next booking. An independent code review covered:
- tenant isolation and roles;
- double booking and lock order;
- idempotency scope;
- time zones;
- validation, throttles and CSRF;
- migrations;
- frontend retries and accessibility.

It found no critical, high or low issues. It found one medium issue, now fixed; see "Found during M4" below.

### Delivered

- **Customers:** `POST /auth/customer/register` creates a global account with no staff access (CSRF, auth throttle). A `Customer` profile is created per organisation on the first booking there, and each booking gets an 8-character reference (D41).
- **Reservations:** a `Reservation` claims a bay for [start, end). A PostgreSQL exclusion constraint over `HOLD`, `CONFIRMED` and `CHECKED_IN` rows stops two bookings for one bay overlapping. Holds last 5 minutes, a customer keeps at most 2 live holds, and bookings run 30 minutes to 12 hours. The first free compatible bay is taken under its bay lock (D42, D44).
- **Status without waiting for the worker:** reads show a lapsed hold as `EXPIRED` and a missed arrival as `NO_SHOW`. Writes store those states under lock before checking a bay (D47).
- **API:**
  - Anonymous and throttled: `GET /public/locations` and `/public/locations/{id}/availability`, which returns only a free bay count.
  - Customers: `GET/POST /customer/reservations` and `GET /customer/reservations/{id}`.
  - Actions: `POST /reservations/{id}/confirm`, `/cancel` and `/relocate`.
  - Staff: `GET /reservations` with `locationId` and `date` filters and an overstay `conflict` flag.
  - Hold and confirm take an Idempotency-Key scoped to the location's organisation (D43).
- **Check-in:** `POST /parking/entries` with `reservationId` admits a reserved vehicle from 10 minutes before the start to 15 minutes after, when the plate and bay match. Walk-ins cannot use reservable bays. An early arrival cannot take a bay another booking still claims. Exit completes the reservation (D45).
- **Overstay and relocation:** a vehicle parked past its booking flags the next booking for that bay. Owners and managers can move that booking to a compatible free bay, with both bays locked in UUID order, or cancel it with a reason (D46).
- **Bay changes:** `PATCH /locations/{id}/bays/{id}` changes mode or state with `expectedRevision` (428 when missing, 409 when stale). It is refused while a vehicle is parked there or a booking claims the bay (D49).
- **Worker:** every 5 seconds, `manage.py worker` stores lapsed holds and no-shows and purges idempotency records older than 7 days. Its sweeps claim rows with SKIP LOCKED. Compose runs it as the `worker` service (D48).
- **Web (D50):**
  - Customers:
    - `/park` lists locations and counts free bays for a time entered in the location's time zone, then holds and confirms a bay.
    - `/account/register` creates an account.
    - `/account/reservations` and its detail page show bookings. Customers land there after signing in.
  - Staff:
    - `/reservations` is a day board with conflicts and move and cancel forms.
    - The gate shows an arrival panel for reservable bays.
- **Seed:** two customers at North Gate Central. Asha's vehicle is still parked after her booking ended, so Bina's next booking for that bay shows the conflict. Bina's earlier booking was a no-show.

### Verification (actual runs, Windows 11, PostgreSQL 17.11)

| Check | Command | Result |
|---|---|---|
| Backend unit | `pnpm test:unit` | 36 passed (unchanged) |
| Frontend unit | `pnpm test:unit` | 40 passed in 11 files (adds the park page, reservations board, arrival panel and time-zone input conversion) |
| Backend integration on real PostgreSQL | `pnpm test:integration` | 77 passed (9 reservations, 5 arrivals and relocation, 2 hold races on separate connections for the last bay and for one account's hold limit, 61 from M3 with the seed test now checking reservations) |
| Lint | `pnpm lint` | Biome: 49 files, no issues. Ruff: all checks passed, 84 files formatted |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | JS 435.77 kB (131.24 kB gzip), CSS 29.24 kB |
| Contracts | `pnpm contracts:generate`, then `pnpm contracts:check` after committing | No spectacular warnings; 11 new schemas including `Reservation`, `Availability` and `PublicLocation`. The check exited 0: the regenerated schema matches the committed files |
| Migrations and seed on the development database | `pnpm db:migrate`, `pnpm db:seed` twice | `accounts.0004`, `sites.0005` and `parking.0002` applied. The first seed run added 2 customers and 3 reservations; the second changed nothing |
| Containerised stack | `pnpm demo:up` (rebuilt images) | db, api, worker and gateway healthy. The worker logged "Worker started.", and its first pass marked 1 no-show. Through Caddy: `/park`, `/account/reservations` and `/reservations` serve the SPA. Anonymous staff and customer reservation lists answer 403. `/public/locations` lists 3 locations with 6 reservable bays each and only public fields. North Gate Central shows 5 of 6 car bays free an hour ahead, excluding the overstayed bay. A reversed interval answers 400 `VALIDATION_FAILED` |

Acceptance matrix:
- **P07:** a lapsed hold stops blocking without the worker; overlapping bookings for one bay are rejected; two customers racing for the last bay get one hold and one `NO_BAY_AVAILABLE`.
- **P08:** an occupied bay refuses a second vehicle; the waiting booking shows the conflict; relocation moves it to a free bay with both bays locked.
- **P01 extends to reservations:** another customer gets 404 reading or cancelling a booking. Another organisation's staff see an empty board and get 404 cancelling.

### Found during M4

- Review finding (medium): the two-hold limit was counted without a lock, so parallel hold requests from one account could each see room. Hold creation now locks the account's user row before counting (D44). `test_parallel_holds_from_one_account_stop_at_the_limit` made 3 holds with that lock patched out and passed five runs in a row with it.
- After a Docker Desktop restart, only the worker came back, because it alone had `restart: unless-stopped`. It logged a failed database connection every 5 seconds (1,142 tracebacks in 3 hours) while db, api and gateway stayed down. The loop survived as intended. The restart policy is removed so the stack starts and stops as one.
- Git Bash's `/tmp` is not Node's `C:\tmp` on Windows, so the first discovery probe read no file. The probe now pipes curl straight into Node.
- Tests and typecheck caught two missing imports: `BayMode`/`BayState` in the sites serializers and `ArrivalPanel` on the operations page.
- Otherwise only Biome and Ruff formatting.

### Not verified / known limitations

- The signed-in screens were not exercised in a browser (agent browser policy forbids entering passwords). This covers holding and confirming on `/park`, `/account/reservations`, `/reservations` and gate check-in. Component tests with a mocked API and API integration tests cover them. For a manual pass:
  - sign in as `bina@customer.test` to book;
  - `manager@northgate.test` to move the conflicting booking;
  - `operator@northgate.test` to check a vehicle in.
- Seeded bookings are timed from when the seed ran. About 35 minutes later, Bina's upcoming booking becomes a no-show and the conflict clears; only a fresh database seeds it again.
- No screen changes a bay's mode or state; that is API-only.
- No confirmation code or QR at the gate: staff pick the booking by bay and check the plate. Bookings are not paid in advance and have no customer receipt; reserved visits pay at checkout like walk-ins.
- No map on `/park`.
- The customer bookings list and the staff board show the first page only.
- The early-arrival `BAY_CLAIMED` check cannot trigger through the API while bookings start in the future and last at least 30 minutes; its test creates the short claim directly.

## M3 Shift, receipts, reports — built and verified (15 September 2026)

Branch `feat/m3-shift-receipts-reports`. Completes the cash success journey: admit, check out, take cash against a numbered receipt, exit, close the shift against the counted drawer, and report the day. An independent code review (tenant isolation and roles, capture/close races, receipt numbering, report time zones, PDF markup and spreadsheet formula injection, migrations, print flow, seed) found no critical, high or medium issues. Its one low finding is fixed: the seed backdates every demo organisation's tariffs, not only North Gate's, and the comment now says so.

### Delivered

- **Shift close:** `POST /shifts/{id}/close` by the shift holder stores expected cash (opening float plus every cash entry on the shift), counted cash and variance under the shift lock. `GET /shifts` (own shifts for cash staff, every shift for owners, managers and auditors; `status` and `locationId` filters) and `GET /shifts/{id}/summary`. A CHECK requires a complete close summary and a trigger rejects changes to a closed shift (D34, D35).
- **Receipts:** a `ReceiptCounter` per location is upserted inside the capture transaction, last in the lock order, giving `NGC-000001`-style numbers without gaps. `GET /receipts/{id}`; `POST /receipts/{id}/print-events` numbers copies under the receipt lock. Receipts and print events are append-only, with a composite organisation foreign key to the invoice. Payments and session detail carry the receipt reference (D33, D39).
- **`reports` app:** `GET /reports/collections` and `GET /reports/vehicle-log` take `locationId`, `fromDate`, `toDate` (at most 31 days) and `format=json|pdf|xlsx`. Local dates use the location's time zone and rows stop at `asOf`. PDFs embed Noto Sans Devanagari shaped by HarfBuzz; XLSX text cells are always strings (D36–D38).
- **Web:** `/shifts` shows the drawer summary, a counted-cash field with a live variance and the closed shifts table. `/receipts/:id` prints an 80 or 58 mm slip, logging each print before the dialog opens and marking reprints "Copy n". `/reports` switches report, location and dates, shows totals and links the PDF and XLSX downloads. Print CSS hides the app shell, the visit panel links to its receipt, and the navigation adds Shifts and Reports.
- **Seed:** one North Gate Central cash day through the services on the fixture clock (D40): NPR 1,000 float and NPR 300 taken, closed with NPR 1,280 counted (−NPR 20), then an open shift with visits in every M2 stage.

### Verification (actual runs, Windows 11, PostgreSQL 17.11)

| Check | Command | Result |
|---|---|---|
| Backend unit | `pnpm test:unit` | 36 passed (adds 3 export tests: font coverage per script, markup escaping, NPR format) |
| Frontend unit | `pnpm test:unit` | 36 passed in 8 files (adds receipt printing, shift close, variance wording and local date) |
| Backend integration on real PostgreSQL | `pnpm test:integration` | 61 passed (3 shift close, 2 receipts, 2 capture/close races on separate connections, 3 reports, seed cash fixture, 50 from M2) |
| Lint | `pnpm lint` | Biome: 39 files, no issues. Ruff: all checks passed, 79 files formatted |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | JS 414.40 kB (126.92 kB gzip), CSS 28.93 kB |
| Contracts | `pnpm contracts:check` after committing | Exit 0: regenerated schema identical to the committed files |
| Migrations and seed on the development database | `pnpm db:migrate`, `pnpm db:seed` twice | `sites.0004`, `billing.0003`/`0004` applied; the first seed run added the cash day (8 visits, 2 shifts, 4 receipts), the second changed nothing |
| Containerised stack | `pnpm demo:up` (rebuilt api image) | db, api, gateway healthy. Through Caddy: `/api/v1/health/ready` 200; `/shifts`, `/reports` and `/receipts/:id` serve the SPA; anonymous `/api/v1/shifts` and a `format=pdf` report answer 403 `NOT_AUTHENTICATED` as JSON. Inside the api container the seeded day's collections report has 4 rows, NPR 500 captured and receipts `NGC-000001`–`0004`; the vehicle log has 8 entries, 3 exits and 5 still parked; its PDF (23,342 bytes) and XLSX (5,741 bytes) build with the image's fonts |
| PDF rendering | Rendered vehicle log opened as an image | Devanagari plates and names shaped correctly (conjuncts and pre-base vowel signs) |

Acceptance matrix: P15 (a capture committed before a close is counted; a capture waiting behind a close gets `SHIFT_NOT_OPEN` and leaves no entry or receipt), P16 (the XLSX net total equals the screen total, and the seeded day's report matches the fixture; refund dates and memberships wait for M6 and M5), P17 (reprints keep the receipt number and number copies; a capture that fails after numbering leaves no gap) and P20 (formula-like plates stay text cells; a foreign location answers 404 and another organisation sees no rows) are covered.

### Found during M3

- Both @fontsource Noto Sans Devanagari subsets are internally named `NotoSansDevanagari-Regular`. ReportLab caches faces by that name, so Devanagari text was drawn with the Latin subset as boxes. The fonts are renamed on conversion, and `test_each_pdf_face_covers_its_script` guards it.
- Declaring the binary PDF/XLSX responses made openapi-fetch type every report body as possibly a string; the web client is now typed for `application/json` only.
- A CHECK constraint passes when its expression is NULL, so the close-summary CHECK tests each column for NULL explicitly.
- On a fresh database the demo tariffs started at seed time, so a backdated visit found no tariff in force; the seed now publishes them a day earlier (D40).
- Biome requires a `<fieldset>` rather than `role="group"` for the report switcher.
- The database container was stopped when verification resumed; `pnpm db:up` started it.

### Not verified / known limitations

- The signed-in screens (`/shifts`, `/receipts/:id`, `/reports`) were not exercised in a browser (agent browser policy forbids entering passwords). They are covered by component tests with a mocked API, API integration tests and the in-container export run. For a manual pass, sign in as `cashier@northgate.test` to print a receipt and close the open shift, then as `owner@northgate.test` for reports.
- No physical 58 or 80 mm printer was tested. A cancelled print dialog still counts as a printed copy (D39).
- Exports are built in memory, not streamed (D37).
- No exceptions report, no adjustment entries after close, and no manager close of an abandoned shift (D34).
- The seed has 8 visits in the M2 stages; the blueprint's 20 sessions with reservations, offline visits and passes wait for those features, and the fixture's NPR 50 refund waits for M6 (D40).
- The closed shifts table shows the latest 25.

## M2 Gate journey (cash) — built and verified (14 September 2026)

Branch `feat/m2-gate-journey`. An independent code review (authorisation and location access, lock order, double charge and double exit, idempotency replay, quote tokens, migrations, frontend retries) found no critical or high issues, one medium and one low; both are fixed. See "Found during M2" below.

### Delivered

- **Transactions and idempotency:** `retry_on_conflict` reruns a whole transaction on `40P01`/`40001` (three attempts); `conflict_on` maps named constraint violations to 409 codes. `IdempotencyRecord` is written in the business transaction: a repeated key replays the stored response (`Idempotent-Replayed: true`), a changed body answers `409 IDEMPOTENCY_KEY_REUSED` and a missing key `428 IDEMPOTENCY_KEY_REQUIRED` (D32).
- **Location access:** `LocationAssignment`; owners act at every location, other staff only where assigned (D27).
- **`parking` app:** Vehicle with a display plate and a matching key (D26); ParkingSession with one `PARKED` session per bay and per vehicle. `POST /parking/entries` locks the bay, rejects reservable, out-of-service, occupied and wrong-class bays, and pins the tariff in force at server entry time.
- **`billing` app:** open cash shift (D25), signed 120-second quote (D29), confirmed invoice recalculated from the pinned tariff, full-amount cash capture against an open shift at the visit's location (D30), and exit after settlement (D31). Session list and detail derive the stage `PARKED`/`CHECKOUT_PENDING`/`EXIT_READY`/`EXITED` with total, paid and due (D28). Payment entries are append-only; invoice→session, entry→invoice and entry→shift use composite `(id, organisation)` foreign keys. Lock order: bay → vehicle → session → invoice → shift.
- **Web:** `/operations` bay grid with occupancy refreshed every 5 seconds, plate entry for a free bay, a visit panel that steps through quote, checkout, cash and exit, and a cash shift bar for owners and cashiers. Each change keeps one Idempotency-Key across network and server-error retries.
- **Seed:** the operator and cashier are assigned to both North Gate locations, including on databases seeded before M2.

### Verification (actual runs, Windows 11, PostgreSQL 17.11)

| Check | Command | Result |
|---|---|---|
| Backend unit | `pnpm test:unit` | 33 passed (19 tariff and 6 database URL from M1/M0, 5 plate normalisation, 3 retry and conflict helpers) |
| Frontend unit | `pnpm test:unit` | 32 passed in 6 files (adds visit panel, time formatting and rupee parsing) |
| Backend integration on real PostgreSQL | `pnpm test:integration` | 51 passed (11 gate journey, 7 entry, 3 concurrency on separate connections, 1 idempotency key scope, 29 from M1) |
| Lint | `pnpm lint` | Biome: 32 files, no issues. Ruff: all checks passed, 66 files formatted |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | JS 396.45 kB (122.80 kB gzip), CSS 27.87 kB |
| Contracts | `pnpm contracts:generate` | No spectacular warnings; output identical to the updated committed files |
| Migrations and seed on the development database | `pnpm db:migrate`, `pnpm db:seed` twice | `accounts.0003`, `sites.0003`, `parking.0001`, `billing.0001`/`0002` applied to the M1 database; the first seed run added 4 assignments, the second added nothing. After the review fix, `migrate accounts 0002` and `migrate` reapplied them and the seed added the 4 assignments again |
| Containerised stack | `pnpm demo:up` (rebuilt api image) | db, api, gateway healthy. Through Caddy: `/api/v1/health/ready` 200; anonymous `/api/v1/parking/sessions` and `/api/v1/shifts/current` 403 `NOT_AUTHENTICATED`; `/operations` serves the SPA (200) |

Acceptance matrix: P02 (four threads, one bay), P03 (one plate, two bays), P05 (tariff pinned across a new version), P06 (duplicate cash and a crash before the replay record is saved), P28 (cross-organisation composite foreign keys) and P29 (a real deadlock whose victim is rerun once, with no errors) are covered.

### Found during M2

- Review finding (medium): the idempotency unique key left out the organisation, so a member of two organisations reusing a key would get a spurious `IDEMPOTENCY_KEY_REUSED`. The constraint and the replay lookup now include it (D32). Before the development database was migrated again, its old constraint rejected the same key in a second organisation; `test_one_key_can_be_used_once_in_each_organisation` covers the new behaviour.
- Review finding (low): opening a shift takes no Idempotency-Key, so a retried open showed `SHIFT_ALREADY_OPEN` as an error. The cash shift bar now refetches the current shift after any answer.
- Some Devanagari letters (such as U+0958) are composition exclusions, so NFC expands them to two code points; plate columns are 32 characters for a 16-character input.
- TypeScript types the recorded calls of the overloaded `api.POST` mock as `never`; the visit panel test casts them.
- The database container was stopped when verification started; `pnpm db:up` started it.
- Otherwise only Biome and Ruff formatting.

### Not verified / known limitations

- The gate screen was not exercised signed-in in a browser (agent browser policy forbids entering passwords). It is covered by component tests with a mocked API and by API integration tests; sign in as `operator@northgate.test`, then `cashier@northgate.test`, for a manual pass.
- No API or screen manages location assignments; only the seed and tests create them.
- No bay update endpoint yet: mode and state changes wait for the occupancy and reservation guards (M4).
- No discount input; quotes always carry a zero discount.
- Idempotency records expire after 7 days, but nothing purges them until the worker exists (M4).
- The gate reads only the first 100 bays and parked visits of a location.
- Shifts cannot be closed yet (M3), and the seed creates no sessions or shifts.

## M1 Sites and tariff core — built and verified (14 September 2026)

Branch `feat/m1-sites-tariffs`. An independent code review (tenant isolation, Python/TypeScript calculator parity, database constraints, secret handling, React page) found no critical, high, medium or low issues.

### Delivered

- **`sites` app:** Location (receipt prefix unique per organisation, coordinates, organisation time zone), Bay (`WALK_IN`/`RESERVABLE`, `ACTIVE`/`OUT_OF_SERVICE`, label unique per location) and TariffVersion. Database checks: block divides 24 hours, cap positive, tax at most 10,000 bps, one version per location/class/instant, valid choices. Tariff versions reuse the append-only trigger; the first `sites` migration enables `btree_gist`.
- **API:** `GET/POST /locations`, `/locations/:id/bays`, `/locations/:id/tariffs` (D20). All roles read; owners add locations; owners and managers add bays and publish tariffs. Foreign IDs return 404 before the role check; unique violations return `RECEIPT_PREFIX_TAKEN`, `BAY_LABEL_TAKEN` or `TARIFF_VERSION_EXISTS` (409). Version status is derived from `clock.now()` (D21); `tariff_at()` returns the version in force for M2 entry pinning. Every write records an audit event.
- **Tariff calculator** in Python and TypeScript with `fixtures/tariff-vectors.json` (18 cases) run by both (P04, P25; rules pinned in D22).
- **Seed:** `pnpm db:seed` builds both organisations through domain services (D23); `setup:local` generates `DEMO_PASSWORD`.
- **Web:** read-only `/settings/sites` (location details, tariff versions by class with status, bays) and a Sites navigation entry.
- **Accounts:** `add_member` service (seed and test fixtures no longer insert directly) and `ensure_roles` for post-scope role checks.

### Verification (actual runs, Windows 11, Docker 29.7.2, PostgreSQL 17.11)

| Check | Command | Result |
|---|---|---|
| Backend unit | `pnpm test:unit` | 25 passed (18 shared vectors, negative discount, 6 from M0) |
| Frontend unit | `pnpm test:unit` | 25 passed in 4 files (18 shared vectors, invalid discount, Sites page, 5 from M0) |
| Backend integration on real PostgreSQL | `pnpm test:integration` | 29 passed (9 sites, 2 seed, 18 from M0) |
| Lint | `pnpm lint` | Biome: 25 files, no issues. Ruff: all checks passed, 42 files formatted |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | JS 385.35 kB (119.97 kB gzip), CSS 25.81 kB |
| Contracts | `pnpm contracts:generate` | No spectacular warnings; schema and types regenerated and committed |
| Migrations and seed on the development database | `pnpm setup:local`, `pnpm db:seed` twice | `sites.0001`/`0002` applied; first run seeded, second run "nothing changed". Queried back: North Gate 5 staff, NGC and NGL; Riverside 1 staff, RVB; each location 12 walk-in + 6 reservable bays, car NPR 50.00 and motorbike NPR 20.00 per block, both `CURRENT` |
| Containerised stack | `pnpm demo:up` (rebuilt api image) | db, api, gateway healthy. Through Caddy: `/api/v1/health/ready` 200; anonymous `/api/v1/locations` 403 `NOT_AUTHENTICATED` envelope; `/settings/sites` serves the SPA (200) |

Acceptance matrix: P04 and P25 covered by shared vectors. P05 is partly covered (versions are immutable in the database and `tariff_at()` selects by time); pinning on a session arrives with M2. P01 now also covers locations, bays and tariffs. P02 moved to M2 (D24).

### Found during M1

- Docker Desktop had stopped between sessions, so the first integration run failed on connection timeouts, not on code; restarting it and running `pnpm db:up` cleared them. It also restarts other projects' containers.
- Formatting only from Biome and Ruff; no functional bugs were found.

### Not verified / known limitations

- The Sites page was not exercised signed-in in a browser (agent browser policy forbids entering passwords). Its rendering is covered by a component test with mocked API responses; sign in as `owner@northgate.test` with `DEMO_PASSWORD` for a manual pass.
- Setup is API-only: no forms yet to create locations, bays or tariffs.
- No update endpoints: bay mode/state changes need the occupancy and reservation guards (M2/M4); location edits wait for a use.
- ~~Operators are not yet limited to allowed locations (arrives with entry in M2).~~ Resolved in M2 (D27). ReceiptCounter waits for capture in M3.
- The Sites page reads only the first 100 bays and tariff versions of a location.
- A location's time zone is copied from its organisation; there is no time-zone input yet.

## M0 Foundation — built and verified (13 September 2026)

An independent security-focused code review found no critical or high issues and one medium issue (auth throttle bypass through a forged `X-Forwarded-For`), which is fixed and covered by a regression test. See "Bugs found and fixed" below.

### Delivered

- **Blueprint v1.1** (`docs/BLUEPRINT.md`) with revision summary; implementation decisions in `docs/DECISIONS.md`.
- **Workspace:** pnpm workspace (`apps/web`, `backend`), uv-managed backend pinned to Python 3.12, Compose (`db`, `api`, `gateway`) with pinned images, `pnpm setup:local` generating `.env` secrets.
- **Backend `accounts` app:** Organisation, global User, OrgMember role sets, AuditEvent. Atomic owner registration; login, logout, session read and organisation switch; staff list/detail/update with `expectedRevision` (428 when missing, 409 when stale) and last-enabled-owner protection under the organisation row lock. CSRF enforced explicitly on anonymous login/registration; auth endpoints throttled per real client IP through the database cache.
- **Database guarantees:** append-only trigger function `bayline_reject_mutation()` attached to `accounts_auditevent`; role-set and lowercase-email check constraints.
- **Wire contract:** request IDs, `{data}` envelope, error envelope with stable codes, cursor pages, JSON 404 for unknown `/api` routes, `/health/live` and `/health/ready`, OpenAPI with generated TypeScript types.
- **Web:** section 7 tokens; Button, TextField, StatusBadge, BayTile; app shell (224px navigation, 64px top bar with organisation selector, mobile bottom navigation); login, register, operations empty state, staff table and UI gallery; typed API client that sends the rotating CSRF token.

### Verification (actual runs, Windows 11, Docker 29.7.2, PostgreSQL 17.11)

| Check | Command | Result |
|---|---|---|
| Backend unit | `pnpm test:unit` | 6 passed |
| Frontend unit | `pnpm test:unit` | 5 passed in 2 files |
| Backend integration on real PostgreSQL | `pnpm test:integration` | 18 passed |
| Lint | `pnpm lint` | Biome: 21 files, no issues. Ruff: all checks passed, 27 files formatted |
| Typecheck | `pnpm typecheck` | No errors |
| Build | `pnpm build` | JS 379.00 kB (118.63 kB gzip), CSS 25.54 kB |
| Contracts | `pnpm contracts:generate` | `contracts/openapi.yaml` and `apps/web/generated/schema.d.ts` regenerated |
| Native dev in browser | `pnpm dev` | `/` redirects to `/login` and sets `csrftoken`; register form exposes four labelled fields; gallery bay tiles announce state/class/duration; money renders `NPR 12,34,56,789.01` and `−NPR 20.00`; IBM Plex and canvas token applied; no horizontal overflow at pane width; no console errors; no server errors |
| Containerised stack | `pnpm demo:up` | db, api, gateway healthy. Through Caddy: `/api/v1/health/ready` 200; `/gallery` serves the SPA with the CSP header; session returns camelCase JSON and sets `csrftoken`; unknown API route returns the 404 error envelope |
| Throttle behind the gateway | 11 logins with forged `X-Forwarded-For` via Caddy, rebuilt api image | `NUM_PROXIES` = 1 in the container; statuses 401 ×10 then 429 |

Acceptance matrix started, not complete: P01 is covered for staff membership endpoints only; P06, P19 and the rest arrive with their milestones.

### Bugs found and fixed during M0

- Circular import: `config.api` imported `rest_framework.views` at module level while being named in `REST_FRAMEWORK` settings (D14).
- Paginated responses were double-wrapped in OpenAPI because drf-spectacular emits them as a `$ref`; the envelope hook now resolves references.
- The error handler received Django's original `Http404`, so `get_object_or_404` produced 500 instead of the 404 envelope; exceptions are now normalised before DRF handles them.
- Review finding (medium): with `NUM_PROXIES` unset, DRF trusted client-sent `X-Forwarded-For`, so each forged IP received a fresh 10/minute login budget. `NUM_PROXIES` now comes from `TRUSTED_PROXY_COUNT` (0 natively, 1 behind Caddy) (D19); `test_login_throttle_ignores_spoofed_forwarded_for` failed before the fix and passes after.

### Not verified / known limitations

- Authenticated browser flows (register, sign in, staff table) were not exercised in the browser, because the agent's browser policy forbids creating accounts or typing passwords. They are covered by API integration tests; a manual pass is still recommended.
- ~~`pnpm contracts:check` passes trivially until the generated files are committed.~~ Resolved: the generated contracts were committed at the end of M0, so the check now detects drift.
- No Playwright/axe suite, 360px/768px/200% zoom captures or screenshots yet (M8).
- Biome does not lint `apps/web/styles.css`: its CSS parser rejects Tailwind `@theme` without a `biome.json` change, which the user's config-protection hook blocks.
- Vitest takes about 40 seconds, mostly jsdom start-up; the repository sits in a OneDrive-synced folder, so `node_modules` and `.venv` are synced too.

## Next: M5 Member passes

- Passes for customers or vehicles, with a pass-first lock order at entry and checkout.
- Entitlement checks at the gate.
- Renewal invoices raised through the billing module.
- Concurrent pass usage tests; the seed gains active and expired passes.
