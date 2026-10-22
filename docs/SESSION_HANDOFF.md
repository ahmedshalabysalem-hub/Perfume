# Session handoff

_Session 3 — 2026-10-22 — branch `claude/project-thread-jyt23p` from base `ccr-04855f0a-4t6vb0` at
`e792497`._

## Parallel thread — session 4: OPS-001, ADR-018 request, test gaps (branch `claude/project-thread-osb7xg`, base `812fffc`)

- **OPS-001 Done.** Docker and Compose are installed in this sandbox, but the daemon is not running at
  start: run `dockerd` in the background first. Then `docker compose up -d --wait`, README quick start,
  full Vitest and Playwright suites on the Docker database — all passed (evidence in
  `docs/PROJECT_STATUS.md`). New CI job "Docker Compose database" repeats the start, init and migrations.
- **ADR-018 / ADR-024:** Ahmed delegated the accounting choices on 2026-10-22. ADR-018 (moving weighted
  average per legal entity), ADR-024 (costs stored at 4 decimals, half-up only for display and journal
  lines, rounding account) and the DR-009 development defaults are **Dev only**: build and test against
  them; production waits for written accountant confirmation (go-live gate in REL-001). PUR-002 no
  longer needs its own precision ADR.
- **QA-002 Done:** gap assessment in `docs/TEST_PLAN.md`; new `tests/integration/database-constraints.test.ts`
  (12). Next for this line of work: QA-003 (High gaps G1–G4); G3 and G4 belong with INV-002.
- Files: `.github/workflows/ci.yml`, `docker-compose.yml`, `README.md`, `CLAUDE.md`, `docs/{DECISION_REQUESTS,
DECISIONS,TEST_PLAN,TASK_BOARD,PROJECT_STATUS,IMPLEMENTATION_PLAN,SESSION_HANDOFF}.md`, the new test.
  No application code, schema or migration changed.

## Last completed work

- **Session 3 — workflow audit (documentation only, ADR-022).** Checked the governance files against the
  merged code. `CLAUDE.md` now documents the Director / Implementer / Reviewer responsibilities (one
  session by default), risk-based review, the effort policy and its runtime limit (the person sets
  model and effort in the app; nothing switches automatically). INV-002 expanded into a full Ready
  spec; INV-003 now depends on INV-002. Stale claims fixed in the plan (Phase 1/2 status, DOC-002/003),
  PRD (Module 2), business rules (inventory flags), test plan (concurrency gap), status and this file.
- **Session 2 — merged PRs #2 → #1 → #3:** APR-001 approvals (ADR-019, `src/server/modules/approvals`),
  INV-001 stock ledger (ADR-020, `src/server/modules/inventory`, pages `/admin/inventory/**`), PUR-001
  suppliers (ADR-021, `src/server/modules/procurement`, pages `/admin/procurement/suppliers/**`).
  Details per task: their board entries and `git log`.

## Files changed in session 3

`CLAUDE.md`, `docs/DECISIONS.md` (ADR-022), `docs/TASK_BOARD.md`, `docs/TASK_TEMPLATE.md`,
`docs/IMPLEMENTATION_PLAN.md`, `docs/PROJECT_STATUS.md`, `docs/PRD.md`, `docs/BUSINESS_RULES.md`,
`docs/TEST_PLAN.md`, this file. No application code, schema or migration changed.

## Checks actually run (session 3)

- Fresh container: `npm ci`, local PostgreSQL role and databases per README, `db:deploy`, `db:seed`.
- `npm run lint`, `npm run typecheck`, `npm test` (16 files, 181 tests) — all passed.
  `npx prettier --check CLAUDE.md docs README.md` — clean.
- Reference check over `CLAUDE.md`, `README.md` and `docs/*.md`: every referenced repository path exists
  (generated `src/generated/prisma` excepted).
- Not run: build and Playwright (no route, config or code change). CI on base `e792497` is green (run
  39748414159).

## Unresolved

- OPS-001 Docker run; ADR-018 accountant confirmation; PUR-002 cost-precision ADR; foreign purchasing
  currencies; advisor review of the compliance register; test gaps in `docs/TEST_PLAN.md`.
- `prisma/schema/inventory.prisma` comment on `unitCost` cites "ADR-018/019"; it should read ADR-018/020
  (fix with the next inventory schema change, INV-002). The migration comment stays as is (immutable).

## Next exact task

**INV-002 — Batches/lots, inspection and quarantine, expiry** (spec in `docs/TASK_BOARD.md`, effort
highest). First step: write the ADR (batch key, carry-over of existing balances, inspection permission,
expiry rule), then the migration. Then INV-003 or PUR-002 (PUR-002 starts with its cost-precision ADR).

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
