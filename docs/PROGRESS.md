# Progress

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
- `pnpm contracts:check` compares against Git, so it passes trivially until the generated files are committed.
- No Playwright/axe suite, 360px/768px/200% zoom captures or screenshots yet (M8).
- Biome does not lint `apps/web/styles.css`: its CSS parser rejects Tailwind `@theme` without a `biome.json` change, which the user's config-protection hook blocks.
- Vitest takes about 40 seconds, mostly jsdom start-up; the repository sits in a OneDrive-synced folder, so `node_modules` and `.venv` are synced too.

## Next: M1 Sites and tariff core

- `sites` app: Location, Bay (`WALK_IN`/`RESERVABLE`), immutable TariffVersion with `86400 % block_seconds = 0`, `btree_gist` extension.
- Tariff calculator in Python plus `fixtures/tariff-vectors.json`, shared with a TypeScript port tested in Vitest (P04, P05, P25).
- `pnpm db:seed` through domain services for both organisations.
- Bay-lock groundwork for concurrent entry (P02).
