# Session handoff

_Session 2 — 2026-10-22 — parallel threads, each on its own branch from `ccr-04855f0a-4t6vb0`:
APR-001 on `claude/project-thread-wabex7` (PR #2), INV-001 on `claude/project-thread-qunsge` (PR #1)._

ADR numbering after reconciliation: ADR-019 approvals (APR-001), ADR-020 stock ledger (INV-001).
Recommended merge order: PR #2, then PR #1 (the INV-001 branch merges the base after #2 lands).

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
- E2E not run (no routes or UI changed). Branch not pushed yet: waiting for Ahmed's go-ahead, so CI has
  not run on it.

### Unresolved

- Confirm CI green on PR #2.
- No approval screens: INV-003 / PUR-002 add their own approve/reject actions over the service; a
  generic inbox would need per-subject effect handlers (ADR-019 consequences).
- Carried over: OPS-001 Docker run; TEST_PLAN known gaps; ADR-018 accountant confirmation.

## INV-001 — stock ledger and balances

### Completed in this session

- **INV-001 stock ledger and balances** (status Review until the PR is merged with CI green):
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
- CI has not run on this branch yet.

### Unresolved

- OPS-001 still needs `docker compose up -d` on a machine with Docker.
- ADR-018 (costing) still needs an accountant's confirmation before FIN-001.
- Test gaps unchanged from session 1 (`docs/TEST_PLAN.md` §Known gaps).
- Test fixtures and the e2e reset now also set `app.stock_ledger_purge = 'on'` to truncate the ledger;
  any new reset script must do the same.

## Next exact task

1. Merge PR #2 (APR-001), then PR #1 (INV-001), each with CI green; move both to Done with the CI runs.
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
- Next.js maintains `AGENTS.md`; keep it committed.
- `docs/reference/ORIGINAL_BRIEF.md` is excluded from Prettier on purpose (verbatim copy).
