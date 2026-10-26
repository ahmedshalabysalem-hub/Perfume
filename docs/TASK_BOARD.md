# Task board

Statuses: **Backlog** → **Ready** (spec complete, dependencies met) → **In Progress** → **Review** →
**Done**; **Blocked** when an external input is missing. Priority: **P0** blocks release · **P1** current
or next phase · **P2** the phase after · **P3** later. New specifications use `docs/TASK_TEMPLATE.md`.
Change a status only with evidence. Phases: `docs/IMPLEMENTATION_PLAN.md`. **INV-002 is Done** (PR #5);
next: INV-006 (DR-011 decided: Option A), then PUR-002 spec (or INV-003) — see `docs/SESSION_HANDOFF.md`.

## Open tasks

| ID        | Title                                                        | Phase | Status  | Pri              | Depends on                                |
| --------- | ------------------------------------------------------------ | ----- | ------- | ---------------- | ----------------------------------------- |
| INV-006   | Release restores only inspection-held stock (DR-011)         | 2     | Backlog | P1               | INV-002                                   |
| PUR-002   | Purchase orders, approvals and goods receipts                | 2     | Backlog | P1               | INV-002, PUR-001, APR-001, INV-006        |
| INV-003   | Adjustments (approved), stock counts and transfers           | 2     | Backlog | P1               | INV-001, APR-001, INV-002, INV-006        |
| QA-003    | Close the High gaps of the 2026-10-22 test plan (G1, G2)     | 2     | Backlog | P1               | — (G3, G4 closed by INV-002)              |
| INV-004   | Stock reservations                                           | 2     | Backlog | P1               | INV-001                                   |
| INV-005   | Reorder thresholds, low-stock/expiry alerts, scanning flows  | 2     | Backlog | P1               | INV-002                                   |
| CUST-001  | Customer accounts, addresses, consent, data requests         | 3     | Backlog | P2               | AUTH-001                                  |
| PRC-001   | Tax rates and price calculation                              | 3     | Backlog | P2               | CAT-001                                   |
| SHIP-001  | Shipping zones, methods and fees                             | 3     | Backlog | P2               | ORG-001                                   |
| ORD-001   | Cart, checkout and order creation with reservation           | 3     | Backlog | P2               | INV-004, CUST-001, PRC-001, SHIP-001      |
| ORD-002   | Order lifecycle administration and notifications             | 3     | Backlog | P2               | ORD-001                                   |
| STORE-002 | Seller identification and legal pages per market             | 3     | Backlog | P2               | ORG-001                                   |
| PAY-001   | Payment adapters (manual/mock), COD, bank transfer, webhooks | 4     | Backlog | P3               | ORD-001                                   |
| PAY-002   | Online payment provider integration per market               | 4     | Blocked | P3               | PAY-001; provider choice and credentials  |
| SHIP-002  | Carrier abstraction, shipments and tracking                  | 4     | Backlog | P3               | ORD-002                                   |
| RET-001   | Returns, dispositions and refunds                            | 4     | Backlog | P3               | PAY-001, SHIP-002                         |
| POS-001   | POS foundations: lookup, scan, sale, tender, receipt         | 4     | Backlog | P3               | INV-004, PRC-001, PAY-001                 |
| INVC-001  | Invoices, credit notes, sequences, tax profiles              | 5     | Backlog | P3               | ORD-001, POS-001                          |
| EINV-001  | ZATCA e-invoicing adapter and checklist                      | 5     | Backlog | P0 for KSA sales | INVC-001; live use needs ZATCA onboarding |
| EINV-002  | ETA e-invoice and e-receipt adapter and checklist            | 5     | Backlog | P0 for EG sales  | INVC-001; live use needs ETA registration |
| FIN-001   | Chart of accounts, periods, journal entries                  | 5     | Backlog | P3               | ADR-018 (dev), INVC-001, PUR-002          |
| FIN-002   | Expense categories and expenses                              | 5     | Backlog | P3               | FIN-001                                   |
| FIN-003   | Inventory cost, COGS and basic financial reports             | 5     | Backlog | P3               | FIN-001                                   |
| PUR-003   | Supplier invoices, returns, payments and balances            | 5     | Backlog | P3               | PUR-002, FIN-001                          |
| CRM-001   | Segmentation and support notes                               | 6     | Backlog | P3               | CUST-001                                  |
| LOY-001   | Loyalty ledger                                               | 6     | Backlog | P3               | ORD-001, RET-001                          |
| MKT-001   | Coupons and promotions                                       | 6     | Backlog | P3               | PRC-001, ORD-001                          |
| REV-001   | Product reviews and moderation                               | 6     | Backlog | P3               | CUST-001                                  |
| POS-002   | Cashier sessions, drawer reconciliation, sales channels      | 6     | Backlog | P3               | POS-001                                   |
| SETL-001  | COD and supplier settlement workflows                        | 6     | Backlog | P3               | PAY-001, PUR-003                          |
| RPT-001   | Operational and financial dashboards and reports             | 7     | Backlog | P3               | FIN-003                                   |
| AUD-002   | Audit retention settings and export                          | 7     | Backlog | P3               | AUD-001                                   |
| INT-001   | Integration API, business events, webhooks (n8n)             | 7     | Backlog | P3               | ORD-001                                   |
| AI-001    | AI-assisted features behind business rules                   | 7     | Backlog | P3               | INT-001                                   |
| REL-001   | Release verification suite                                   | 8     | Backlog | P0               | release scope                             |
| SEC-003   | Pre-release security review                                  | 8     | Backlog | P0               | release scope                             |
| OPS-003   | Production hosting, backups, observability                   | 8     | Backlog | P0               | OPS-002                                   |
| CAT-002   | Refuse GS1 demo-range barcodes in production                 | —     | Backlog | P2               | —                                         |
| CAT-003   | Product import/export with validation                        | —     | Backlog | P2               | CAT-001                                   |
| OPS-002   | S3-compatible storage adapter                                | —     | Backlog | P2               | —                                         |
| SEC-002   | Multi-factor authentication for staff                        | —     | Backlog | P2               | —                                         |
| SEC-001   | Dev-dependency audit follow-up                               | —     | Backlog | P3               | upstream fix                              |
| UX-001    | Inventory status clarity (audit F1–F5)                       | —     | Backlog | P1               | Director approval; not with INV-006       |
| UX-002    | Design tokens, status tones and form accessibility (F8–F17)  | —     | Backlog | P2               | UX-001; lands alone (every page)          |
| UX-003    | Breadcrumbs, loading states, toast placement (F3, F10–F14)   | —     | Backlog | P2               | UX-002                                    |
| UX-004    | Dashboard inventory queues and readable activity (F6, F7)    | —     | Backlog | P2               | Director approval                         |
| UX-005    | Phone tables and catalogue polish (F13, F15, F18–F22)        | —     | Backlog | P3               | UX-002                                    |

## Done

Commits are where the work landed; tests are the evidence that it still holds. CI run 1
([39681695967](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39681695967), commit
`25b1b15`) passed lint, format, typecheck, 108 Vitest tests, build and 16 Playwright tests.

| ID        | Title                                                                                                                         | Commits                         | Evidence                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| BOOT-001  | Next.js 16 + TS strict + Tailwind 4 + ESLint/Prettier bootstrap                                                               | `4767a8f`                       | lint, typecheck, format check clean                                                                       |
| DB-001    | Schema (27 tables), migration with 29 CHECKs + 3 audit triggers, safe seed                                                    | `4767a8f`                       | integration suites on `migrate deploy`; seed re-run idempotent                                            |
| AUTH-001  | Staff sign-in/out, DB sessions, rate limit, password policy, change password                                                  | `6513a01`, `648acd9`, `e6c131f` | `auth.test.ts` (6), e2e `auth.spec.ts` (3)                                                                |
| AUTH-002  | RBAC: 48 permissions, 12 roles, scoped assignments, escalation guard                                                          | `4767a8f`, `648acd9`            | `rbac.test.ts` (16), `access-and-organization.test.ts` (18), e2e `access-control.spec.ts` (2)             |
| AUD-001   | Append-only audit log, same-transaction writes, redaction, viewer                                                             | `4767a8f`, `648acd9`            | audit rows asserted in integration suites; trigger rejections observed in CI                              |
| I18N-001  | Arabic RTL / English LTR, typed messages, parity test, negotiation                                                            | `6513a01`                       | `messages.test.ts` (3), e2e `storefront.spec.ts`                                                          |
| I18N-002  | Localization gaps: lasting language choice, two-language switcher, audit and permission labels, Latin digits, mobile          | I18N-002 PR                     | `messages.test.ts` (5), `preferences.test.ts` (4), e2e `i18n.spec.ts` (8)                                 |
| ORG-001   | Countries, legal entities, stores, warehouses (scoped)                                                                        | `648acd9`                       | `access-and-organization.test.ts`                                                                         |
| ADM-001   | Admin shell, scoped navigation, dashboard KPIs                                                                                | `6513a01`                       | KPIs checked against seed; e2e access spec                                                                |
| ACC-001   | Staff users and role-assignment management                                                                                    | `648acd9`                       | `access-and-organization.test.ts`                                                                         |
| CAT-001   | Catalogue: brands, categories, attributes, products, variants, SKU/GTIN, market prices, images, compliance references, labels | `6513a01`, `1cb7076`            | `catalog.test.ts` (28), e2e `catalog.spec.ts` (4)                                                         |
| STORE-001 | Read-only storefront: market selection, listing, filters, product pages, sitemap                                              | `b1b2848`                       | `storefront.test.ts` (6), e2e `storefront.spec.ts` (7)                                                    |
| QA-001    | Vitest unit + integration and Playwright e2e infrastructure                                                                   | `4767a8f`, `e6c131f`            | CI run 1                                                                                                  |
| GOV-001   | Governance files and session handoff                                                                                          | `c7ad28a`                       | files reviewed against code and tests                                                                     |
| COMP-001  | Country compliance register (KSA, Egypt)                                                                                      | `ba959d4`                       | 16 requirements, official sources, statuses, open questions                                               |
| DOC-001   | README and local development setup                                                                                            | `25b1b15`                       | `npm ci`, `db:deploy`, `db:sync-rbac`, `db:seed` (re-run) executed                                        |
| CI-001    | GitHub Actions CI pipeline                                                                                                    | `25b1b15`                       | CI run 1 green                                                                                            |
| DOC-002   | PRD, architecture and business-rules documents                                                                                | session 1 docs commit           | statements checked against services, schema and tests                                                     |
| DOC-003   | Database, ERD, RBAC, API spec and test plan documents                                                                         | session 1 docs commit           | counts verified: 27 tables, 29 CHECKs, 3 triggers, 48 permissions, 12 roles                               |
| APR-001   | Approval workflow framework: requests, append-only history, separation of duties, scoped approvers                            | `436a974`                       | `approvals.test.ts` unit (4) and integration (19); `npm run verify` 131 tests (session 2)                 |
| INV-001   | Stock ledger, balances and opening balances (ADR-020)                                                                         | `e61e099`, merge `f064554`      | `inventory.test.ts` (27), `inventory-schemas.test.ts` (3), e2e `inventory.spec.ts` (2); CI green on PR #1 |
| PUR-001   | Suppliers, contacts, supplier products and last costs (ADR-021)                                                               | `603582f`                       | `procurement.test.ts` (14), `procurement-schema.test.ts` (5), e2e `procurement.spec.ts` (2)               |
| GOV-002   | Workflow audit: roles, effort and review policy, INV-002 spec, status reconciled (ADR-022)                                    | session 3 docs commit           | lint, typecheck, 181 Vitest tests, Prettier, reference check                                              |
| OPS-001   | docker-compose for local PostgreSQL, validated by a real run and a CI job                                                     | session 4 commit                | compose healthy, 4 migrations, no drift; 193 Vitest, 20 e2e on it                                         |
| QA-002    | Test-plan gap assessment; direct tests of ledger, approval and audit-log CHECKs                                               | session 4 commit                | `database-constraints.test.ts` (12); full Vitest suite                                                    |
| INV-002   | Batches/lots, inspection and quarantine, expiry (ADR-023)                                                                     | merge `4210b62` (PR #5)         | `batches.test.ts` (30), migration test (4), unit, e2e; 246 Vitest, 22 e2e; CI green; independent review   |
| OPS-004   | Windows one-click `start.cmd` / `stop.cmd` (Docker Desktop or native PostgreSQL)                                              | PR (session branch)             | CI "Windows start scripts": two starts and stops on Windows                                               |

---

## Ready specifications

None. The next task (PUR-002 or INV-003) needs its spec written from the outline below.

## Completed specifications (reference)

### INV-002 — Batches/lots, inspection and quarantine, expiry

- **Status:** Done (PR #5, merge `4210b62`) · **Priority:** P1 · **Effort:** highest (ledger schema change, inventory concurrency,
  migration of existing balances)
- **Depends on:** INV-001 (done). ADR-020 reserves the batch dimension for this task. Next before INV-003
  and PUR-002 so adjustments, counts, transfers and receipts are built on batch-aware balances once.
- **Design (2026-10-22):** ADR-023 **Accepted** (design v4, approved by Ahmed); business answers
  DR-001…DR-008 and DR-010 in `docs/DECISION_REQUESTS.md`.
  Additions to this spec: batches owned per company (legal entity) with database isolation; inspection
  states `PENDING_INSPECTION`/`RELEASED`/`QUARANTINED`/`REJECTED`; permission `inventory.batches.manage`
  (Super Admin, Inventory Manager only); expiry precision `DAY`/`MONTH`; LEGACY batches with unknown
  lot and dates for pre-existing stock, sellable only after a recorded verification and a separate explicit release (DR-010); explicit
  expiry basis `RECORDED`/`UNKNOWN`/`NOT_TRACKED`; movement types `INSPECTION` and `BATCH_ASSIGNMENT`; one shared
  eligibility function; tracking flags frozen once stock exists. INV-004, ORD-001 and POS-001 must
  sell or allocate only through that function and test the DR-010 cases (verified legacy with unknown
  expiry, unverified legacy, known expired, future expiry).

- **Delivered (PR #5):** migrations `20261022095900_stock_movement_types_for_batches` and
  `20261022100000_inventory_batches` (1 table, 14 CHECKs, 4 triggers, carry-over function) and
  `20261022110000_stock_balance_keys_fixed` (review fix: balance keys cannot be relabelled);
  `src/lib/inventory/batches.ts` (shared eligibility, FEFO, label dates);
  `src/server/modules/inventory/batches.service.ts`; ledger, opening balances and variant flag lock;
  pages `/admin/inventory/batches` and `/admin/inventory/batches/[id]`; tests `tests/unit/batches.test.ts`,
  `tests/integration/batches.test.ts`, `tests/integration/inventory-batches-migration.test.ts`,
  `tests/e2e/inventory.spec.ts` (test titles name the criteria they cover).

**Objective** — Stock of batch-tracked variants is held and moved per batch (lot) with its expiry date and
inspection state; only released, unexpired stock can be sellable; batches are listed in expiry order
(FEFO) for later picking.

**Context and relevant files** — Brief Module 2 (batch/lot tracking) and §7; `docs/BUSINESS_RULES.md`
§Inventory and the catalogue inventory flags (`trackBatches` defaults to true, `trackExpiry` requires it,
`prisma/schema/catalog.prisma`); ADR-018, ADR-020; `prisma/schema/inventory.prisma`;
`src/server/modules/inventory/{ledger,stock.service}.ts`; stock pages under
`src/app/[locale]/admin/inventory`; suppliers for the optional supplier reference
(`prisma/schema/procurement.prisma`).

**Scope**

1. ADR first: batch identity (lot number unique per variant), where the batch key lives (balance and
   movement rows, `NULL` only for variants without batch tracking), how existing balances of
   batch-tracked variants are carried over (data-preserving migration; no movement is rewritten),
   inspection states and which permission changes them (existing `inventory.*` permission or a new one),
   expiry handling (expired stock never sellable; whether that is a status move or a query rule).
2. Migration: `stock_batches` (variant, lot number, manufacturing and expiry dates, optional supplier and
   receipt reference, inspection status PENDING/RELEASED/QUARANTINED/REJECTED, audit columns) with CHECKs
   (expiry after manufacturing; expiry required when the variant tracks expiry, enforced in the service
   if not expressible as a CHECK); batch key added to `stock_balances` and `stock_movements`.
3. `postStockMovements` accepts a batch per line, requires it for batch-tracked variants and refuses it
   for others; SELLABLE lines only for RELEASED, unexpired batches; same locking and idempotency rules.
4. Service operations: create batch, change inspection status (release, quarantine, reject) posting the
   matching status movements in the same transaction, list batches per variant/warehouse in FEFO order
   (pure, unit-tested ordering helper for later picking).
5. Opening balances capture lot number and expiry for batch-tracked variants.
6. Back office: batches per variant (lot, expiry, inspection state, quantities by status), filter for
   expiring and quarantined stock; Arabic and English; scoped like the stock pages.

**Out of scope** — Receipts creating batches from purchase orders (PUR-002), adjustments, counts and
transfers (INV-003), reservations and FEFO picking in orders/POS (INV-004, ORD-001, POS-001), expiry and
low-stock alerts (INV-005), valuation per batch (ADR-018 keeps weighted average), regulatory batch
recalls.

**Acceptance criteria**

1. A batch-tracked variant cannot receive or lose stock without a batch; a non-tracked variant cannot
   carry one (service and database).
2. PENDING, QUARANTINED, REJECTED or expired batches never produce sellable available stock (integration
   tests per state).
3. Releasing or quarantining a batch moves its quantity between statuses through ledger movements in one
   transaction; Σ movements = balance per key still holds.
4. The INV-001 guarantees still hold per batch: concurrent removals never oversell, idempotent retries,
   append-only ledger, no negative balances (existing tests extended to batches).
5. Existing balances and movements survive the migration unchanged in quantity (migration tested on a
   database seeded with INV-001 data).
6. Batch changes require the chosen permission at the warehouse's scope, need a reason for quarantine and
   rejection, and are audited.
7. FEFO ordering: earliest expiry first, batches without expiry last, ties by received date (unit tests).
8. Batch pages work in both languages and pass lint, typecheck, unit, integration and e2e suites.
9. A variant's tracking flags cannot change once it has ledger history (service and database).
10. Inspection changes are idempotent per batch version; a stale version is a conflict; only
    `inventory.batches.manage` holders (not Business Manager) decide, with a mandatory reason.
11. A batch cannot be used for another variant, in another company's warehouse or with another
    company's supplier (database).
12. Expiry is judged on the warehouse's local date (tested across midnight); month-precision expiry is
    stored as the month's last day and flagged; no expiry is inferred.
13. Lot numbers are immutable once stock exists, except on LEGACY batches, which can never take an
    existing lot.
14. The carry-over is idempotent, reconciles quantities before and after, changes no movement and
    fabricates no lot or date; "expiring within N days" excludes expired batches, which have their own
    filter.
15. Sale eligibility lives in one shared function used by the ledger gate; INV-004, ORD-001, POS-001 and
    any other stock-consuming path must use it.
16. Verified (`PASSED`) and released LEGACY stock with unknown expiry is eligible.
17. Unverified LEGACY stock is not eligible and its release is refused (service and CHECK).
18. Verification alone never makes a batch eligible or changes its inspection status.
19. Known-expired stock (LEGACY or not) is not eligible; release and inbound SELLABLE lines are refused.
20. Released stock with a future expiry is eligible and stops being eligible the day after expiry
    (warehouse local date).
21. A failed check moves the batch to QUARANTINED or REJECTED in the same action; the stock is not
    eligible.
22. A LEGACY batch never gets `NOT_TRACKED` from an empty field; "not applicable" only where the
    variant's catalogue setting disables expiry tracking.
23. The migration preserves every quantity and the full history, creates no lot or date, is idempotent;
    release never moves stock quarantined before INV-002.

**Security and data integrity** — server-side authorization on every read and write; migration reviewed
for data loss and lock duration; CHECKs and triggers documented in `docs/DATABASE.md`; no client-supplied
quantities other than the posted lines; dates validated as calendar dates in the warehouse's time zone.

**Required tests** — unit (FEFO ordering, schemas), integration (batch required/refused, inspection
transitions, sellability by state and expiry, concurrency per batch including two postings with
lines in opposite order (lock order with the batch in the key), migration carry-over on populated
INV-001 data run twice, scopes, audit), e2e (create batch on opening balance → quarantine → release → visible as sellable).

**Review** — separate review pass against the criteria; read the migration SQL and the posting changes
line by line.

### INV-001 — Stock ledger and balances

- **Status:** Done (merged 2026-10-22 as `f064554`, CI green on `3ce46c9`) · **Priority:** P1 · **Effort:** highest (inventory concurrency, migration)
- **Delivered:** ADR-020; migration `20261022071737_inventory_stock_ledger` (2 tables, 11 CHECKs, 3
  triggers); `src/server/modules/inventory/{ledger,stock.service}.ts`; pages under
  `/admin/inventory`; `tests/integration/inventory.test.ts` (27), `tests/unit/inventory-schemas.test.ts`
  (3), `tests/e2e/inventory.spec.ts` (2). Deviation: one status per movement row (a status change is
  two lines) instead of "status from/to" columns — see ADR-020.
- **Depends on:** Phase 1 closed; ADR-018 (proposed costing) — cost is captured, not yet valued.

**Objective** — Every stock quantity per variant, warehouse and stock status comes from an immutable
movement ledger, balances change atomically with their movement, and stock can never go negative or
be oversold, even under concurrency.

**Context and relevant files** — Brief Module 2 and §7; `docs/BUSINESS_RULES.md` §Planned rules;
`docs/DECISIONS.md` ADR-004/005/008/018; warehouses (`prisma/schema/organization.prisma`,
`src/server/modules/organization`); variants and `track_inventory` (`prisma/schema/catalog.prisma`);
permissions `inventory.*` (`src/server/rbac/permissions.ts`, currently `available: false`); audit
trigger pattern in `prisma/migrations/20261021195313_init/migration.sql`; scope filters in
`src/server/rbac/authorize.ts`.

**Scope**

1. Design note in `docs/DECISIONS.md` (new ADR): balance granularity (variant × warehouse × status;
   batch dimension reserved for INV-002), quantity type (integer units), unit-cost precision and
   currency, locking strategy, idempotency keys.
2. Migration: `stock_movements` (append-only, trigger like `audit_logs`; type, signed quantity,
   status from/to, unit cost, document reference, reason, actor, correlation id, unique idempotency
   key) and `stock_balances` (on hand, reserved, CHECKs: on hand ≥ 0, 0 ≤ reserved ≤ on hand).
3. Service `postStockMovements(tx, ctx, lines)` used by every future module: locks or conditionally
   updates balance rows, inserts movements, rejects insufficient stock with a domain error, is
   idempotent by key.
4. Opening balances: one guarded admin flow (permission `inventory.adjust.approve`, reason required)
   so stock can be entered before purchasing exists.
5. Back office: stock overview per warehouse (search by SKU/barcode, filter by status) and movement
   history per variant; scoped by warehouse/legal entity/country; Arabic and English.
6. Enable `inventory.view` (and the permission used for opening balances) in the catalogue; sync roles.

**Out of scope** — Batches and expiry (INV-002), receipts from purchase orders (PUR-002), approval
workflow for adjustments, counts and transfers (INV-003), reservations (INV-004), valuation reports
(FIN-003), storefront availability display.

**Acceptance criteria**

1. A balance never changes without a movement in the same transaction; a failure after the movement
   insert rolls back both (integration test).
2. N parallel transactions each removing 1 unit from a balance of K < N succeed exactly K times; the
   rest fail with an insufficient-stock error; final balance 0; Σ movements = balance (test with
   separate connections).
3. Negative stock is refused by the service and by a database CHECK.
4. Re-posting with the same idempotency key creates no second movement.
5. UPDATE/DELETE on `stock_movements` is refused by the database.
6. Users only see and post stock for warehouses within their scope (integration tests per scope type).
7. Opening balances require the permission and a reason, and are audited.
8. Stock pages work in both languages and pass lint, typecheck, unit, integration and e2e suites.

**Security and data integrity** — server-side authorization on every read and write; integer
quantities; costs as exact decimals; no client-supplied totals; migration reviewed for data loss
(new tables only); CHECKs and triggers documented in `docs/DATABASE.md`.

**Required tests** — unit (pure helpers), integration (rollback, concurrency, idempotency, trigger,
scopes, permission checks), e2e (opening balance → stock visible → history entry).

### PUR-001 — Suppliers and supplier products

- **Status:** Done (`603582f`) · **Priority:** P1 · **Effort:** high (schema, authorization)
- **Depends on:** ORG-001, CAT-001. Design: ADR-021.

**Objective** — Procurement staff can maintain supplier profiles (tax and commercial registration,
payment terms, purchasing currency, contacts) and the supplier's own codes and last costs for our
variants, within their scope, with every change audited.

**Context and relevant files** — Brief Module 3; `docs/RBAC.md` (`suppliers.manage`, Procurement Staff);
legal entities and `taxNumberLooksValid` (`src/lib/schemas/organization.ts`); variant lookup by SKU or
barcode (`findVariantByCode`, `src/server/modules/catalog/products.service.ts`); compliance panel and
organisation forms as UI patterns.

**Scope**

1. Migration: `suppliers`, `supplier_contacts`, `supplier_products` with CHECKs (code format, payment
   terms vs days, positive cost, cost/currency/date consistency) and unique keys (code; tax number per
   entity; variant and supplier code per supplier).
2. Service `src/server/modules/procurement/suppliers.service.ts`: list (search, status, entity filter,
   scoped), get, create, update, activate/deactivate; contacts add/update/remove with one primary;
   supplier products add/update/activate/deactivate with variant lookup by SKU or barcode.
3. Permission `suppliers.view` added; `suppliers.view` and `suppliers.manage` marked available; roles
   synced.
4. Back office: Procurement → Suppliers list and supplier page (profile, contacts, products,
   history) in Arabic and English. Demo procurement user and one demo supplier in the seed.

**Out of scope** — Purchase orders and automatic last-cost updates (PUR-002), supplier invoices,
payments and balances (PUR-003), supplier performance reports (RPT-001), foreign purchasing
currencies, supplier portal (not planned).

**Acceptance criteria**

1. Users without `suppliers.view` cannot list or open suppliers; users without `suppliers.manage`
   cannot change them (service-level tests).
2. COUNTRY- and LEGAL_ENTITY-scoped users see and manage only suppliers of their scope.
3. Tax numbers are format-checked by the supplier's country and unique per buying entity.
4. NET payment terms require 1–365 days; other terms store no days (service and CHECK).
5. A variant appears at most once per supplier, a supplier code at most once per supplier; last cost
   is exact to the currency's minor units, stored with its currency and date.
6. Every create, update, (de)activation and contact removal writes an audit entry in the same
   transaction; supplier history is visible on the supplier page.
7. Pages work in both languages and pass lint, typecheck, unit, integration and e2e suites.

**Security and data integrity** — server-side authorization on every read and write; no hard delete of
suppliers or supplier products (status only); contacts removable (personal data) with name-only audit
snapshot; decimal strings for money; migration adds new tables only.

**Required tests** — unit (permission catalogue and roles), integration (authorization and scopes,
validation, uniqueness, audit, primary contact, variant lookup, last cost), e2e (create supplier → add
contact → link variant with cost → visible in list and history).

## Backlog outlines

Expand an outline with `docs/TASK_TEMPLATE.md` before moving it to Ready.

- **QA-003** — the High items G1 and G2 of the test assessment in `docs/TEST_PLAN.md` (sign-in rate
  limiting, image upload); G3 and G4 were closed by INV-002. Each needs a spec.
- **INV-006 Release restores only inspection-held stock (DR-011, Option A)** — QUARANTINED → RELEASED
  moves back to SELLABLE only the net quantity of the batch's own `INSPECTION` movements per warehouse;
  stock quarantined for other reasons (damage) stays held. PENDING_INSPECTION → RELEASED is unchanged.
  Replace the LEGACY carry-over subtraction with the same rule (handoff open item 2). Code:
  `moveForDecision` in `src/server/modules/inventory/batches.service.ts`. Effort: highest (inventory
  concurrency); integration tests for mixed inspection and damage quarantine, LEGACY, and replay.
- **PUR-002 Purchase orders** — lifecycle with approval, partial receipts with inspection and rejected
  quantities, batch allocation, landed cost; posts RECEIPT movements; purchase cost history.
  Cost precision and rounding: ADR-024; landed-cost allocation, late costs and exchange rates: DR-009
  defaults. Receipts create batches PENDING_INSPECTION in QUARANTINED (DR-002). INV-006 (DR-011) lands
  first, before damaged units go into QUARANTINED on a released batch.
- **INV-003 Adjustments, counts, transfers** — approved adjustments with reasons; counts posting
  corrections; two-step transfers (in transit). After INV-002 so all three work per batch. Builds on
  INV-006: release returns only the batch's own INSPECTION net quantity (DR-011).
- **INV-004 Reservations** — reserve on checkout/POS hold, expire and release, idempotent.
- **INV-005 Alerts and scanning** — reorder thresholds, low-stock and expiry alerts, scanner-driven
  receiving and counting screens.
- **CUST-001** — customer sign-up/sign-in, verification, addresses (KSA national address, Egyptian
  governorates), consent records, export and erasure/anonymisation requests (PDPL).
- **PRC-001** — tax rates with effective dates per country; inclusive/exclusive; half-up per line;
  totals; snapshots.
- **SHIP-001** — zones by country/city, methods, fees, COD availability.
- **ORD-001** — guest/registered carts, live validation, checkout, order numbers per country, snapshots,
  reservation, failure recovery.
- **ORD-002** — documented state machine and history, cancellation with authorisation, notes, search,
  customer tracking, notifications (provider needed for e-mail/SMS).
- **STORE-002** — per-market seller identification (legal name, address, contact, CR, VAT/tax number),
  terms, returns and privacy pages (KSA-COM-01, PDPL); required before live sales.
- **PAY-001** — provider interface, clearly labelled manual/mock adapter (never active in production),
  COD and bank-transfer verification with evidence, webhook signature checks and event deduplication.
- **PAY-002** — real provider per market after documenting the provider, official API, credentials,
  market support and sandbox procedure. **Blocked** on selection and credentials.
- **SHIP-002, RET-001** — carrier interface, shipments, tracking, failed deliveries; returns with
  inspection and disposition (sellable, damaged, quarantined, supplier return) and refunds.
- **POS-001, POS-002** — online-only POS: lookup, scanning, tenders, receipts, discounts by permission,
  returns; cashier sessions with drawer reconciliation.
- **INVC-001** — invoice and credit-note documents, sequences per entity, tax breakdowns, seller/buyer
  details, storage.
- **EINV-001 / EINV-002** — adapters producing authority formats with configuration checklists;
  sandbox validation when credentials exist; live submission blocked on onboarding (KSA-EINV-02,
  EG-EINV-01/02). Nothing is reported as submitted without an authority acknowledgement.
- **FIN-001…003, PUR-003** — chart of accounts, periods, balanced immutable journals, expenses,
  inventory cost and COGS per ADR-018, supplier invoices/returns/payments/balances.
- **CRM-001, LOY-001, MKT-001, REV-001, SETL-001** — segmentation and notes, loyalty ledger, coupons
  and promotions with stacking rules, reviews with moderation, COD and supplier settlements.
- **RPT-001, AUD-002, INT-001, AI-001** — reports with written KPI definitions, audit retention and
  export, versioned integration API with scoped API clients, idempotency and signed webhooks, AI
  features that propose rather than bypass.
- **REL-001, SEC-003, OPS-003** — release verification suite, security review, hosting with backups and
  restore drills, monitoring on `/api/health`.
- **CAT-002** — refuse `952…` GTINs in production (GS1: demo numbers must never identify real items).
- **CAT-003** — CSV/XLSX import with row-level validation and dry run; export of the catalogue.
- **OPS-002** — S3-compatible `FileStorage` adapter.
- **SEC-002** — TOTP MFA for staff; mandatory for Super Admin and finance roles.
- **SEC-001** — `npm audit`: 5 high in development-only tooling (`braces` via the Next.js ESLint plugin
  chain); production dependencies 0. Update when upstream fixes; do not force-downgrade.
