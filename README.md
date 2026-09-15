# Bayline — Parking Operations

Independent portfolio edition of a multi-tenant parking operations platform. North Gate Parking and Riverside Parking are fictional organisations; all data is synthetic.

- Specification: [docs/BLUEPRINT.md](docs/BLUEPRINT.md) (v1.1; the original v1.0 is kept at `02-parking-platform.md`)
- Build status and verified results: [docs/PROGRESS.md](docs/PROGRESS.md)
- Implementation decisions: [docs/DECISIONS.md](docs/DECISIONS.md)

## Stack

Django 5.2 LTS + DRF on PostgreSQL 17 · Vite + React 19 single-page app · Caddy same-origin gateway · background work as PostgreSQL rows (no Redis or Celery). Report exports use ReportLab (PDF, with HarfBuzz shaping for Devanagari) and openpyxl (XLSX).

## Requirements

Node 24+, pnpm 10, Python 3.12 with [uv](https://docs.astral.sh/uv/), Docker with Compose.

## First run

```bash
pnpm setup:local
```

Creates `.env` with generated secrets (or adds any missing `DEMO_PASSWORD` to an existing one), installs dependencies, starts PostgreSQL on `127.0.0.1:54330` and applies migrations.

```bash
pnpm db:seed
```

Adds synthetic demo data through the domain services: North Gate Parking (two locations) and Riverside Parking (one), each location with 12 walk-in and 6 reservable bays and car/motorbike tariffs. Accounts `owner@northgate.test`, `manager@`, `operator@`, `cashier@`, `auditor@northgate.test` and `owner@riverside.test` all sign in with `DEMO_PASSWORD` from `.env`. The operator and cashier are assigned to both North Gate locations. North Gate Central gets a cash day ending shortly before the seed ran: a shift with NPR 1,000 float and NPR 300 taken, closed with NPR 1,280 counted (NPR 20 short), then an open shift with visits ready to exit, awaiting cash and parked. Rerunning changes nothing.

```bash
pnpm dev
```

Vite on http://localhost:4330 (proxying `/api` to Django on `127.0.0.1:8330`). Register an organisation at `/register`; the design tokens and components are at `/gallery`. Signed in as a seeded operator or cashier, `/operations` runs the gate: admit a vehicle to a bay, quote and confirm checkout, open a cash shift and take cash, then record the exit. Each payment links to its receipt, which prints on 80 or 58 mm paper. `/shifts` closes the cashier's shift against the counted cash and lists closed shifts with their variance; `/reports` shows collections and the vehicle log for owners, managers and auditors, with PDF and XLSX downloads.

To run the full containerised stack instead (Caddy on the same port, so stop `pnpm dev` first):

```bash
pnpm demo:up
```

## Checks

| Command | What it runs |
|---|---|
| `pnpm lint` | Biome on the web app and scripts; Ruff check and format on the backend |
| `pnpm typecheck` | TypeScript against the generated API types |
| `pnpm test:unit` | Vitest, plus backend tests that need no database |
| `pnpm test:integration` | pytest against a dedicated PostgreSQL test database (`TEST_DATABASE_URL`) |
| `pnpm build` | Production SPA build |
| `pnpm contracts:generate` | OpenAPI from Django → `contracts/openapi.yaml` → `apps/web/generated/schema.d.ts` |
| `pnpm contracts:check` | Regenerates contracts and fails if committed ones differ |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `pnpm setup:local` and then lint, typecheck, unit and integration tests, build and `contracts:check` on every pull request and every push to `main`.

## Layout

```text
apps/web/            Vite React SPA (src/, generated/ API types, styles.css tokens and print rules)
backend/config/      Settings, URL routing, API envelope/errors, clock, health, seed_demo command
backend/modules/     Django apps: `accounts` (M0), `sites` (M1), `parking` and `billing` (M2–M3), `reports` (M3, with embedded OFL fonts)
contracts/           Generated OpenAPI schema
fixtures/            Shared test vectors run by both pytest and Vitest (tariff calculator)
infra/               Compose, Caddyfile, gateway image
scripts/             Local setup
docs/                Blueprint, progress, decisions
```
