# UI/UX judgement and workflow improvements

Reviewed 4 November 2026. Audience: parking attendants, cashiers and managers, independent of country. Direction: a calm, compact operations workspace with a clear next action, consistent controls and readable operational state. No neon, glow, gradients or decorative animation.

## Verdict

**Keep the current application's design system and improve its workflow density using the previous application's list-and-action patterns.** After this pass, the current application is my preferred design foundation.

The previous frontend has useful grouped navigation, list filters, table density and prominent actions. Its broader set of screens should not be confused with better interaction design. The current application has a more consistent token/component system, restrained colour use, tested contrast, visible keyboard focus and coherent mobile navigation. Its main weaknesses were excessive vertical space, a creation form dominating membership lookup and an operations board that made plate-based work less direct.

This is design judgement supported by source inspection and browser checks. It is not a timed usability study. The previous app was inspected from `parking-project/parking-redesign-fe`; its authenticated runtime was not launched for a side-by-side user trial. The updated current app was built, viewed in Chromium and checked at phone/tablet/desktop widths.

## Comparison and decisions

| Criterion | Previous application | Current application before this pass | Decision and implemented result |
|---|---|---|---|
| Visual consistency | Shared components coexist with page-level colour, spacing and shadow values | Semantic palette, shared type/control/status rules | Retain the current navy/slate system, white work areas, fine borders and IBM Plex/Carbon families |
| Operational scanning | Searchable lists make vehicle records easy to scan | Bay tiles are useful for spaces, but plate work and open-area visits are less unified | Add a Parked vehicles view combining all parked bay/pool visits, with whitespace-tolerant plate/space search and visit-status filtering |
| First-viewport hierarchy | Summary sections and report actions are explicit | Open-area content could precede the main metrics; large cards used too much phone space | Put occupancy and shift context first; use compact phone metrics, then an explicit spaces/vehicles view choice |
| Mobile list behavior | Desktop table patterns depend on horizontal space | Responsive shell is established, but no unified vehicle directory | Vehicle rows become compact mobile cards; desktop columns align with a fixed action track; avoid document overflow |
| Next task | List actions and page actions are visible | Bay/detail selection is established, but checkout status is mostly a badge | Keep server-authoritative actions and add Admitted → Checkout → Payment → Exit progress, with the next step marked |
| Membership lookup | Separate list/create/edit routes keep the list focused | Expanded sale/customer forms appear before existing passes | Default to lookup and existing passes; a prominent Sell a member pass action reveals the retained form |
| Drafts and keyboard focus | Not fully assessed in the legacy runtime | Existing refresh/retry protections are valuable | Keep view/form subtrees mounted; hiding creation does not erase it; every View activation focuses details, and closing returns focus |
| Accessibility and feedback | Source inspection only; no full legacy accessibility claim | Token contrast, labels, focus, state words/icons and reduced motion exist | Preserve these; add explicit select labels and browser assertions for new lookup/disclosure behavior |

## Changes delivered

- `OperationsPage`: metrics and shift context before work areas; spaces/vehicles switch retains each mounted workflow and its local state. Open-area and bay-board panels keep their gutter.
- `ParkedVehicles`: unified scoped visit list, plate/space search, payment-state filter, empty/reset state, desktop/mobile row layout and the existing authorized VisitPanel for actions. Filtering does not erase selected details.
- `VisitStage`/`VisitProgress`: shared status vocabulary and a four-step view of the server's current visit stage. Progress is explanatory; it never enables an action or changes payment/exit guards.
- `MembersPage`: creation is collapsed initially, with a visible primary action. Sale state and its request identity survive hiding/reopening. Existing search, pagination, renewal and collection behavior remains.
- Shared CSS: compact operational metrics on phones, aligned list columns, visible selected rows and modest spacing. Existing status colours, font families, 44px actions and reduced-motion rules remain.

No decorative charts, invented metrics, new UI library or backend feature was added for this pass. Unrelated unfinished offline server code remains separate.

## Product-name recommendation

**Parkframe** — **Parking, clearly managed.**

This is an international working-name recommendation: direct enough to identify the category, broad enough for spaces, vehicles, payments and multi-site operations, and compatible with a restrained professional wordmark. A simple P/frame symbol would work at favicon and receipt size; a detailed car illustration would not be necessary.

The current application still displays Bayline; this pass does not apply a repository-wide rebrand. Preliminary web searches informed the recommendation, but domain, company-name and trademark availability have not been established. Bayline also appears in an existing [parking app listing](https://play.google.com/store/apps/details?id=com.ajaib.onedebit), so retaining it as a final distinctive market name deserves further consideration.

## Evidence and limits

- 128 frontend tests passed, including unified lookup/filtering, retained visit selection, repeated-selection focus and membership disclosure/draft regressions. Existing token tests cover 25 contrast cases.
- Frontend Biome, application/browser TypeScript and production build passed.
- 14 Chromium PWA/layout/workflow tests passed, covering the new workflows at 390/768/1440px and existing screens at 360/768/1440px, keyboard navigation, print-media appearance, membership collection and service-worker cache isolation.
- A desktop column-alignment assertion failed before the fixed action track and passed after it. Browser screenshots cover operations/vehicle details and membership lookup. Local evidence is ignored under `artifacts/tmp/ui-workflow/`.
- The rebuilt local gateway also passed fresh owner login, real visit lookup/progress rendering, hidden/reopened sale-draft preservation and 390px fit. No business-write requests were sent; the local API/worker used their previously completed images.
- React, TypeScript and general reviews checked focus, state retention, semantics and layout; confirmed focus/spacing/alignment issues were corrected.

Browser scenarios use synthetic API fixtures except the service-worker checks. They do not certify backend financial integration, physical devices, full screen-reader usability or performance under real operator load. Backend tests/contracts were not regenerated or rerun for this frontend pass because unrelated offline server work is incomplete. The last completed backend milestone's evidence remains in `OPEN_LOT_CAPACITY.md`.

Next design work should follow real operator observation: measure plate-to-visit lookup, admission and checkout tasks; then refine whichever action requires excess scrolling or unclear choices. Build missing administration and reporting workflows using the same patterns instead of adding another visual theme.
