# Perfume Commerce — Saudi Arabia & Egypt

Full-stack perfume e-commerce and retail management system for a company selling its own stock in
Saudi Arabia (SAR) and Egypt (EGP), in Arabic (right-to-left, default) and English. It is not a
marketplace.

**Current state (Phase 1):** staff authentication, scoped role-based access control, audit log,
organisation setup (countries, legal entities, stores, warehouses), a complete product catalogue
(brands, categories, fragrance notes, families and concentrations, products, variants with SKU and
verified barcodes, per-market prices, images, regulatory references, barcode labels) and a read-only
storefront per market. Inventory, orders, payments, POS, accounting and e-invoicing are planned —
see [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) and [`docs/TASK_BOARD.md`](docs/TASK_BOARD.md).
Nothing here is integrated with or certified by ZATCA, ETA, SFDA or EDA.

## Stack

Next.js 16.4 (App Router) · React 19 · TypeScript 5.9 (strict) · Tailwind CSS 4 with shadcn-style
components · React Hook Form + Zod 4 · PostgreSQL 16 + Prisma 7 (`@prisma/adapter-pg`) · Better Auth
1.7 · next-intl 4 · Vitest 5 · Playwright 1.64. Reasons for each choice: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Prerequisites

- Node.js 22 (see `.nvmrc`) and npm 10
- PostgreSQL 16 — via Docker (`docker-compose.yml`) or a local installation
- A role that can create databases if you run the end-to-end tests (they create `perfume_e2e`)

## Quick start

```bash
# 1. Configuration
cp .env.example .env
# Set BETTER_AUTH_SECRET (required):   openssl rand -base64 32
# Optionally set SEED_ADMIN_PASSWORD (12+ characters) — otherwise the seed prints a generated one.

# 2. Database — choose one
docker compose up -d                       # PostgreSQL 16 with perfume_dev, perfume_test, perfume_e2e
# …or with a local PostgreSQL (adjust to your installation):
#   sudo -u postgres psql -c "CREATE ROLE perfume LOGIN CREATEDB PASSWORD 'perfume_dev_password';"
#   sudo -u postgres createdb -O perfume perfume_dev
#   sudo -u postgres createdb -O perfume perfume_test

# 3. Install, migrate, seed
npm ci                                     # also generates the Prisma client
npm run db:deploy                          # apply migrations
npm run db:seed                            # demo organisation, roles, staff and catalogue

# 4. Run
npm run dev                                # http://localhost:3000 → /ar or /en
```

Staff sign-in: `http://localhost:3000/en/login` (or `/ar/login`).

### Windows: one-click start

After the first-time setup (Node.js 22, and either Docker Desktop or PostgreSQL 16 with the `perfume`
role and `perfume_dev` database), double-click `scripts\windows\start.cmd`. It detects the database
(Docker Desktop or the PostgreSQL Windows service; `PERFUME_DB=docker|native` overrides), creates
`.env` and its `BETTER_AUTH_SECRET` if missing (never printed), runs `npm ci` only when
`package-lock.json` changed, applies pending migrations, seeds on the first run only, starts
`npm run dev` and opens `http://localhost:3000`. `scripts\windows\stop.cmd` stops the server and the
Docker database container (data kept). The CI workflow "Windows start scripts" runs both on Windows
against a native PostgreSQL.

> Both database paths are verified: `docker-compose.yml` was run on 2026-10-22 (OPS-001) and CI starts it
> on every push (job "Docker Compose database"). The init script only runs on an empty data volume.

### Demo accounts (development seed)

All demo accounts share the seed password: `SEED_ADMIN_PASSWORD` from `.env`, or the generated password
the seed prints once. Re-running the seed keeps existing passwords. The seed refuses to run when
`NODE_ENV=production` and contains no real customer data; brands and products are fictional.

| E-mail                         | Role (scope)                    |
| ------------------------------ | ------------------------------- |
| `admin@perfume.local`          | Super Admin (global)            |
| `catalog@perfume.local`        | Catalogue Manager (global)      |
| `manager.sa@perfume.local`     | Business Manager (Saudi Arabia) |
| `cashier.riyadh@perfume.local` | Cashier (Riyadh Boutique store) |

Demo barcodes use GS1 prefix 952, which GS1 reserves for examples — they are not real GTINs.

## Commands

| Command                           | Purpose                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`                     | Development server (Turbopack)                                         |
| `npm run build` / `start`         | Production build / serve it                                            |
| `npm run lint`                    | ESLint, zero warnings allowed                                          |
| `npm run typecheck`               | Route type generation + `tsc --noEmit`                                 |
| `npm run format` / `format:check` | Prettier write / check                                                 |
| `npm test`                        | Unit and integration tests (Vitest)                                    |
| `npm run test:unit`               | Unit tests only (no database)                                          |
| `npm run test:integration`        | Integration tests against `TEST_DATABASE_URL`                          |
| `npm run test:e2e`                | Playwright end-to-end tests (builds and starts the app on port 3100)   |
| `npm run verify`                  | lint + typecheck + tests + build                                       |
| `npm run db:deploy`               | Apply pending migrations (non-destructive)                             |
| `npm run db:migrate`              | Create/apply a migration while changing the schema (development)       |
| `npm run db:seed`                 | Development seed                                                       |
| `npm run db:sync-rbac`            | Sync the code-defined permissions and roles into the database          |
| `npm run orders:expire`           | Cancel online orders unreviewed past `ORDER_REVIEW_HOURS`; schedule it |
| `npm run db:studio`               | Prisma Studio                                                          |
| `npm run db:reset`                | **Drops and recreates the development database**, then seeds           |

After editing `prisma/schema/*.prisma`, run `npx prisma generate` (Prisma 7 no longer does it during
`migrate dev`). CHECK constraints and triggers are written by hand in migration SQL — see
[`docs/DATABASE.md`](docs/DATABASE.md).

## Tests

- **Unit** (`tests/unit`): money, barcodes, Arabic text normalisation, RBAC rules, validation, message
  catalogue parity.
- **Integration** (`tests/integration`): services against a real PostgreSQL database. Set
  `TEST_DATABASE_URL` to a disposable database whose name contains `test`; the suite applies migrations
  with `migrate deploy` and truncates tables between test files.
- **End-to-end** (`tests/e2e`): Playwright against a production build on port 3100 with a disposable
  database (`E2E_DATABASE_URL`, or `<test database>_e2e` derived from `TEST_DATABASE_URL`), which is
  created if missing, emptied and seeded on every run. Install the browser once with
  `npx playwright install chromium`; to reuse an existing Chromium set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
  To skip the rebuild when a build exists: `E2E_SERVER_COMMAND="npm run start -- --port 3100"`.

Details and coverage map: [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).

## Environment variables

See [`.env.example`](.env.example) for every variable with comments. Required: `DATABASE_URL`,
`APP_URL`, `BETTER_AUTH_SECRET`. Never commit `.env`; production secrets belong in the hosting
provider's secret manager. `ORDER_REVIEW_HOURS` (default 48, `0` = never) is how long an online order
may wait for staff review before it is cancelled and its reserved stock released (ADR-025). Set
`TRUSTED_PROXY_HOPS` to exactly the number of reverse proxies in front of the app in production (usually
1; a value that is too high lets a client forge its address again);
the default 0 ignores X-Forwarded-For, which a client can forge, so no client IP is recorded — and in
production checkout is then refused (unless `ALLOW_CHECKOUT_WITHOUT_CLIENT_IP=true`), because unpaid
orders could otherwise hold stock with no per-client limit.

Online ordering needs, per market, exactly one active ONLINE store with a fulfilment warehouse of the
same legal entity (Organisation → Stores → Edit). The seed sets SA-ONLINE → SA-RUH-WH1 and
EG-ONLINE → EG-CAI-WH1 but adds no stock: enter opening balances and release batches before testing.

## Project layout

```
prisma/schema/        Prisma schema split by domain (identity, organization, catalog, governance)
prisma/migrations/    SQL migrations (incl. hand-written CHECK constraints and audit triggers)
prisma/seed.ts        Development seed (refuses production)
messages/             ar.json / en.json translations
src/app/[locale]/     Pages: (store) storefront, (auth) sign-in, admin/ back office
src/app/api/          Auth, file serving, health check
src/server/modules/   Domain services: business rules, authorization, transactions, audit
src/server/rbac/      Permission catalogue, roles, scopes, authorization checks
src/lib/              Shared, client-safe code: schemas, money, barcodes, text normalisation
src/components/       UI primitives, forms, admin and storefront components
tests/                unit, integration, e2e
docs/                 Project documentation (see below)
```

## Documentation

| Document                                                               | Contents                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                               | Working rules for contributors and AI sessions |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md)                     | Current phase, evidence, blockers, next action |
| [`docs/TASK_BOARD.md`](docs/TASK_BOARD.md)                             | Task register                                  |
| [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)           | Phases, milestones, exit criteria              |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)                               | Architectural decision log                     |
| [`docs/PRD.md`](docs/PRD.md)                                           | Product requirements                           |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                         | System design                                  |
| [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md)                     | Business rules                                 |
| [`docs/DATABASE.md`](docs/DATABASE.md), [`docs/ERD.md`](docs/ERD.md)   | Data model and diagram                         |
| [`docs/RBAC.md`](docs/RBAC.md)                                         | Roles, permissions, scopes                     |
| [`docs/API_SPEC.md`](docs/API_SPEC.md)                                 | Server Actions and HTTP endpoints              |
| [`docs/COUNTRY_COMPLIANCE.md`](docs/COUNTRY_COMPLIANCE.md)             | KSA and Egypt regulatory register              |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)                               | Test strategy and coverage                     |
| [`docs/reference/ORIGINAL_BRIEF.md`](docs/reference/ORIGINAL_BRIEF.md) | Original project brief (verbatim)              |

## Security notes

- Passwords are hashed (scrypt); sessions live in the database and are refused for suspended users.
- Authorization is enforced in the service layer for every operation, scoped by country, legal entity,
  store or warehouse; the UI only hides what the server would refuse anyway.
- Every change is written to an append-only audit log in the same transaction.
- Strict Content Security Policy with per-request nonces; security headers set in `src/proxy.ts`.
- No card data is stored; payment integrations are not implemented yet.

## Troubleshooting

- **PostgreSQL connection refused** — start the database (`docker compose up -d` or
  `service postgresql start`) and check `DATABASE_URL`.
- **`Unknown argument …` from Prisma** — the client is stale: `npx prisma generate`.
- **`Invalid environment configuration`** — a required variable is missing; compare with `.env.example`.
- **Integration tests refuse to run** — `TEST_DATABASE_URL` must be set, differ from `DATABASE_URL` and
  name a database containing `test`.
- **`prisma migrate reset` blocked for an AI agent** — intentional Prisma safeguard; reset databases
  yourself, or use `db:deploy` plus the test suites' truncation.
