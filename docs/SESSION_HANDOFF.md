# Session handoff

_Handoff updated 2026-10-26 for INV-006. Default branch `ccr-04855f0a-4t6vb0` at `111f65b` (PR #13
merged). INV-006 is in review on branch `claude/project-thread-ye4et1`; nothing else is in progress._

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
| #13 | UX-000, UX-001  | UI/UX audit; inventory status clarity («موقوف للفحص», decision confirmation)           | `111f65b` |

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
- **Business answers:** DR-001…DR-011 are all Decided (`docs/DECISION_REQUESTS.md`). DR-011 (Ahmed,
  2026-10-22) chose Option A: a release restores only inspection-held stock; INV-006 implements it.

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

1. **INV-006 (in review) — a release restores only inspection-held stock (DR-011, Option A).** Per
   warehouse, a release moves back `min(inspection-held, on hand − reserved)`, where inspection-held is
   the net QUARANTINED quantity of the batch's `INSPECTION` and `OPENING_BALANCE` movements
   (`INSPECTION_HOLD_TYPES` in `batches.service.ts`). Damage and the LEGACY carry-over stay held; the
   LEGACY subtraction is gone. Counting opening balances entered to await inspection as inspection-held
   was put to Ahmed on 2026-10-26 (decision card in the INV-006 thread); merge after his answer.
2. **Rules INV-006 leaves for later tasks.** PUR-002 adds `RECEIPT` to `INSPECTION_HOLD_TYPES` and
   never posts damaged units into QUARANTINED as a receipt. INV-003 adjustments out of a batch's
   QUARANTINED stock must say which hold they consume, so the inspection-held sum stays exact;
   otherwise a later release can return damaged units.
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

**Merge INV-006** once the independent review passes, CI is green and Ahmed has answered the
decision card (see open item 1).

**Then PUR-002 — purchase orders, approvals and goods receipts.** Effort: high for the spec, highest for
receipt posting and cost (financial consistency and inventory concurrency).

- **Prerequisites:** INV-002 merged; PUR-001 and APR-001 done; ADR-018 and ADR-024 Accepted; the DR-009
  defaults cover landed-cost allocation, late costs and exchange rates. The spec can be written in
  parallel with INV-006; implementation follows it.
- **Director:** expand the PUR-002 outline in `docs/TASK_BOARD.md` into a Ready spec with
  `docs/TASK_TEMPLATE.md`. The spec must cover:
  - the PO lifecycle with approval (APR-001);
  - partial receipts that create batches as PENDING_INSPECTION in QUARANTINED (DR-002);
  - rejected quantities and batch allocation;
  - RECEIPT movements through `postStockMovements`;
  - moving-average cost per legal entity at 4 decimals (ADR-018, ADR-024);
  - landed cost;
  - purchase cost history.
- **Alternative:** if Ahmed prefers to finish the inventory line first, take **INV-003** (adjustments,
  counts, transfers) after INV-006. It needs a spec too.
- **Parallel option:** QA-003 (G1, G2) is independent, normal effort, and can run in its own thread.

## I18N-002 (parallel thread, localization gaps)

Branch `claude/project-thread-fokfn9`, UI and messages only; no schema change and no inventory or
accounting logic touched. What it adds is in `docs/PROJECT_STATUS.md` and the ADR-009 amendment.
Rules for later work: give every new audit action a label in `messages/*.json` → `auditActions` (a
unit test enforces it); add `numberingSystem: "latn"` to inline `Intl` options; wrap identifiers in
`ltr-value` or `dir="ltr"`; e2e tests that switch language while signed in must switch back, because
the choice is saved on the account. Known limits, not changed here: native date inputs show the
browser's own placeholder (`mm/dd/yyyy`); stored audit summaries stay in the language they were
written in (English); timestamps display in `APP_TIME_ZONE` (Riyadh) for Egyptian records too.

## OPS-004 (parallel thread, Windows start scripts)

`scripts/windows/start.cmd` and `stop.cmd` (logic in the `.ps1` files beside them, ASCII-only for
Windows PowerShell 5.1, CRLF via `.gitattributes`) let Ahmed start the site with a double-click. The
seed-once marker is `storage/.seeded` (already git-ignored). Docker mode is verified only by the Linux
compose job; the Windows CI job covers the native PostgreSQL path. Ahmed's Word guides live in the
project files under `windows-setup/`.

## UX-000 and UX-001 (parallel thread, UI/UX initiative)

- **UX-000** — `docs/UI_UX_AUDIT.md` audits the back office on `7ea936b` (no P0; baseline 252 Vitest,
  30 Playwright, all green). Ahmed's decisions (2026-10-26) are in its section 12: the Arabic label for
  QUARANTINED is «موقوف للفحص»; dashboard inventory counts approved (UX-004); staff use every device
  type (phone tables F13 → P1). Order (coordinator, delegated by Ahmed): UX-001 merges first, then
  INV-006 starts — never in parallel on the inventory files.
- **UX-001 (done in the same PR)** — UI only, no rule changes: the Arabic quarantine wording; the stock
  list shows the eligibility reason under a zero "Available for sale" (`listStock` returns
  `ineligibleReason`, as `getVariantStock` already did); links product variant → stock → product, stock
  → batches of the variant, batch → product and → stock; batch header shows inspection and sale
  badges; a batch decision opens a confirmation naming its effect (Rejected is final) and the batch's
  stock by status before anything is applied. Tests: integration `batches.test.ts`, e2e
  `inventory.spec.ts` (new test plus the confirmation step in `decide`).
- **Next UX slice:** UX-002 (tokens and accessibility) lands alone; UX-005 (phone tables) is now P2 on
  the board with F13 at P1 inside it.

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
