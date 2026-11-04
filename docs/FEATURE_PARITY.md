# Feature parity with the previous parking project

Source review: **4 November 2026**. Comparison: this repository (`parking_personal` / Bayline) and the sibling `parking-project`, primarily `Parking-redesign`, `parking-redesign-fe` and `parkingg`.

## Conclusion

**Bayline does not yet replace every feature in the previous project.** Core cash parking, member-pass sales/renewals, independent customer profiles, assigned bays and open-lot capacity are delivered. Several Nepal-specific and back-office workflows remain absent or narrower.

The engineering foundation has stronger evidence for server-calculated fees, immutable financial history, replay protection, tenant scoping and concurrent admissions. Those improvements do not establish feature completeness, hardware compatibility or production readiness.

This is a source comparison. A route/model/screen in the previous project is evidence that the capability was implemented there, not proof it works in production. No old application execution, payment-provider verification or legal/tax assessment was performed for this review.

## Delivered baseline versus work in progress

- Latest completed, published milestone: `codex/open-lot-capacity`, commit `9e53abf` (1 November 2026). The remote branch was confirmed during this review.
- Its recorded verification is 125 frontend tests, 40 backend unit tests, 113 PostgreSQL integration tests, 11 PWA/layout Chromium checks and six real Django/PostgreSQL browser journeys. These are historical runs for that milestone, not a new full-suite result on the current working tree.
- Current working branch: `codex/offline-cash-sync`. It contains **uncommitted** device/lease/command models, server services, guards, routes and initial tests. It has no completed IndexedDB client/outbox, offline operator page or verified end-to-end offline cash journey. It is not a delivered offline feature, and its draft routes are not evidence of release readiness.
- The earlier `ARCHITECTURE-COMPARISON.md` remains a dated 28 October report. Its statements that membership screens, pagination and open-lot capacity are missing have been superseded by the November deliveries.

## Capability matrix

| Capability in the previous project | Bayline status | Remaining difference |
|---|---|---|
| Vehicle admission, parked list, checkout and exit | Delivered | New flow deliberately separates quoting, invoice confirmation, payment and physical exit. Hardware/operator acceptance is still pending. |
| Open parking areas and multiple locations | Delivered for online operation | Zone/class capacity and assigned bays coexist. Moving/renaming/deleting zones and full location administration are not implemented in the current UI. |
| Cash collection and sales history | Delivered, with cash shifts and ledger | Shift opening/closing, counted/expected cash, variance and receipt links exist. QR and financial correction workflows remain separate gaps. |
| Customer/member creation without email | Delivered basic profiles | Name-only creation, optional contacts and lookup exist. Profile editing/merging and verified online-account claiming are absent. |
| Membership sale, renewal and vehicle entitlement | Partial parity | Paid activation, plate lookup and renewals work. The old in-house/out-house membership fields, shop/customer VAT details, member editing, member-specific exports and QR/card workflows are not reproduced. New sale UI handles one vehicle at one location; broader pass coverage is supported by the API. |
| Member QR generation and mobile QR lookup | Missing | Previous membership views and frontend contain QR/card flows. Current keyboard/plate entry is not equivalent to a QR member identity workflow. |
| Collections, vehicle logs and report export | Partial parity | JSON/PDF/XLSX collections and vehicle logs exist. Dedicated monthly/overall reports, membership exports, dashboard trends and all old report layouts are not matched. Current report requests are limited to 31 days. |
| Bikram Sambat calendar and date filters | Missing | Kathmandu time and Devanagari text work; AD/BS conversion, BS date entry and equivalent BS reporting workflows do not exist. |
| Fiscal-year billing and bill series | Missing | Current receipt numbering is per location, without old fiscal/global-fiscal-year models, rollover or matching historical bill-series rules. |
| Business/customer VAT details and invoice settings | Missing equivalent workflow | Tax calculation exists. Full business/customer invoice identities and historical billing snapshots/settings still need a defined implementation. The old `sync_with_IRD` flag does not demonstrate a verified IRD integration. |
| Receipt/slip and membership-bill customization | Partial parity | Fixed 58/80 mm browser receipts and numbered reprint requests exist. Old configurable headings, footers, logo, membership bill settings and entry-slip/card workflows are not matched. |
| Vehicle categories and calculation templates | Partial parity | CAR/MOTORBIKE, grace, uniform blocks, daily cap and tax exist. Old heavy/all-day categories, tenant calculation-template administration and equivalent first-hour/subsequent-block policies are not reproduced. |
| QR/online payment classification | Missing | Current completed flow accepts cash. The old CASH/QR labels are source evidence of recording a method, not proof of verified provider settlement. Manual QR recording and provider settlement must remain distinct. |
| Provider reconciliation, refunds and voids | Not delivered | These remain new-system requirements. Report fields and gallery buttons do not constitute an executable refund/void workflow; old QR labels do not establish provider parity. |
| Offline records, sync and restart recovery | Partial shell; transaction sync in progress | Installable static PWA and offline screen work. The previous Flutter/SQLite and push/pull sync features have no completed operational PWA replacement yet. |
| Thermal printer and scanner integration | Partial; hardware unverified | Browser print layouts and print-event records exist. Physical printer output, paper-out/restart behavior, scanner workflows and Nepali glyphs on target hardware still need acceptance tests. Native printer calls are not a PWA integration. |
| Staff administration and permission groups | Partial parity | Fixed roles, tenant/location authorization, staff reads and role/enable update API exist. The Staff screen is a list; staff creation/invitation/editing UI and custom group/permission management are missing. |
| Forgotten/reset password | Missing | Previous backend actions and frontend pages exist; the new auth routes have no equivalent recovery flow. |
| Site settings, vehicle/rate administration | Partial parity | Setup APIs and read screens exist; open-area creation/capacity editing are usable. Full owner-facing location/bay/tariff creation/editing and old business/site settings screens remain incomplete. |
| Support tickets, comments, notifications and correction requests | Missing | Previous tenant/support routes and models have these workflows. Bayline has audit records but no equivalent support/correction interface. |
| Inventory/materials | Missing | The old material model/API and materials/sales pages are not implemented here. Prioritize only if required by the intended operator/service. |
| Central tenant dashboard, subscriptions and service invoices | Missing | Organisation registration and staff operations exist. A platform console, plans, tenant subscription/invoice management and audited central support actions do not. |
| Monitoring, scheduled backups and recovery | Partial | Health/readiness endpoints, CI, a sweep worker and manual pre-migration dumps exist. Automated off-site backups, restore rehearsal, worker/stale-backup alerts and production runbooks are not established. |
| Import/cutover from old tenant records | Missing | No verified importer/mapping preserves old bill numbers, fiscal periods, active visits, memberships and cash/QR totals. The databases/APIs are not drop-in compatible. |

## Intentional architecture choices

- Flutter, APK hosting/distribution and a native Android shell are excluded by the user's accepted **PWA-only** direction. Their useful operational behaviors need browser-compatible replacements; the native clients themselves are not a backlog requirement.
- Shared tables with explicit organisation scoping replace hostname-selected tenant schemas. Subdomains are not required for the current tenant isolation model. This is an architecture difference, not automatically a missing parking feature.
- Current occupancy uses polling. The old SSE routes are not a requirement to copy their implementation; streaming should be considered against measured freshness/load needs.
- Reservations, paid pass activation, shift accountability and real concurrency/replay tests are strengths of the new design. They do not compensate for absent BS/fiscal, administration or support workflows when claiming a full replacement.

## Work remaining, in recommended order

1. **Finish the active offline cash milestone.** Complete migrations and contracts, registered/revocable devices, encrypted IndexedDB journal, local entry/cash/exit states, capacity/shift authority, acknowledgement/retry and conflict recovery. Prove disconnection, browser restart, midnight, lost responses, stale credentials, duplicate sync and storage failure before marking it delivered. Keep reservations/provider payments/pass checks online unless separately designed.
2. **Complete routine owner/staff workflows.** Staff invitation/creation and editing, password recovery, customer/member editing, member QR/card/export requirements, and usable site/bay/tariff setup. Agree which legacy membership distinctions are actually needed.
3. **Close Nepal billing and tariff gaps.** BS input/display/filters, fiscal periods/rollover, invoice identity, receipt customization, actual vehicle classes and representative legacy rate fixtures. Validate the site's billing requirements before claiming statutory suitability.
4. **Complete payment exceptions and reporting.** Explicit manual QR evidence, selected provider verification if required, refunds/voids/reconciliation, monthly/overall and member reports. Do not silently edit original captures or infer settlement from a payment label.
5. **Add the required service-management features.** Tenant support/correction queues, notifications, central administration/subscriptions if operating a SaaS. Inventory is a separate scope decision.
6. **Prove deployment and migration.** Actual printer/scanner/browser tests, scheduled backups plus an isolated restore, import reconciliation, load measurements and production operating procedures. A GitHub push or localhost login is not a public launch.

There is no defensible percentage-complete figure without an agreed, weighted acceptance checklist. Core operator readiness, full legacy parity and production readiness are different targets. The matrix above is the current source-based checklist.

## Source evidence inspected

Previous backend: `Parking-redesign/parking/urls.py`; accounts/authentication, tenant, core, parkinginfo, membership, billing, report, parkingstats, sync, support, inventory, monitoring and mobile routes; `membership/models.py` and QR/renewal/export actions; `core/models.py` receipt/site settings; `tenant/models.py` and `calculation_models.py`; `parkinginfo/models.py` vehicle/payment types; `billing/models.py` fiscal years and sales records.

Previous clients: `parking-redesign-fe/src/app` pages for member editing/QR printing, BS/fiscal reporting, receipt configuration, groups/users, support, materials and password recovery; `src/utils/getNepaliDate.ts`; Flutter `parkingg/lib/database`, membership, checkout and printing/scanning paths documented in the earlier comparison.

Current baseline: accounts/sites/billing/reports routes and models, `apps/web/src/main.tsx`, Staff/Sites/Members/Operations pages and owning hooks; `PWA.md`, `CUSTOMER_PROFILES.md`, `OPEN_LOT_CAPACITY.md`, latest `PROGRESS.md` evidence and `infra/compose.yaml`. Draft offline files and the working-tree status were checked separately and excluded from delivered parity.
