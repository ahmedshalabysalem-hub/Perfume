# Session handoff

_Session 4 — 2026-10-22 — branch `claude/project-thread-1a8ij7`, base `ccr-04855f0a-4t6vb0` at
`2cf04f0` merged in._

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

- **Session 4 — INV-002 implemented (PR #5, Review).** ADR-023 Accepted (design v4; DR-001…DR-008,
  DR-010). Batches per company; inspection PENDING/RELEASED/QUARANTINED/REJECTED; expiry basis
  RECORDED/UNKNOWN/NOT_TRACKED with DAY/MONTH precision; verification (both checks, notes, actor, time)
  that never releases; release, quarantine and reject as separate reasoned decisions; LEGACY carry-over
  of pre-INV-002 stock (pending, unverified, unknown expiry, nothing invented); permission
  `inventory.batches.manage` (Super Admin, Inventory Manager). Sale eligibility is one rule:
  `batchEligibility` (`src/lib/inventory/batches.ts`) in the ledger gate and services
  (`sellableQuantity`, `isBatchEligible`), mirrored by `stock_batch_is_sellable` and the
  `stock_balances_sellable_guard` trigger. Base `2cf04f0` (PR #8) merged in; ADR-022 unchanged.
- **Session 4 — OPS-001, QA-002, ADR-018/ADR-024 for development** (parallel thread, merged).
- **Sessions 2–3:** APR-001, INV-001, PUR-001 (ADR-019…021); workflow audit (ADR-022).

## Files changed in session 4 (INV-002)

Schema (`prisma/schema/{inventory,catalog,identity,organization,procurement}.prisma`); the two
migrations; `src/lib/inventory/batches.ts`, `src/lib/schemas/inventory.ts`;
`src/server/modules/inventory/{ledger,stock.service,batches.service}.ts`,
`src/server/modules/catalog/variants.service.ts`, `src/server/rbac/{permissions,roles}.ts`,
`src/server/admin-nav.ts`; pages under `src/app/[locale]/admin/inventory/` (batches list and detail,
stock list and variant page, opening-balance form, actions); `messages/{en,ar}.json`; tests (unit,
integration, migration, e2e, fixtures, SQL fixture `tests/integration/sql/inv-001-ledger-data.sql`);
docs (DECISIONS, DECISION_REQUESTS, DATABASE, RBAC, API_SPEC, BUSINESS_RULES, TEST_PLAN, TASK_BOARD,
PROJECT_STATUS, this file).

## Checks actually run (session 4, INV-002)

Lint, typecheck, Prettier, `npm test` (245 passed), G3 opposite-order test 20/20 runs, build,
`npm run test:e2e` (22 passed). Migration applied to a populated development database and re-run
(returns 0); no drift.

## Unresolved

- Release of a LEGACY batch keeps the units that were quarantined before INV-002 out of sale, by
  subtracting the carried-over quantity per warehouse. If INV-003 later disposes of some quarantined
  units of such a batch, that subtraction can hold back more than remains (it errs on the safe side);
  INV-003 should record disposals against it or move the rule to an explicit marker.
- No reservations exist yet: quarantine moves only unreserved SELLABLE stock; INV-004 must decide what
  happens to reserved units of a batch that is quarantined.
- ADR-018/ADR-024 accountant confirmation (go-live gate); foreign purchasing currencies; advisor review
  of the compliance register; QA-003 (G1, G2).

## Next exact task

Merge PR #5 once CI is green and the review is approved (the coordinator approves). Then INV-003
(adjustments, counts, transfers — post with a batch for tracked variants, refuse SELLABLE lines through
the ledger gate) or PUR-002 (receipts create batches PENDING_INSPECTION in quarantine).

## Context that would otherwise be lost

- Callers change stock only via `postStockMovements(tx, ctx, posting)` inside their own transaction
  (READ COMMITTED); authorisation is the caller's job. Use stable idempotency keys (e.g.
  `order:<id>:ship`); opening balances use `opening-balance:<variant>:<warehouse>:<status>`, or
  `opening-balance:<batch>:<warehouse>:<status>` with a batch (keys are at most 120 characters).
  Batch decisions use `batch:<id>:status:v<version>` and `batch:<id>:verify:v<version>`.
- Lock order: batch rows (FOR SHARE in the ledger, FOR UPDATE in decisions) before balances.
- Tests that need pre-INV-002 stock pause the batch triggers inside one transaction and call
  `stock_carry_over_to_legacy_batches()` (see `legacyStock` in `tests/integration/batches.test.ts`).
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
