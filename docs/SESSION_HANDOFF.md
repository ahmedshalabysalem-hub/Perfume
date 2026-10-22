# Session handoff

_Session 2 — 2026-10-22 — branch `claude/project-thread-qunsge` (from `ccr-04855f0a-4t6vb0`)_

## Completed in this session

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

## Files created or changed

`prisma/schema/inventory.prisma` (new), `prisma/schema/{catalog,organization}.prisma` (relations),
`prisma/migrations/20261022071737_inventory_stock_ledger/`, `src/lib/schemas/inventory.ts`,
`src/server/modules/inventory/*`, `src/app/[locale]/admin/inventory/**`, `src/server/admin-nav.ts`,
`src/components/admin/{nav-types.ts,admin-shell.tsx}`, `src/server/rbac/permissions.ts`,
`messages/{en,ar}.json`, `tests/integration/{inventory.test.ts,fixtures.ts}`,
`tests/unit/inventory-schemas.test.ts`, `tests/e2e/{inventory.spec.ts,global-setup.ts}`, docs
(DECISIONS, DATABASE, RBAC, API_SPEC, BUSINESS_RULES, TEST_PLAN, TASK_BOARD, PROJECT_STATUS, this file).

## Checks actually run

- Fresh container setup: `npm ci`, local PostgreSQL roles/databases per README, `db:deploy`,
  `db:sync-rbac`, `db:seed`.
- `npm run lint`, `npm run typecheck`, `npx prettier --check .` — clean.
- `npm test` — 138 passed (53 unit, 85 integration; `inventory.test.ts` 27).
- `npm run build` — passed. `npx playwright test` against that build — 18/18 passed.
- CI has not run on this branch yet.

## Unresolved

- OPS-001 still needs `docker compose up -d` on a machine with Docker.
- ADR-018 (costing) still needs an accountant's confirmation before FIN-001.
- Test gaps unchanged from session 1 (`docs/TEST_PLAN.md` §Known gaps).
- Test fixtures and the e2e reset now also set `app.stock_ledger_purge = 'on'` to truncate the ledger;
  any new reset script must do the same.

## Next exact task

1. Merge the INV-001 PR after CI passes; move INV-001 to Done on the board with the CI run.
2. **APR-001 — Approval workflow framework**: write its full spec in `docs/TASK_BOARD.md` (backlog
   outline exists), then implement. It unblocks INV-003 and PUR-002.

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
