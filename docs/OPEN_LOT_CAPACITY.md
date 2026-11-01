# Open-lot zones and capacity

Implemented and locally verified on 1 November 2026. A location can operate numbered bays and shared parking areas together. An open area has separate vehicle-class capacity pools; an arrival chooses a pool rather than an invented bay.

## Try it locally

Start the stack with `pnpm demo:up` and open `http://localhost:4330/login`. Use the existing demo credentials from your local configuration.

1. As an owner or manager, open **Sites** and select a location with a tariff for the intended vehicle class.
2. Expand **Add an open parking area**, enter its name, choose Car or Motorbike, set a whole-number capacity and create it. The current UI creates one vehicle-class pool per area. The API also supports both classes in one area.
3. In **Operations**, select the area's card, enter a plate and confirm entry. No bay is assigned. Full and out-of-service pools remain visible but refuse admission.
4. Select a vehicle in the area to quote and confirm checkout. An owner/cashier collects cash against an open shift at that location. Payment leaves the vehicle parked.
5. An owner/operator records physical exit. Only then does the pool regain capacity. The receipt and vehicle log show the area's name.

In Sites, **Edit capacity** changes the capacity or service state. Capacity cannot be lower than the number of vehicles still parked. Setting a pool out of service stops new admissions while allowing its occupants to complete checkout/exit. Zero capacity is permitted.

The usual permissions remain: owners/operators admit and record exit; owners/operators/cashiers prepare checkout; owners/cashiers take cash. Non-owner gate/cash staff still need location assignment. Every staff role can read setup; only owners/managers configure pools.

## Model and concurrency

- `sites.ParkingZone`: organisation, location, name and immutable operational mode (`ASSIGNED_BAY` or `OPEN_CAPACITY`). There is one default assigned-bay zone per location.
- `sites.CapacityPool`: zone, vehicle class, capacity, state and optimistic revision. Occupancy is a count of parked sessions, not a separately mutable counter.
- Bays retain their identities and belong to the default assigned-bay zone. Existing bay entry and reservations retain their behavior.
- A parking session has a zone and exactly one of a bay or a capacity pool. Its pinned tariff supplies the vehicle class for reads, receipts and reports. Composite database foreign keys protect the new location/zone/tenant relationships.

Lock order is member pass → customer account for booking holds → capacity pool → bays in UUID order → reservation → vehicle → session → invoice → shift → receipt counter. Writers take only the subset they need. Pool admission, capacity edits and physical exit lock the same pool row. Exit reads the immutable pool identity first, then locks the pool before the session/invoice. Checkout and collection never acquire a pool later in their transaction.

This protects the last space and rejects reductions below occupancy. Membership entitlement still locks before either bay or pool admission: one pass place is shared across both modes. A pool is not a reservation pool; reservations remain on assigned bays.

## API and ownership

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/locations/{location_id}/zones` | Cursor-paginated, tenant-scoped zones and nested pools with occupied counts |
| `POST /api/v1/locations/{location_id}/zones` | Creates an open zone with one or two distinct vehicle-class pools; requires `Idempotency-Key` |
| `PATCH /api/v1/locations/{location_id}/zones/{zone_id}/pools/{pool_id}` | Updates capacity/state with `expectedRevision`; missing revision is 428, stale revision or capacity in use is 409 |
| `POST /api/v1/parking/entries` | Exactly one `bayId` or `poolId`; pool check-in with a reservation is rejected |

Session responses add `zoneId` and nullable `poolId`; `bayId` is nullable. The existing `bayLabel` wire field carries the bay label or area's name for compatibility. Receipts use a generic Space label; reports use Bay / area. Consumers must not assume that every session has a bay.

Setup/read logic is in `sites/zones.py`; `parking/services.py` owns occupancy guards and physical transitions. Billing keeps settlement separate from exit. Frontend requests/cache ownership is in `app/zones.ts`; `ZoneSetup.tsx` owns configuration forms and `OpenLotBoard.tsx` owns the pool board/admission intent, reusing `GatePanels.VisitPanel` for checkout.

Five-second polling updates pool counts. These counts and the parked-visit list are separate requests, so the screen is not an atomic snapshot. The server rechecks every admission. A failed background refresh keeps cached forms mounted and pauses new pool admissions until recovery. A remotely changed capacity preserves the editor's draft/focus and requires explicit reload before saving. Pool selection locks during a pending admission; successful admission requires an explicit new-vehicle action before another submission.

## Migration and recovery

Sites 0006 expands the schema, 0007 creates default assigned zones/backfills bay references, and 0008 makes the reference required and adds scope constraints. Parking 0004 expands session references and allows nullable bays, 0005 backfills session zones from their historical bays, and 0006 makes zones required and adds scope constraints. Schema and data changes are separate migrations. No bay, visit, booking, pass, receipt or payment is renumbered.

A full PostgreSQL custom-format dump was taken before upgrading the local synthetic demo. Before/after customer/user/payment counts, captured totals, bay/pass/visit/booking/receipt ID digests and visit-to-bay link digests matched. Evidence and the dump remain ignored under `artifacts/tmp/open-capacity-backup/`. Local readiness returned 200 after the rebuild. Backup restore rehearsal is still pending.

Deploy the migrations and new application writers together; stop old writers during this local-style upgrade. This milestone does not certify rolling deployment or production-sized migration duration. Reversal of parking 0004 refuses any pool-linked visit, including historical exited visits, before trying to make bays mandatory. Use a forward fix once open-lot history exists. Do not invent bays or remove financial history to force a rollback.

## Verified evidence and remaining limits

- 125 frontend tests, 40 backend unit tests and 113 PostgreSQL integration tests passed.
- Real separate-connection tests cover four arrivals at one last space, reduction versus admission, and shared pass entitlement across bay/pool admission. Migration tests cover history preservation and destructive rollback refusal.
- Six real Django/PostgreSQL Chromium journeys passed, including mobile open-area setup, admission, paid checkout, capacity retention until exit, released space and an area-labelled receipt. The harness then verifies an exited pool visit and exactly one capture in PostgreSQL.
- Eleven existing PWA/layout browser checks, lint, both TypeScript configurations, contract consistency and the production build passed. UI tests cover draft/focus preservation, background failure/recovery, pending selection locks, integer capacity and role controls. Independent Django, Python, database, React, TypeScript and general reviews reported no remaining findings after fixes.

The live harness blocks service workers and stubs only the print dialog; its offline-preparation banner does not certify offline writes. Hardware printing, browser-specific operator usability, production cutover and restore rehearsal remain unverified. Zone renaming/deletion, moving bays between zones, pooled reservations, additional vehicle classes and offline transaction sync remain outside this milestone. For large histories, measure pool counts and complete-list polling before adding active-occupancy indexes or a windowed summary.

Next is the registered-device/IndexedDB outbox/server acknowledgement and conflict-recovery milestone described in `PWA.md`. Calendar/fiscal billing, financial exceptions and verified customer-account claiming also remain on the roadmap and need their own acceptance criteria.
