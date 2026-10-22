# Session handoff

_Session 4 — 2026-10-22 — branch `claude/project-thread-1a8ij7` from base `ccr-04855f0a-4t6vb0` at
`812fffc` (PR #4 merged)._

## Parallel thread — session 4: OPS-001, ADR-018 request, test gaps (branch `claude/project-thread-osb7xg`, base `812fffc`)

- **OPS-001 Done.** Docker and Compose are installed in this sandbox, but the daemon is not running at
  start: run `dockerd` in the background first. Then `docker compose up -d --wait`, README quick start,
  full Vitest and Playwright suites on the Docker database — all passed (evidence in
  `docs/PROJECT_STATUS.md`). New CI job "Docker Compose database" repeats the start, init and migrations.
- **ADR-018:** decision request DR-009 written (`docs/DECISION_REQUESTS.md`); Ahmed has to send it to the
  accountant. Still Proposed; blocks FIN-001/FIN-003/RPT-001, not INV-002/INV-003.
- **QA-002 Done:** gap assessment in `docs/TEST_PLAN.md`; new `tests/integration/database-constraints.test.ts`
  (12). Next for this line of work: QA-003 (High gaps G1–G4); G3 and G4 belong with INV-002.
- Files: `.github/workflows/ci.yml`, `docker-compose.yml`, `README.md`, `CLAUDE.md`, `docs/{DECISION_REQUESTS,
DECISIONS,TEST_PLAN,TASK_BOARD,PROJECT_STATUS,IMPLEMENTATION_PLAN,SESSION_HANDOFF}.md`, the new test.
  No application code, schema or migration changed.

## Last completed work

- **Session 4 — INV-002 design review (documentation only).** Verified the ledger, schema and catalogue
  flags on the base; drafted ADR-023 (**Proposed**): batches as a ledger dimension, inspection gating
  sellable stock, expiry as a query rule, legacy carry-over through compensating movements. Created
  `docs/DECISION_REQUESTS.md` (DR-001…DR-008) and added it to the `CLAUDE.md` documentation map.
  Ahmed answered DR-001…DR-008 the same day (recorded as Decided); ADR-023 and the INV-002 board
  entry (acceptance criteria 9–14) were revised to match. Implementation waits for his approval of
  the final design.
- **Session 3 — workflow audit (ADR-022, PR #4).** Roles, effort and review policy in `CLAUDE.md`; INV-002
  specified; status files reconciled.
- **Session 2 — merged PRs #2 → #1 → #3:** APR-001 (ADR-019), INV-001 (ADR-020), PUR-001 (ADR-021).

## Files changed in session 4

`CLAUDE.md` (documentation map), `docs/DECISIONS.md` (ADR-023 Proposed), `docs/DECISION_REQUESTS.md`
(new), `docs/TASK_BOARD.md`, `docs/PROJECT_STATUS.md`, this file. No application code, schema or
migration changed.

## Checks actually run (session 4)

- `npx prettier --check` on the changed Markdown files. Lint, typecheck and tests not run: no code
  changed (base CI after PR #4 is green per the coordinator).

## Unresolved

- OPS-001 Docker run; ADR-018 accountant confirmation; PUR-002 cost-precision ADR; foreign purchasing
  currencies; advisor review of the compliance register; test gaps in `docs/TEST_PLAN.md`.
- `prisma/schema/inventory.prisma` comment on `unitCost` cites "ADR-018/019"; it should read ADR-018/020
  (fix with the next inventory schema change, INV-002). The migration comment stays as is (immutable).
- `updateVariant` lets catalogue editors flip `trackInventory/trackBatches/trackExpiry` on a variant
  that already holds stock; INV-002 closes this (ADR-023).

## Next exact task

**INV-002 implementation, after Ahmed approves the DR-010 amendment of ADR-023** (LEGACY batches
start PENDING_INSPECTION and become sellable only through a recorded verification). First step: migration `…_inventory_batches` per ADR-023 (check `prisma migrate diff`
for drift on the `NULLS NOT DISTINCT` unique index; fallback two partial unique indexes), then the
ledger changes. Commit order and test plan: INV-002 board entry and ADR-023. Then INV-003 or PUR-002.

## Context that would otherwise be lost

- Callers change stock only via `postStockMovements(tx, ctx, posting)` inside their own transaction
  (READ COMMITTED); authorisation is the caller's job. Use stable idempotency keys (e.g.
  `order:<id>:ship`); opening balances use `opening-balance:<variant>:<warehouse>:<status>`.
- Test fixtures and the e2e reset set `app.stock_ledger_purge = 'on'` to truncate the ledger; any new
  reset script must do the same.
- Approval effects are applied by the consuming module inside the same transaction (ADR-019); there is
  no generic approvals inbox.
- A CHECK written as `col = 'X' AND n BETWEEN …` passes when `n` is NULL; write `IS NOT NULL`
  explicitly.
- After a container restart run `service postgresql start`. Databases: `perfume_dev`, `perfume_test`,
  `perfume_e2e` (role `perfume` with CREATEDB; password in the local, uncommitted `.env`).
- Playwright here: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`; reuse an existing build
  with `E2E_SERVER_COMMAND="npm run start -- --port 3100"`.
- Next.js maintains `AGENTS.md`; keep it committed. `docs/reference/ORIGINAL_BRIEF.md` is excluded from
  Prettier on purpose (verbatim copy).
