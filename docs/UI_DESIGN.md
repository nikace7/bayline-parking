# UI and UX refresh — 30 October 2026

## Direction and reference

The reference was the sibling `parking-project/parking-redesign-fe` implementation, particularly `components/sidebar/Sidebar.tsx`, the grouped navigation, dashboard summary sections, `app/globals.css` and the public login layout. Its useful ideas are a dark navigation rail, clear grouping, compact operational metrics and separate work areas. The sibling project was read only; its branding, dependencies and backend were not copied.

Bayline adapts those ideas into a quiet navy/slate workspace: white surfaces, fine borders, restrained corner radii, clear type and visible focus. No neon, gradients, glow, blur or decorative animation. IBM Plex and the existing local Carbon glyphs remain. Green/blue/amber/red communicate operational status rather than decoration.

## What changed

| Area | Design and interaction |
|---|---|
| Staff shell | Navy sidebar grouped into Workspace/Management; organisation and account context in a white header; skip link. Mobile keeps four common destinations plus More, making Reports, Sites, Staff and gallery reachable. More focuses its first link, supports Escape and returns focus into content after selection. |
| Authentication | Split desktop layout with a small schematic parking illustration; focused single-column forms on mobile. Show/Hide password preserves autocomplete, value and error context without submitting. Registration copy explains the relevant account type. |
| Operations | Four real occupancy metrics, a framed parking board, bay/plate search, state filter, clear-filter empty state and a labelled legend. Filters only change the displayed bays; totals and authoritative server validation are unchanged. A selected-bay link helps navigate the stacked mobile layout. |
| Memberships | Consistent heading/location selector, collapsible sale section that preserves mounted form state, wider desktop form grid, search toolbar, pass status badges and clearer payment/coverage sections. All role/payment/idempotency guards remain. |
| Reservations and cash shifts | Consistent headings, descriptions, controls and table treatments; the existing conflict, payment, close-shift and confirmation flows are retained. |
| Reports | Grouped filter/export toolbar, collections/vehicle activity metric cards and keyboard-scrollable tables. Values come from the existing report response. |
| Sites and Staff | Shared scrollable table treatment with consistent typography and spacing. Wide tables scroll within their own frame. |
| Customer booking | A calmer customer header/footer, labelled reservation steps, clearer location cards and an explicit location-selection empty state. Reservation list/details share the same headings and controls. |
| Receipts | Paper-size controls remain; a distinct preview area is excluded from the printed decoration. Both 80 mm and 58 mm print-media checks verify that the frame/background disappear. |
| Offline/status/gallery | Updated shared palette, spacing and state surfaces; no change to API caching or disconnected-write policy. Gallery swatches and PWA theme metadata match the new palette. |

## Maintenance rules

- Colours live in `apps/web/styles.css`; use semantic tokens instead of literal colours in screen code. Contrast tests include sidebar foreground/active states as well as ordinary controls/statuses.
- Use `PageHeader`, `Metric`, `TableScroll`/`DataTable`, `TextField`, `Button` and `StatusBadge` for recurring patterns. Screen-specific CSS stays under named component classes; no linter configuration changes were needed.
- Keep visible labels, 44px controls, focus rings, status words/icons and reduced-motion support. All financial values remain integer paisa and times use the location's zone.
- The current breakpoints are mobile navigation below 768px, full sidebar from 768px, split authentication from 1024px and a side-by-side operations detail panel from 1280px. Intermediate widths stack work areas instead of squeezing forms.
- Static offline access does not mean offline parking/payment support. Updates still ask before reloading a working form.

Format the Tailwind stylesheet with `pnpm exec biome format --write --css-parse-tailwind-directives=true --css-formatter-indent-style=space apps/web/styles.css`; the canonical lint command still excludes it because the repository's parser configuration does not enable Tailwind directives.

## Evidence and limits

- **108 frontend tests** and **40 backend unit tests** passed; canonical lint, TypeScript and production build passed. Backend/schema unchanged; database integration was not repeated for this UI-only work.
- **11 Chromium tests passed**, including the existing member sale/cash, large-site pagination and real service-worker scenarios. New checks cover 11 staff/customer screens at 360/768/1440px, three authentication screens at phone/desktop sizes, mobile keyboard navigation, search/filter totals, password visibility and both receipt widths under print media.
- Responsive checks assert no document horizontal overflow and no uncaught page errors; screenshot inspection covered desktop/mobile operations, authentication and customer/member layouts. Wide tables intentionally scroll inside their frames.
- Staff/customer data in the new browser fixtures is synthetic and mocked. These checks do not certify real device installation, screen-reader usability, physical printers or a live end-to-end payment journey.

Run `pnpm build`, then `pnpm --filter web test:pwa` to reproduce the browser checks. Screenshots are written under the ignored `apps/web/test-results/` directory; selected local previews are saved in ignored `artifacts/tmp/ui/`. For the actual local system, rebuild the gateway with `docker compose --env-file .env -f infra/compose.yaml up -d --build --no-deps gateway` and open `http://localhost:4330/login`. An existing installed PWA may show an update prompt; finish active work before choosing Update app.

## Open-lot continuation — 1 November 2026

`OpenLotBoard` adds area occupancy cards and plate admission to Operations; `ZoneSetup` adds capacity/state forms in Sites using the existing panels, semantic colours and controls. Checkout reuses VisitPanel. Polling preserves drafts/focus and requires explicit reload after remote capacity edits. Real mobile/desktop screenshots and six live journeys supplement the earlier mocked-layout evidence; see `OPEN_LOT_CAPACITY.md`.

## Workflow judgement and polish — 4 November 2026

Read `UI_UX_COMPARISON.md` for the general-market comparison with the previous frontend. The current design system is retained; Operations adds a unified parked-vehicle directory and puts metrics first, mobile rows stay compact, checkout shows progress, and membership lookup precedes a retained, explicitly opened creation form. Naming recommendation: Parkframe; the app branding remains Bayline pending a separate rebrand.

## Reservation directory — 5 November 2026

Reservations follows the same lookup-first direction: date/time-zone context, plate/name/reference/bay search, status and conflict filters, then a compact directory. Below 1280px the four desktop columns become labelled rows; action buttons remain at least 44px high. Labels and status words carry meaning without relying on colour. Move/cancel panels sit before the results instead of below a long table and receive focus on each activation.

Keep drafts mounted while filtering and during mutation/refetch completion. A terminal reservation disables repeat submission without prematurely removing the mutation observer. Failed refreshes hide the directory until a successful response while preserving its mounted draft; never show cached customer data after an authorization failure. Filter reset and completed actions focus search; closing an unchanged action returns to its original button when it still exists. Scope changes clear the action.

Evidence: 137 frontend tests, 17 Chromium checks, lint, TypeScript and build passed. New browser cases cover 390/768/1440px, long names, column alignment, repeated action focus, filtered drafts and date reset. Local gateway sign-in/lookup/mobile/sign-out passed without business writes. Detailed limits and comparison are in `UI_UX_COMPARISON.md`.
