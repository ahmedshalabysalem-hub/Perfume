# Project status

_Last updated: 2026-10-22 — session 3 (workflow audit)_

**Phase:** 2 — Inventory and suppliers, in progress. Phase 1 done (OPS-001 validated 2026-10-22).
**Next task:** **INV-002 — Batches/lots, inspection and quarantine, expiry** (Ready, full spec in
`docs/TASK_BOARD.md`, effort: highest).

## Completed

- **Phase 0** — stack chosen and documented (ADR-001…006), tooling, migrations, safe seed.
- **M1.1 Foundation** — staff auth with DB sessions, scoped RBAC, append-only audit log, Arabic/English
  with RTL/LTR, organisation setup, admin shell, dashboard, staff management.
- **M1.2 Catalogue slice** — brands, categories, fragrance attributes, products, variants (SKU, verified
  GTIN or internal Code 128), per-market prices (SAR/EGP), images, regulatory references, labels,
  publish workflow; read-only storefront per market with search, filters, product pages, sitemap.
- **M1.3 Closure** — governance files, compliance register, README, CI pipeline, documentation set,
  original brief preserved in `docs/reference/ORIGINAL_BRIEF.md`.
- **APR-001 Approvals** (PR #2, ADR-019) — shared maker-checker service; requester never decides their
  own request; scoped approvers; race-safe decisions. No screens: each consuming module adds its own.
- **INV-001 Stock ledger** (PR #1, ADR-020) — append-only movements, per-status balances, concurrency-
  safe posting with idempotency keys, opening balances, stock overview and movement history.
- **PUR-001 Suppliers** (PR #3, ADR-021) — supplier profiles per buying legal entity, contacts, supplier
  product codes with dated last costs, `suppliers.view`, Procurement → Suppliers pages.
- **Workflow audit** (session 3, ADR-022) — roles, effort and review policy in `CLAUDE.md`; INV-002
  specified; plan, board, PRD and status files reconciled with the merged code.

## In progress

Nothing. No task is In Progress or in Review.

## Pending (Phase 2, in order)

INV-002 (Ready) → INV-003 adjustments/counts/transfers and PUR-002 purchase orders → INV-004
reservations, INV-005 alerts and scanning. Later phases: `docs/IMPLEMENTATION_PLAN.md`.

## Blockers and open decisions

- **Design, before PUR-002:** how a purchase price (NUMERIC(14,2), ADR-021) and landed cost become a
  ledger unit cost (NUMERIC(19,4), ADR-020) — precision, rounding, currency conversion.
- **Business:** accountant confirmation of ADR-018 (weighted average cost) before FIN-001 — request
  DR-009 in `docs/DECISION_REQUESTS.md`, Open (only a simulated test answer, not approval); payment and
  shipping provider selection (PAY-002 Blocked); ZATCA/ETA onboarding; legal-entity data; final brand
  name; foreign purchasing currencies (suppliers priced only in SAR/EGP today).
- **Compliance:** summaries in `docs/COUNTRY_COMPLIANCE.md` still need advisor review. Nothing is
  implemented for e-invoicing, payments or shipping integrations.
- **Test gaps:** no Critical; High G1–G4 (sign-in rate limiting, image upload, opposite-order
  concurrent postings, migrations on populated data) tracked as QA-003 in `docs/TEST_PLAN.md`.

## Verification evidence

- Session 4 (OPS-001, QA-002), base `812fffc`: Docker 29.9.1 + Compose 5.6 in the sandbox;
  `docker compose up` healthy (PostgreSQL 16.15 alpine), init created `perfume_test`/`perfume_e2e`,
  4 migrations, no drift, seed, `/api/health` 200 (503 with the database stopped), data kept across a
  restart; 193 Vitest tests and 20/20 Playwright tests on the Docker database; lint, typecheck, Prettier.
- Base `e792497` (all three PRs merged): CI run
  [39748414159](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39748414159) green.
- Session 3, on `e792497` plus documentation changes: `npm run lint`, `npm run typecheck`, `npm test`
  (16 files, 181 Vitest tests) and `npx prettier --check` on the changed docs — all passed.
- Session 2, all three PRs reconciled locally: fresh databases, 4 migrations, seed, no drift; lint,
  Prettier, typecheck, 181 Vitest tests, build and 20/20 Playwright tests passed.
- `npm audit --omit=dev`: 0 vulnerabilities at session 1; dev-only tooling: 5 high (SEC-001).

## Recent decisions

ADR-019 approvals · ADR-020 stock ledger · ADR-021 suppliers · ADR-022 task workflow (roles in one
session, effort and review by risk) · ADR-018 weighted average cost (**Proposed**).
