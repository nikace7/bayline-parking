# Code structure and maintenance review

Reviewed 30 October 2026; customer-profile ownership updated 1 November 2026. This is a source-level maintenance review of the current Django/React application, not a full security or production-readiness audit.

## Assessment

The foundation is maintainable: five backend domains, explicit migrations, generated API contracts, shared money/time helpers and tests around financial concurrency. Keep the modular monolith and the single PWA client. More services, repositories or generic form frameworks would add complexity without solving a current requirement.

The frontend had responsibility drift: unrelated features imported a shared retry hook from the gate module; site queries were duplicated across screens; membership forms lived inside the listing page. These are now separated without changing their validation, retry or focus behavior. Review also found two API boundary problems: malformed error bodies could hide the HTTP error, and membership queries silently treated missing page metadata as the last page while ignoring cancellation. Regression tests cover both fixes.

## Where code belongs

| Location | Responsibility |
|---|---|
| `apps/web/src/api/` | Typed transport, CSRF, error/page validation, cursor traversal and shared request retry identity. No imports from domain hooks or pages. |
| `apps/web/src/app/` | Domain queries/mutations, session and application shells/PWA lifecycle. Hooks own cache keys and invalidation. |
| `apps/web/src/pages/` | Screen composition and domain-specific UI. `CustomerPicker.tsx` owns customer search/selection and its independent creation form; `MembershipForms.tsx` owns sale/renewal form state; `MembersPage.tsx` coordinates selection, lookup and payment. |
| `apps/web/src/components/` | Reusable controls and presentation primitives, independent of a particular screen. |
| `apps/web/src/lib/` | Pure money, time, labels and tariff calculations. |
| `apps/web/generated/`, `contracts/` | Generated API types/schema; regenerate through `pnpm contracts:generate`. |
| `backend/config/` | Settings, routing, envelopes, clock, transaction helpers and management commands. |
| `backend/modules/` | Accounts, sites, parking, billing and reports. Models/constraints and migrations protect stored invariants; services coordinate writes; views/serializers handle HTTP boundaries. |
| `fixtures/` | Test vectors shared between Python and TypeScript. |
| `infra/`, `scripts/` | Runtime packaging and local tooling. |

Frontend query owners currently include `app/sites.ts` (locations, bays, tariffs), `app/gate.ts` (gate/visit operations), `app/members.ts` (passes), `app/customers.ts` (tenant-scoped profile directory/creation), `app/reservations.ts` (bookings), `app/cash.ts` (shift/report/receipt operations) `app/zones.ts` (zone/pool setup and occupancy) and `app/session.ts` (authentication). The gate module still contains shared role and current-shift hooks; move these only when a concrete change benefits from it. Some older screens, including Staff, still define their own queries; avoid creating a second implementation for the same cache key.

Customer profile creation/search belongs to `backend/modules/accounts/customers.py`, with HTTP validation in accounts serializers/views. Billing receives a scoped customer ID or legacy account email. Profile contacts are not login identity; no other module should infer an account link from a matching contact. Migration/backfill and workflow details are in `CUSTOMER_PROFILES.md`.

Open-lot configuration and board composition belong to `pages/ZoneSetup.tsx` and `pages/OpenLotBoard.tsx`. `sites/zones.py` owns setup/read queries; `parking/services.py` owns occupancy locks/guards. Billing reuses physical exit after acquiring the pool first. See `OPEN_LOT_CAPACITY.md` for ownership and migration details.

`pages/ParkedVehicles.tsx` receives the existing scoped parked-visit list and owns its search/filter/detail selection UI. It reuses `GatePanels.VisitPanel` rather than issuing another directory query. `components/VisitStage.tsx` owns shared visit status/progress presentation. Preserve mounted views and membership sale state when hiding them; repeated View activation must refocus details.

`pages/ReservationDirectory.tsx` owns reservation search/filter/row presentation from the existing location/day query. `ReservationsPage.tsx` owns scope, selected action, completion and focus return. Keep mutation forms mounted through terminal-data refresh, and preserve drafts in a hidden directory on query failure; only successful query state may expose cached records/actions. Tests cover cancellation callback ordering and denial → network failure → remount → recovery.

## Rules for subsequent changes

- Reuse the owning domain hook instead of issuing the same query from another page. Forward TanStack Query's `AbortSignal` to each request.
- Use `unwrapPage` for an explicit page and `allPages` for a complete list. Never fabricate terminal pagination metadata or publish a partial result after a later-page failure.
- Preserve one idempotency key for the same intended mutation across ambiguous network/server failures. Shared handling lives in `api/useIdempotencyKey.ts`.
- Keep integer paisa and location time zones throughout forms, contracts and services. Server authorization, tenant scoping and financial guards remain authoritative.
- Keep backend views thin and scope records before role checks. Preserve atomic writes, audit events and the lock ordering required by the operation. Use real PostgreSQL connections for race tests.
- Prefer owning-module service calls for cross-domain mutations. The existing billing membership orchestration creates pass/coverage records in `parking` and activates them during payment. This exception is real and must preserve the shared pass-before-invoice transaction ordering. Extract a parking-owned mutation service only with the affected sale/renewal/payment and concurrency tests; do not move it mechanically for folder purity.
- Split code by responsibility, not an arbitrary line limit. Keep cohesive transaction/lock logic together. Tests remain beside frontend code and in backend test modules; browser journeys live in the web E2E suite.
- Regenerate contracts after API changes. Run the relevant regression tests, lint, typecheck and production build; run browser checks after form, navigation or PWA changes.

## Remaining improvements, in priority order

1. The real membership/parking/booking browser journeys were completed on 1 November; see `LIVE_WORKFLOW_CHECKS.md` and `pnpm test:live`. Fresh sign-in through the actual local gateway also passed. The user's existing browser profile and physical devices still need confirmation.
2. Independent customer profiles and open-lot zones/capacity are implemented and verified. Preserve pool-before-session locking and cached form/draft state. Profile editing/merging, verified account claiming and Nepal fiscal billing remain future domain work.
3. Deliver registered devices, a durable IndexedDB outbox, server replay/conflict handling and reconciliation together before enabling offline entries/payments. Current PWA caching covers static assets only; private API responses are excluded.
4. Measure pool occupancy history and complete-list polling at busy sites. It removes truncation but uses multiple requests and provides no atomic occupancy snapshot; introduce a server summary/windowed board when measured load requires it.
5. Continue consolidating legacy query/role/shift ownership when those areas change, and enforce cross-domain write services incrementally with concurrency coverage.

Verification for this cleanup: 100 frontend tests, 40 backend unit tests, five Chromium scenarios, lint, typecheck and production build passed. The preceding PostgreSQL integration run passed 88 tests; it was not repeated for this frontend-only cleanup. Browser membership/large-site scenarios mock API data; PWA checks exercise actual service workers and cache storage. No backend model, migration or contract changed.
