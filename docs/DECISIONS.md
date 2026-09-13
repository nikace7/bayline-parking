# Decisions

Product-level revisions live in `docs/BLUEPRINT.md` section 0. This log records implementation choices, why they were made, and what would reopen them.

| # | Date | Decision | Why | Revisit when |
|---|---|---|---|---|
| D1 | 2026-09-13 | Build in the `parking_personal` workspace rather than `portfolio-recreations/parking-platform` | The user opened this workspace for the project; the blueprint allows the user's actual workspace | The portfolio is reorganised |
| D2 | 2026-09-13 | Vite + React SPA instead of Next.js (user decision) | Private session-auth app, no SEO; no Node runtime; clean offline/PWA base | Public pages need server rendering for SEO |
| D3 | 2026-09-13 | Target both PC browsers and Android POS (user decision) | Printer path chosen at runtime: `window.print` or a Capacitor plugin | A single device class is chosen |
| D4 | 2026-09-13 | Offline scope is cash walk-in facts only (user decision) | Facts replay safely; claims on capacity or provider money do not | Operators need offline reservations or passes |
| D5 | 2026-09-13 | TypeScript 5.9, not 7.0 | `openapi-typescript` 7.13 declares a `typescript ^5.x` peer | `openapi-typescript` supports TypeScript 7 |
| D6 | 2026-09-13 | Python pinned to 3.12 with `backend/.python-version` | uv defaulted to 3.14; the blueprint and Docker image use 3.12 | Moving the Django LTS line |
| D7 | 2026-09-13 | React Router 8 in data-router library mode | Router was unspecified after dropping Next.js; library mode keeps the build fully static | Typed search params or file routes become worth a new dependency |
| D8 | 2026-09-13 | Biome for TypeScript/CSS/JSON, Ruff for Python | One binary each for lint and format | A needed rule exists only in ESLint |
| D9 | 2026-09-13 | camelCase wire format via `djangorestframework-camel-case` plus the drf-spectacular camelize hook; `config.api.envelope_schema_hook` mirrors the `{data}` envelope in OpenAPI | Generated TypeScript types must describe real responses | The envelope or casing changes |
| D10 | 2026-09-13 | Ports 4330 (gateway/Vite), 8330 (native Django), 54330 (Postgres); images `postgres:17.11-alpine`, `caddy:2.11.4-alpine` | Host ports 5432 and 8000 were already in use on the original machine | Port conflicts elsewhere |
| D11 | 2026-09-13 | Tests read only `TEST_DATABASE_URL`, pin `TEST.NAME`, and refuse a database matching `DATABASE_URL` | Blueprint: never point tests at an inherited database | — |
| D12 | 2026-09-13 | Signed-out API calls return `403 NOT_AUTHENTICATED`; wrong credentials return `401 INVALID_CREDENTIALS` | DRF session auth sends no `WWW-Authenticate`, so it coerces 401 to 403; the SPA branches on `code` | Token authentication is added |
| D13 | 2026-09-13 | Login and registration enforce CSRF explicitly (`CsrfProtectedMixin`) | DRF skips CSRF for anonymous requests, which would allow login CSRF | — |
| D14 | 2026-09-13 | `config.api` never imports `rest_framework.views` at module level | APIView's class body loads renderer settings that point back into `config.api` (circular import found during setup) | — |
| D15 | 2026-09-13 | Staff directory UI at `/settings/staff`; `/members` stays reserved for parking passes | Removes the staff-membership vs member-pass naming clash in routes | — |
| D16 | 2026-09-13 | API container runs migrations on start | This edition runs one API replica | More than one replica: move to a release job |
| D17 | 2026-09-13 | Fonts self-hosted from `@fontsource` packages (SIL OFL, licences ship in the packages) | Blueprint: self-host fonts, no external font CDN | — |
| D18 | 2026-09-13 | Money displays with `en-IN` lakh grouping and a U+2212 minus sign | Nepali grouping convention; screen readers announce "minus" | Locale requirements change |
| D19 | 2026-09-13 | DRF `NUM_PROXIES` comes from `TRUSTED_PROXY_COUNT`: 0 natively, 1 in Compose behind Caddy | Unset, DRF trusted client-sent `X-Forwarded-For`, so each forged IP got a fresh 10/minute login budget (independent review finding, regression test added). Using 0 behind Caddy would pool every user into one bucket and let one attacker lock out all logins | Another proxy or load balancer sits in front of Caddy |
