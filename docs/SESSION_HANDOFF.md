# Session handoff

_Complete handoff after session 4 — 2026-10-22. Default branch `ccr-04855f0a-4t6vb0` at `4210b62`
(PR #5 merged). No open pull requests and no work in progress. A fresh session can start here._

## Where things stand

Phase 1 is done; Phase 2 (inventory and suppliers) is in progress. Everything below is merged into the
default branch, and CI is green on it.

| PR  | Task            | What landed                                                                            | Merge     |
| --- | --------------- | -------------------------------------------------------------------------------------- | --------- |
| #2  | APR-001         | Shared maker-checker approvals (ADR-019)                                               | `185def3` |
| #1  | INV-001         | Stock ledger, per-status balances, opening balances (ADR-020)                          | `f064554` |
| #3  | PUR-001         | Suppliers, contacts, supplier products, last costs (ADR-021)                           | `e792497` |
| #4  | GOV-002         | Workflow audit: roles, effort and review policy (ADR-022)                              | `812fffc` |
| #6  | OPS-001, QA-002 | Docker Compose validated plus CI job; test-gap assessment; constraint tests            | `eaf54b2` |
| #7  | —               | DR-009 simulated accountant answers (test only), ADR-018 wording                       | `a19b5e1` |
| #8  | —               | ADR-018 and ADR-024 accepted for development                                           | `2cf04f0` |
| #9  | —               | ADR-018 and ADR-024 Accepted by the owner; accounting approvals by accountant or owner | `0a9d224` |
| #5  | INV-002         | Batches, inspection and expiry (ADR-023), after an independent review                  | `4210b62` |

Decisions made in sessions 2–4 (all Accepted, details in `docs/DECISIONS.md`):

- **ADR-018** — moving weighted average cost per legal entity (KSA and Egypt separate).
- **ADR-019** — approvals run inside the subject's own transaction; the requester never decides.
- **ADR-020** — stock ledger: append-only movements, per-status balances, conditional updates, posting
  keys.
- **ADR-021** — suppliers belong to a buying legal entity; last costs carry their currency.
- **ADR-022** — workflow: roles in one session; effort and review scale with risk. Do not modify it
  without Ahmed.
- **ADR-023** — batches are a ledger dimension; inspection gates sellable stock.
- **ADR-024** — costs stored at 4 decimals; half-up rounding only for display, documents and journal
  lines; a rounding account.
- **Approval rule (Ahmed, 2026-10-22):** accounting approvals (costing decisions, write-offs, opening
  valuation) come from the **accountant or the owner, chosen per request**. ADR-018 and ADR-024 were
  accepted by Ahmed as owner; there is no separate accountant go-live gate.
- **Business answers:** DR-001…DR-010 are Decided (`docs/DECISION_REQUESTS.md`). **DR-011** (what a
  release restores, open item 1 below) is recorded there as Open, with a recommended option.

## INV-002 in one paragraph (what the next tasks build on)

Batches belong to a company (legal entity) and a variant. Their inspection status is
PENDING_INSPECTION, RELEASED, QUARANTINED or REJECTED (REJECTED is final). Their expiry basis is
RECORDED (DAY or MONTH precision), UNKNOWN or NOT_TRACKED. Verification records the physical and label
checks and never releases; release, quarantine and reject are separate decisions, each with a reason,
held by `inventory.batches.manage` (Super Admin and Inventory Manager). Stock that existed before
INV-002 sits in one LEGACY batch per company and variant (pending, unverified, unknown expiry). The
single sale rule is `batchEligibility` in `src/lib/inventory/batches.ts`: RELEASED, not expired on the
warehouse's local date, and a PASSED verification when expiry is UNKNOWN. The services use it through
`sellableQuantity` and `isBatchEligible`, and the database mirrors it in `stock_batch_is_sellable` and the
`stock_balances_sellable_guard` trigger. A balance's key (variant, warehouse, status, batch) can never
be changed by UPDATE (`stock_balances_key_fixed`); stock moves only through movements.

## Open items (carry these forward)

1. **Release restores all quarantined stock — decide before INV-003 (and before PUR-002 puts damaged
   units into QUARANTINED on a released batch).** Releasing a QUARANTINED batch moves all of its
   quarantined stock in each warehouse back to SELLABLE, except the LEGACY carry-over. That includes
   units quarantined for another reason, such as damage. The alternative from the review is that
   QUARANTINED → RELEASED moves back only the net quantity of the batch's own `INSPECTION` movements,
   while PENDING_INSPECTION → RELEASED keeps today's behaviour. This is a business rule, recorded as
   **DR-011 (Open)**; ask Ahmed (code: `moveForDecision` in `src/server/modules/inventory/batches.service.ts`).
2. **LEGACY quarantined units.** Release keeps a LEGACY batch's pre-INV-002 quarantined units out of
   sale by subtracting the carried-over quantity. If INV-003 disposes of some of those units, the
   subtraction can hold back more than remains (safe side). INV-003 should record disposals against it or
   replace it with an explicit marker; settle this together with item 1.
3. **INV-004, reserved units.** There are no reservations yet, so quarantine moves only unreserved
   SELLABLE stock. INV-004 must decide what happens to reserved units of a batch that is quarantined.
4. **Future sales paths.** INV-004, ORD-001 and POS-001 must sell or allocate only through the shared
   eligibility function, and must test the DR-010 cases: verified LEGACY with unknown expiry, unverified
   LEGACY, known expired, and future expiry.
5. **QA-003.** The High test gaps G1 (sign-in rate limiting) and G2 (image upload and `/api/files`) are
   still open (`docs/TEST_PLAN.md`). G3 and G4 were closed by INV-002.
6. **Default branch name.** The default branch is still called `ccr-04855f0a-4t6vb0`, a leftover session
   name. Renaming it (for example to `main`) is the owner's action in GitHub settings. Open PRs and local
   clones then need retargeting.
7. **Business and compliance (unchanged):**
   - foreign purchasing currencies (suppliers are priced only in SAR or EGP);
   - choice of payment and shipping provider (PAY-002 is Blocked);
   - ZATCA and ETA onboarding;
   - legal-entity data and the final brand name;
   - advisor review of `docs/COUNTRY_COMPLIANCE.md`;
   - SEC-001 dev-dependency advisories.

## Next exact task

**PUR-002 — purchase orders, approvals and goods receipts.** Effort: high for the spec, highest for
receipt posting and cost (financial consistency and inventory concurrency).

- **Prerequisites (all met):**
  - INV-002 (batches) is merged.
  - PUR-001 suppliers and APR-001 approvals are done.
  - ADR-018 and ADR-024 are Accepted.
  - The DR-009 defaults cover landed-cost allocation, late costs and exchange rates.
- **Step 1, Director:** expand the PUR-002 outline in `docs/TASK_BOARD.md` into a Ready spec with
  `docs/TASK_TEMPLATE.md`. The spec must cover:
  - the PO lifecycle with approval (APR-001);
  - partial receipts that create batches as PENDING_INSPECTION in QUARANTINED (DR-002);
  - rejected quantities and batch allocation;
  - RECEIPT movements through `postStockMovements`;
  - moving-average cost per legal entity at 4 decimals (ADR-018, ADR-024);
  - landed cost;
  - purchase cost history.
- **Step 2:** while the spec is written, ask Ahmed to decide open item 1 (DR-011), because receipts and
  INV-003 adjustments both put stock into QUARANTINED.
- **Alternative:** if Ahmed prefers to finish the inventory line first, take **INV-003** (adjustments,
  counts, transfers) instead. It needs a spec too, and DR-011 must be decided before it is implemented.
- **Parallel option:** QA-003 (G1, G2) is independent, normal effort, and can run in its own thread.

## Context that would otherwise be lost

- **Session start:** read `CLAUDE.md`, then this file, then the task's board entry. Reply to Ahmed in
  Arabic (he writes Egyptian Arabic). Audits and documentation passes run last, after code threads merge.
- **How work is organised (Ahmed, 2026-10-22):**
  - One thread (and one branch and PR) per unrelated task; close finished threads.
  - Medium effort by default; high only for critical, tightly coupled work (payments, financial
    consistency, inventory concurrency, security, migrations).
  - The coordinator approves routine merges once CI is green, and business choices when Ahmed delegates
    them. Never force-push or rewrite history.
  - Accounting approvals name who approved: the accountant or Ahmed as owner.
- **Fresh container setup:** there is no `.env` and no Postgres role.
  - Run `service postgresql start`.
  - Create role `perfume` with CREATEDB and the databases `perfume_dev`, `perfume_test` and
    `perfume_e2e`.
  - Copy `.env.example` to `.env` and never commit it.
  - Then run `npm ci`, `npx prisma generate`, `npm run db:deploy`, `npm run db:sync-rbac` and
    `npm run db:seed`.
  - Docker is installed but its daemon is not running; start `dockerd` before using `docker compose`.
- **Playwright:** set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`. To reuse an existing
  build, set `E2E_SERVER_COMMAND="npm run start -- --port 3100"`.
- **Migrations:** seven so far; the last is `20261022110000_stock_balance_keys_fixed`.
  - Never edit an applied migration; add a new one.
  - Never run `prisma migrate reset`.
  - CHECK constraints and triggers are written in raw SQL.
- **Changing stock:** callers change stock only through `postStockMovements(tx, ctx, posting)` inside
  their own transaction (READ COMMITTED); authorisation is the caller's job.
  - Use stable idempotency keys of at most 120 characters, for example `order:<id>:ship`.
  - Opening balances use `opening-balance:<variant|batch>:<warehouse>:<status>`.
  - Batch decisions use `batch:<id>:status:v<version>` and `batch:<id>:verify:v<version>`.
- **Lock order:** batch rows first (FOR SHARE in the ledger, FOR UPDATE in decisions), then balances.
- **Batch-tracked variants:** they need a batch on every movement. Tests that do not care about batches
  use `trackBatches: false`.
  - Tests that need stock from before INV-002 pause the batch triggers inside one transaction and call
    `stock_carry_over_to_legacy_batches()` (see `legacyStock` in `tests/integration/batches.test.ts`).
  - Test fixtures and the e2e reset set `app.stock_ledger_purge = 'on'` to truncate the ledger; any new
    reset script must do the same.
- **Approval effects** are applied by the consuming module inside the same transaction (ADR-019); there
  is no generic approvals inbox.
- **CHECK pitfall:** a CHECK written as `col = 'X' AND n BETWEEN …` passes when `n` is NULL; write
  `IS NOT NULL` explicitly.
- **Workflow:**
  - Effort per task is a recommendation (ADR-022); the person picks the model and effort in the app.
  - Migration, concurrency and financial work gets an independent review pass before merge.
  - Next.js maintains `AGENTS.md`; keep it committed.
  - `docs/reference/ORIGINAL_BRIEF.md` is excluded from Prettier on purpose.

## Checks actually run (session 4, final)

INV-002 at head `e77d4a7`, run locally:

- lint, typecheck and Prettier;
- `npm test`: 20 files, 246 tests;
- `npm run build`;
- `npm run test:e2e`: 22 tests;
- the G3 opposite-order test, 20 runs in a row.

CI was green on `e77d4a7` (both jobs), and the CI run on the merge commit `4210b62` is recorded in
`docs/PROJECT_STATUS.md`. This handoff PR changes documentation only.
