# Architecture comparison: Bayline and the existing Nepal parking system

Reviewed: 28 October 2026. Scope: the local working copies, including the current `feat/m5-member-passes` branch of `parking_personal`. No application code was changed.

## Decision

**Use `parking_personal` as the engineering foundation, but use `parking-project` as the Nepal operations baseline.** The newer project has clearer transaction boundaries, stronger financial records and better automated verification. The existing project covers more of the work a Nepal parking operator actually performs: BS dates, fiscal-year billing, mobile printing, offline records, memberships, support and administration.

It would be inaccurate to call the newer project a complete replacement today. Its blueprint explicitly describes a portfolio edition and excludes production money movement, statutory tax certification and commercial subscription billing. The user's goal of a Nepal system comparable to the existing project is broader than that blueprint. Resolve this scope difference before continuing the roadmap unchanged.

This is a source-based architecture review, not a deployment certification, performance benchmark or tax-law assessment. “Present” below means found in source; it does not mean proven on production hardware.

## 1. What was compared

| Folder | Role found in source |
|---|---|
| `parking_personal/backend` | Django/DRF API with accounts, sites, parking, billing and reports modules |
| `parking_personal/apps/web` | Vite React/TypeScript SPA, React Query and generated OpenAPI types |
| `parking_personal/infra` | PostgreSQL, API, sweep worker and Caddy gateway |
| `parking-project/Parking-redesign` | Django/DRF backend with schema-based tenants, JWT, parking, membership, billing, sync, support, monitoring and other apps |
| `parking-project/parking-redesign-fe` | Next.js React/TypeScript frontend, React Query, Axios, Zustand and form/schema libraries |
| `parking-project/parking_frontend` | Separate Create React App JavaScript frontend; its active deployment status was not established |
| `parking-project/parkingg` | Flutter client with SQLite, background sync, scanning and native printer calls |

The existing folder contains several independent applications, rather than one unified workspace. Do not assume both web frontends are still actively used.

## 2. Architecture differences

| Area | Existing project | `parking_personal` | Assessment |
|---|---|---|---|
| Overall shape | Django monolith with many operational modules and several clients | Smaller modular Django monolith and one SPA | Keep the newer modular monolith. Microservices would add work without resolving the current gaps. |
| Tenant separation | `django-tenants`: hostname selects a PostgreSQL schema; shared and tenant apps | Shared tables with organisation IDs, explicit `for_org()` filtering and selected composite foreign keys | Shared tables simplify migrations and cross-location access. Every tenant-owned query still needs correct scoping; UUIDs and foreign keys do not prevent an unscoped read. |
| Identity | Tenant-aware JWT plus custom authentication middleware and cross-schema administration | Global user, organisation memberships, roles and active organisation in a server session | The newer model is easier for a user working in several organisations. A separate platform-admin workflow is still needed if operating the service commercially. |
| Browser authentication | Persisted access/refresh tokens; Axios refresh queue; token support in URL/cookie middleware | Same-origin session cookie and CSRF protection, including login/registration | Keep sessions for the browser. Design a separate device credential lifecycle when native devices are introduced. |
| Domain logic | Substantial work inside views, model `save()` methods and signals | Explicit service functions coordinate parking, billing and memberships | New service boundaries are easier to test and reuse across web, devices and later sync. |
| Parking model | Receipt-centred parking records, vehicle types and entry/exit logs | Separate vehicles, bays, sessions, reservations and member entitlements | New model supports reservations and occupancy well, but its assigned-bay workflow may not fit an open motorcycle lot. |
| Pricing | Decimal database fields, client calculations, backend calculation path and configurable calculation templates | Integer paisa, versioned tariffs pinned to a visit, shared frontend/backend test vectors | Both Decimal and integer minor units can represent money correctly. The stronger improvement is server authority and reproducible tariff history. |
| Settlement | Checkout updates parking and sales-report records | Quote → confirmed invoice → payment ledger → physical exit | The newer design distinguishes a priced visit, collected money and an exited vehicle. Preserve that separation. |
| Concurrency | Some transaction/row-lock protection, including fiscal-year bill numbering; versioned sync records | Explicit lock ordering, row locks, booking exclusion constraints, idempotency records and race tests | Newer project has stronger evidence around conflicting writes. This is not proof every possible race is solved. |
| Financial history | Sales-report records can be updated from the parking model | Append-only guards for payment entries, receipts, print events, audit events and tariff versions | Newer approach makes silent changes to financial history harder. Refund/void workflows still need implementation. |
| Live information | SSE code, Django signals, Redis/Channels configuration, WSGI and ASGI services | Five-second occupancy polling and thirty-second reservation-board polling | Polling is simpler for the current scope. Measure actual gate load before adding a broker or streaming service. |
| Background work | Celery, Beat, Redis and scheduled backup/monitoring jobs | Small PostgreSQL-based worker for expiration and cleanup | Keep the small worker for current jobs. It is not yet a general durable job queue with leases, retry policy and dead-letter handling. |
| API consistency | Manually maintained service calls/types, varied response shapes | Versioned API, common error envelope, request IDs, generated OpenAPI client types and drift check | Preserve the new contract pipeline as clients are added. |
| Deployment | Compose with PostgreSQL, Redis, Gunicorn, Daphne, Celery worker, Beat and Prometheus; VM deployment workflows | Local/demo Compose with four services and broad CI checks | Old project has more operational tooling; new project has a simpler stack and stronger checked-in quality gates. Neither source inspection proves production reliability. |

Main evidence: `backend/modules/{accounts,sites,parking,billing}`, `apps/web/src/{api,app}`, `infra/compose.yaml`, and `.github/workflows/ci.yml`; compared with `Parking-redesign/{parking/settings,authentication,parkinginfo,billing,sync}`, its Compose/workflows, and the clients listed above.

## 3. Nepal capability comparison

| Capability | Existing project evidence | New project today | What to do |
|---|---|---|---|
| NPR and Kathmandu time | Decimal money, Kathmandu settings and local date utilities | NPR currency, paisa calculations, UTC timestamps and location time zones | Keep the new storage model; test local midnight, overnight visits and date-filter boundaries. |
| Nepali names and plates | Nepali date/display tooling across web/mobile | Unicode plate normalisation, Devanagari web/PDF fonts | Keep original display text and a separate matching key. Add representative legacy and provincial plate fixtures before importing records. |
| BS calendar | AD/BS conversion utilities and web/mobile date pickers | Current time/date helpers; no equivalent BS workflow found in reviewed screens | Add BS input/display and AD/BS report filters over canonical stored dates. BS support is different from merely displaying Devanagari text. |
| Fiscal-year billing | `FiscalYear`, `GlobalFiscalYear`, bill uniqueness by fiscal year and numbering logic | Receipt sequences per location; no corresponding fiscal-year entity found | Model business fiscal periods and decide numbering scope explicitly. Preserve old numbers on import; test rollover without duplication. |
| Business invoice details | VAT/customer fields, sales-report tax fields, site/member bill settings | Tariff tax calculation and simpler receipt model | Define the required business identifiers, customer fields, tax presentation and export format before designing the final invoice. Current legal suitability was not checked. |
| Cash accountability | Cash/QR classification | Cash ledger, opening float, shift closing, counted cash and variance | Keep the new shift reconciliation; make it fast enough for cashiers. |
| QR payments | `CASH`/`QR` labels on parking and sales records | Current implemented payment method is cash; fixture QR/Khalti sandbox are roadmap items | Treat “operator recorded QR” and “provider verified payment” as separate facts. A QR label or screenshot is not provider confirmation. |
| Offline operations | Flutter SQLite records, CSV upload/background sync; backend push/pull and membership sync | Offline outbox and Android shell are planned, not implemented in reviewed runtime | Implement an acknowledged outbox and recovery UI before using at an unreliable connection. Decide which work may proceed offline. |
| POS printing/scanning | Flutter printer `MethodChannel` calls and QR scanning dependencies/workflows | Browser receipt layout for 58/80 mm and print-event tracking | Test the actual intended PC/POS device. Decide whether to retain Flutter as a client or build the planned Capacitor shell after a hardware proof. |
| Vehicle categories/rate patterns | Two/four wheelers, heavy vehicles and all-day types appear in checkout/model logic | `CAR` and `MOTORBIKE`; block tariff with grace, cap and tax | Add only categories and pricing patterns used by target sites. Current uniform-block pricing may not reproduce first-hour-plus-quarter-hour legacy tariffs. |
| Open-lot parking | Existing check-in centres on vehicle/receipt, without the newer bay selection | Admission expects a bay; reservable and walk-in bays are distinct | Validate whether staff assign physical spaces. For open lots, design capacity by vehicle class/zone rather than inventing a fake numbered space for every motorcycle. |
| Membership operations | Member/vehicle management, renewals and mobile screens | Pass sale/renewal API, entitlement code and tests exist on this branch; no dedicated membership route in the SPA | Finish sale, payment, renewal, lookup and receipt UI before claiming parity. |
| Platform operations | Tenant subscription, support, inventory, monitoring, backups and APK distribution modules | Organisation/staff/location management; no equivalent full platform console | Bring over only what running the target service requires. Support, recovery and tenant suspension may matter before inventory or APK hosting. |

Evidence: old `core/utils/date_conversion.py`, `billing/models.py`, `parkinginfo/{models,views}.py`, `tenant/models.py`, and `parkingg/lib`; new `sites/models.py`, `sites/tariff.py`, `billing/{models,memberships,urls}.py`, `apps/web/src/main.tsx`, and blueprint sections on scope/devices/offline work.

## 4. Specific problems worth avoiding

### Existing checkout trusts too much client state

In `Parking-redesign/parkinginfo/views.py`, `CheckoutView.post()` accepts `amount` and only recalculates it in the shown path when `int(amount) > 1800`. Its serializer leaves `amount` writable. The same lookup restricts the parking record to today's check-in date, which prevents that path from finding an overnight visit from yesterday.

The new `billing/services.py` calculates a server quote, signs its cutoff, recalculates from the pinned tariff during confirmation and requires payment to match the outstanding invoice. Retain this design. Do not port the old amount acceptance or date restriction.

### Sales records are coupled to model saves

Old `ParkingDetails.save()` performs bill numbering and calls `create_sales_report()`; that method can rewrite an existing report. This makes an ordinary save capable of changing financial projections. Bill-number assignment has locks, so it is not fair to say the old system has no concurrency protection. The problem is the broader coupling and mutable history.

Keep explicit business transactions in the new services. Corrections should have an authorised, audited workflow; its current capture-only ledger still needs the corresponding refund/void operations.

### The old Flutter cleanup can lose unsynced data

In `parkingg/lib/database/background_sync.dart`, `_syncData()` catches failures internally and returns no success result. `_clearDatabaseAtMidnight()` awaits it and then deletes all `parking_records`. A failed upload can therefore be followed by deletion. Midnight is also the wrong boundary for a vehicle still parked overnight.

Do not copy this retention rule. Delete only acknowledged records according to a retention policy, and preserve pending writes and active visits across midnight, restart and app upgrade.

### Old live-update plumbing is not reliable evidence of working realtime

`parkinginfo/sse.py` creates a synchronous queue inside `get()`, while broadcasts go through a separate process-local `sse_manager`; the shown request queue is not registered with it. The handler also has no authentication check in its executed `get()` path, despite having an unused authentication helper. The route is present in `parkinginfo/urls.py`.

Verify this before treating the old implementation as a reusable live-update feature. A replacement must authenticate, scope events to the organisation/location and work across API processes. The newer polling approach avoids this particular plumbing problem.

### Production authentication settings need attention in the old project

`parking/settings/production.py` replaces the entire `REST_FRAMEWORK` dictionary with a renderer-only dictionary, dropping the tenant-aware JWT authentication class from base settings. Verify the effective settings and each route under the actual deployment configuration before relying on production bearer authentication. Base settings also configure long-lived access tokens, and the Next.js Zustand store persists access and refresh tokens.

This is a source-level configuration finding, not a claim that a deployed instance was accessed or compromised.

### New lists silently stop at page one

`apps/web/src/app/gate.ts`, `reservations.ts`, `cash.ts` and `pages/SitesPage.tsx` explicitly document first-page-only handling. Gate/reservation requests commonly request 100 rows; closed shifts retain a smaller first page. A larger site can have records omitted from its operational view. Fix pagination and obtain occupancy totals independently of a truncated list.

### The current new roadmap understates the remaining Nepal work

`docs/HANDOVER.md` still describes M5 as the next build, while the branch contains membership models, services, migrations and tests. The SPA has no dedicated membership screen. `docs/BLUEPRINT.md` also explicitly excludes several commercial features.

Update the roadmap from code evidence: distinguish backend present, API tested, operator UI usable, hardware verified and production supported. A planned milestone is not a delivered capability.

## 5. Recommended architecture

Retain one Django API, one PostgreSQL database, the modular service layer and the same-origin SPA. Reuse the same domain services for online requests and later device sync. Keep accounts, sites, parking, billing and reports as the core boundaries.

Add Nepal-specific capabilities inside those boundaries: calendar presentation in shared date utilities; fiscal periods, invoice identity and settlement reconciliation in billing; extra vehicle categories/capacity modes in sites and parking. Keep provider integrations behind a small billing adapter rather than putting payment confirmation in the UI.

Introduce a device boundary only when building offline/POS support. Each command needs a stable operation ID, authenticated device, organisation/location, payload/version and explicit server outcome. Replayed commands must not create another visit or charge. Show rejected/conflicting operations for staff resolution. Restrict offline work initially to agreed cash walk-in operations; disconnected devices cannot independently guarantee a globally available reserved bay.

The platform-administration surface should be separate from parking staff permissions and audit its actions. It can remain in the same deployment. Shared tables do not require a separate microservice, and a global administrator must not be implemented as a browser-controlled organisation ID.

Use external backup scheduling or a managed database service if available. Redis/Celery are not prerequisites for backups or simple sweeps. Add a larger queue only when actual task volume, isolation or retry requirements justify it.

## 6. Prioritised implementation plan

| Priority | Work | Acceptance evidence |
|---|---|---|
| P0: define Nepal baseline | Revise the portfolio blueprint into the intended operational scope: BS dates, fiscal periods/invoices, vehicle classes, open-lot versus bay assignment, target printer, required QR workflow and offline operations | A capability matrix agreed against an actual site's daily workflow; each item marked implemented/planned/excluded |
| P0: complete current core | Finish member pass screens, paginate operational lists, provide authoritative totals, and exercise overnight checkout | A cashier can sell/settle/renew a pass; a site with over 100 records remains fully operable; yesterday's entry can exit today |
| P0: verify release fundamentals | Run PostgreSQL integration/race tests; add an authenticated browser journey covering entry → checkout → cash → receipt → exit → shift close | Passing current tests and a reproducible browser result, including permission failures and recovery after a lost response |
| P0: recoverability before real records | Automated backups, isolated restore rehearsal, documented startup/restart and deploy/migration recovery | Restored database with matching receipt/ledger totals; recorded recovery procedure and achievable recovery targets |
| P1: Nepal billing/calendar | BS display/input/filtering, explicit fiscal-period numbering, business/customer invoice fields and representative plate/rate fixtures | Fiscal rollover without duplicates, local date boundaries correct, required target-site tariff examples reproduced exactly |
| P1: controlled payment corrections | Audited void/refund paths, separately recorded manual QR, and provider reconciliation if provider verification is required | No ledger rewriting; repeated/late outcomes do not double-count; unresolved payments remain visible |
| P1: offline and physical devices | Acknowledged outbox, restart recovery, conflict handling, scanner and actual printer integration | Pending data survives midnight/offline/restart; replay creates one result; Nepali text prints legibly on the chosen device |
| P2: service operations | Worker heartbeat, structured logs/alerts, tenant support/admin workflow, import tooling | Worker failure and stale backups detected; administrative actions audited; import reconciles counts and totals |
| P2: performance | Measure realistic gate concurrency, report volume and polling load; optimise measured slow queries | Recorded latency/error targets met using representative data; tenant/location access remains correct |

Do not make customer maps, a second frontend rewrite, inventory management or microservices prerequisites for these improvements. Existing reservation features can remain, but reliable gate operation should lead Nepal replacement readiness.

## 7. Migration considerations

Do not migrate by copying the old tables directly. Map each tenant schema to an organisation and each location/user to the new membership model. Preserve legacy receipt IDs, bill numbers, fiscal periods and original timestamps as traceable historical references.

Reconcile memberships, active overnight visits, unpaid items and cash/QR totals before cutover. Keep already issued historical bills as historical records rather than pretending each old amount is a newly verified provider payment. Define an import identity and mapping so retrying an import is safe.

Rehearse on a sanitised copy, reconcile per location and fiscal period, then establish a controlled cutover boundary. Avoid simultaneous unsynchronised writes to both systems. The two applications do not currently share a compatible API or data model.

## 8. Checks performed for this report

| Check | Result on 28 October 2026 |
|---|---|
| New frontend unit/component suite | 67 passed across 13 files |
| New backend unit suite | 40 passed; 88 database-marked tests deselected |
| New frontend TypeScript check | Passed |
| Existing Next.js frontend unit suite | 8 passed across 2 files |
| New PostgreSQL integration suite | Attempted; collected 88 selected tests, then stopped while waiting for database access. Compose listed no running project services. No integration pass is claimed. |
| Source inspection | Models, services, serializers, permissions/authentication settings, routes, migrations/guards, clients, sync, printer calls, backup/SSE code, Compose, CI and planning documents |

Not run: old Django integration tests, either production deployment, load benchmarks, signed-in browser E2E, full builds/lint, real QR transactions, tax-compliance validation, physical scanners/printers or Flutter execution. Existing historical test claims in project docs were not treated as current results. The code review found both strengths and gaps; the test counts are evidence of executed suites, not a score of feature completeness.

**Practical conclusion:** Bayline is the better base for correctness and maintainability. To become the better Nepal system, it must combine that core with the old project's useful local workflows and prove recovery, offline handling, printing and billing behaviour at a real target site.
