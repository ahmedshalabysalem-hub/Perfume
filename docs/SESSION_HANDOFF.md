# Session handoff

_Session 2 — 2026-10-22 — parallel threads, each on its own branch from `ccr-04855f0a-4t6vb0`:
APR-001 on `claude/project-thread-wabex7` (PR #2), INV-001 on `claude/project-thread-qunsge` (PR #1),
PUR-001 on `claude/project-thread-6ppqhp` (PR #3)._

ADR numbering after reconciliation: ADR-019 approvals (APR-001), ADR-020 stock ledger (INV-001),
ADR-021 suppliers (PUR-001). Merge order: PR #2 (merged, `185def3`), then PR #1 (merged, `f064554`), then
PR #3 (this branch merged the base after #1).
Combined result checked locally (all three merged in that order): lint, Prettier, typecheck, 181 Vitest
tests, build and 20/20 Playwright tests passed; no schema drift.

## APR-001 — approval workflow framework

### Completed in this session

- **APR-001 Approval workflow framework** (commit `436a974`, ADR-019): migration
  `20261022071950_approvals` (`approval_requests`, `approval_actions`, 10 CHECKs, partial unique index,
  5 triggers), service `src/server/modules/approvals/approvals.service.ts` (submit, decide, cancel, list,
  get, `canDecideApproval`), policies `src/server/modules/approvals/subjects.ts`
  (`inventory.adjustment`, `purchases.order`, `payments.refund`), Zod schemas
  `src/lib/schemas/approvals.ts`, error messages (ar/en).

### Files created or changed

`prisma/schema/{governance,identity,organization}.prisma`, `prisma/migrations/20261022071950_approvals/`,
`src/server/modules/approvals/*`, `src/lib/schemas/approvals.ts`, `messages/{ar,en}.json`,
`tests/unit/approvals.test.ts`, `tests/integration/approvals.test.ts`, `tests/integration/fixtures.ts`
(approval tables in the reset, WAREHOUSE-scoped staff helper exported), docs (DECISIONS, DATABASE, RBAC,
BUSINESS_RULES, TEST_PLAN, PRD, TASK_BOARD, PROJECT_STATUS, this file).

### Checks actually run

- `npm run verify` — passed: lint, typecheck, 131 tests (12 files), build.
- `npx prettier --check .` — clean. `prisma migrate diff --from-config-datasource --to-schema` — no drift.
- E2E not run (no routes or UI changed). CI passed on PR #2 before it was merged.

### Unresolved

- No approval screens: INV-003 / PUR-002 add their own approve/reject actions over the service; a
  generic inbox would need per-subject effect handlers (ADR-019 consequences).
- Carried over: OPS-001 Docker run; TEST_PLAN known gaps; ADR-018 accountant confirmation.

## INV-001 — stock ledger and balances

### Completed in this session

- **INV-001 stock ledger and balances** (merged as `f064554` with CI green):
  - ADR-020 in `docs/DECISIONS.md` — per-status balances, one balance per movement row, integer units,
    unit cost NUMERIC(19,4) in the warehouse country's currency, sorted conditional updates, posting
    keys with advisory locks, append-only ledger, opening-balance rules.
  - Migration `20261022071737_inventory_stock_ledger`: `stock_balances`, `stock_movements`, enums
    `StockStatus` and `StockMovementType`, 11 CHECKs, 3 append-only triggers.
  - `src/server/modules/inventory/ledger.ts` (`postStockMovements`, `lockPostingKey`) and
    `stock.service.ts` (`listStock`, `getVariantStock`, `listStockWarehouses`, `postOpeningBalance`).
  - Pages: `/admin/inventory/stock`, `/admin/inventory/stock/[variantId]`,
    `/admin/inventory/opening-balances/new`; sidebar section "Inventory"; messages in both languages.
  - `inventory.view` and `inventory.adjust.approve` now available (run `npm run db:sync-rbac` after
    deploying; the seed also does it).

### Files created or changed

`prisma/schema/inventory.prisma` (new), `prisma/schema/{catalog,organization}.prisma` (relations),
`prisma/migrations/20261022071737_inventory_stock_ledger/`, `src/lib/schemas/inventory.ts`,
`src/server/modules/inventory/*`, `src/app/[locale]/admin/inventory/**`, `src/server/admin-nav.ts`,
`src/components/admin/{nav-types.ts,admin-shell.tsx}`, `src/server/rbac/permissions.ts`,
`messages/{en,ar}.json`, `tests/integration/{inventory.test.ts,fixtures.ts}`,
`tests/unit/inventory-schemas.test.ts`, `tests/e2e/{inventory.spec.ts,global-setup.ts}`, docs
(DECISIONS, DATABASE, RBAC, API_SPEC, BUSINESS_RULES, TEST_PLAN, TASK_BOARD, PROJECT_STATUS, this file).

### Checks actually run

- Fresh container setup: `npm ci`, local PostgreSQL roles/databases per README, `db:deploy`,
  `db:sync-rbac`, `db:seed`.
- `npm run lint`, `npm run typecheck`, `npx prettier --check .` — clean.
- `npm test` — 138 passed (53 unit, 85 integration; `inventory.test.ts` 27).
- `npm run build` — passed. `npx playwright test` against that build — 18/18 passed.
- After merging the base with APR-001: 161 Vitest tests, build and 18/18 Playwright passed; CI green on
  PR #1 (`3ce46c9`).

### Unresolved

- OPS-001 still needs `docker compose up -d` on a machine with Docker.
- ADR-018 (costing) still needs an accountant's confirmation before FIN-001.
- Test gaps unchanged from session 1 (`docs/TEST_PLAN.md` §Known gaps).
- Test fixtures and the e2e reset now also set `app.stock_ledger_purge = 'on'` to truncate the ledger;
  any new reset script must do the same.

## PUR-001 — suppliers and supplier products

### Completed in this session

- **PUR-001 — Suppliers and supplier products** (commit `603582f`). The board outline was expanded into
  a full specification first (`docs/TASK_BOARD.md`), design recorded as ADR-021.
  - Migration `20261022072014_suppliers`: `suppliers`, `supplier_contacts`, `supplier_products`, six
    CHECKs, unique keys (code; tax number per buying entity; variant and supplier code per supplier).
  - `src/server/modules/procurement/suppliers.service.ts`: list/get/history, create/update/(de)activate,
    contacts (one primary under a row lock, removal allowed, no e-mail/phone in audit), supplier
    products (variant by SKU or barcode, last cost with currency and date, never relabelled).
  - Permission `suppliers.view` added (BM, IM, PS, AC); `suppliers.view`/`suppliers.manage` available.
  - Pages: `/admin/procurement/suppliers` and `/admin/procurement/suppliers/[id]` (profile, contacts,
    products, history); nav section "Procurement"; Arabic and English messages.
  - Seed: `procurement.sa@perfume.local` (Procurement Staff, COUNTRY SA) and fictional supplier
    `DEMO-SUP-01` linked to two variants.

### Files created or changed

`prisma/schema/{procurement,organization,catalog}.prisma`, `prisma/migrations/20261022072014_suppliers/`,
`src/lib/schemas/procurement.ts`, `src/server/modules/procurement/*`,
`src/app/[locale]/admin/procurement/**`, `src/server/admin-nav.ts`, `src/components/admin/*`,
`src/server/rbac/{permissions,roles}.ts`, `prisma/{seed,seed-data}.ts`, `messages/{en,ar}.json`,
`tests/integration/{procurement.test.ts,fixtures.ts}`, `tests/unit/{procurement-schema,rbac}.test.ts`,
`tests/e2e/{procurement.spec.ts,support/env.ts}`, docs (DECISIONS, DATABASE, ERD, RBAC, API_SPEC, BUSINESS_RULES,
TEST_PLAN, PRD, TASK_BOARD, PROJECT_STATUS, this file).

### Checks actually run

- `npm ci`, `npm run db:deploy`, `npm run db:seed` on fresh local databases.
- `npm run lint`, `npx prettier --check .`, `npm run typecheck` — clean.
- `npm test` — 12 files, 128 tests passed (56 unit, 72 integration).
- `npm run build` — passed, no warnings.
- `npx playwright test` against the production build — 18/18 passed.
- `prisma migrate diff` from the database to the schema — empty (no drift).

### Unresolved

- Confirm CI green on PR #3.
- Foreign purchasing currencies (USD, EUR) need currency reference data and a management screen.
- Supplier tax-number rules share the pending confirmation of `docs/COUNTRY_COMPLIANCE.md`.
- Carried over: OPS-001 Docker run, ADR-018 accountant confirmation, test gaps in `docs/TEST_PLAN.md`.

## Next exact task

1. Merge PR #3 (PUR-001) with CI green (PR #2 and PR #1 are merged).
2. **INV-003 — adjustments, counts and transfers** (consumes the ledger and the approval service) or
   **INV-002 — batches**; expand the chosen outline into a full spec first.

## Context that would otherwise be lost

- Callers change stock only via `postStockMovements(tx, ctx, posting)` inside their own transaction
  (READ COMMITTED, the default); authorisation is the caller's job. Choose stable idempotency keys
  (e.g. `order:<id>:ship`).
- Opening balances use the key `opening-balance:<variant>:<warehouse>:<status>`.
- After a container restart run `service postgresql start`. Databases: `perfume_dev`, `perfume_test`,
  `perfume_e2e` (role `perfume` with CREATEDB; password in the local, uncommitted `.env`).
- Playwright here: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`; reuse an existing build
  with `E2E_SERVER_COMMAND="npm run start -- --port 3100"`.
- A CHECK written as `col = 'X' AND n BETWEEN …` passes when `n` is NULL; write `IS NOT NULL`
  explicitly (caught by a PUR-001 test).
- Next.js maintains `AGENTS.md`; keep it committed.
- `docs/reference/ORIGINAL_BRIEF.md` is excluded from Prettier on purpose (verbatim copy).
