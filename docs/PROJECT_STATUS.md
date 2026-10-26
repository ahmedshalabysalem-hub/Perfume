# Project status

_Last updated: 2026-10-22 — end of session 4 (complete handoff; INV-002 merged)_

**Phase:** 2 — Inventory and suppliers, in progress. Phase 1 done (OPS-001 validated 2026-10-22).
**Next task:** **INV-006** (DR-011 decided as Option A: a release restores only inspection-held
stock), then **PUR-002** (spec first) or INV-003. Details and prerequisites: `docs/SESSION_HANDOFF.md`. No open PRs.

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
- **INV-002 Batches, inspection and expiry** (PR #5, ADR-023, merge `4210b62`) — batches per company,
  inspection and verification, expiry with DAY/MONTH precision, LEGACY carry-over, one shared sale
  eligibility rule in the ledger, services and database; balance keys immutable; independent review
  passed.
- **I18N-002 Localization gaps** (parallel thread, 2026-10-22) — the language choice lasts a year
  (cookie) and is saved on the signed-in user's account (`users.preferred_locale`, no schema change);
  the switcher names both languages and warns before discarding unsaved form input; audit actions and
  permission modules are translated; batch dates use Latin digits (ADR-009); no sideways scroll on
  phones. Language never changes market, currency or prices (e2e `i18n.spec.ts`).
- **OPS-001, QA-002** (PR #6) — Docker Compose validated and in CI; test-gap assessment.
- **ADR-018 and ADR-024 Accepted** (PRs #7–#9) — by Ahmed as owner; accounting approvals come from
  the accountant or the owner, chosen per request.
- **Workflow audit** (session 3, ADR-022) — roles, effort and review policy in `CLAUDE.md`; INV-002
  specified; plan, board, PRD and status files reconciled with the merged code.

## In progress

UX-000 audit (`docs/UI_UX_AUDIT.md`) and UX-001 inventory status clarity are in review in one PR;
INV-006 starts after it merges. UX-002…UX-005 are Backlog.

## Pending (Phase 2, in order)

INV-006 (DR-011) → PUR-002 purchase orders and INV-003 adjustments/counts/transfers → INV-004
reservations, INV-005 alerts and scanning. Later phases: `docs/IMPLEMENTATION_PLAN.md`.

## Blockers and open decisions

- **Business:** ADR-018 costing and ADR-024 precision are Accepted (approved by Ahmed as owner,
  2026-10-22; accounting approvals come from the accountant or the owner, chosen per request); payment and
  shipping provider selection (PAY-002 Blocked); ZATCA/ETA onboarding; legal-entity data; final brand
  name; foreign purchasing currencies (suppliers priced only in SAR/EGP today).
- **Compliance:** summaries in `docs/COUNTRY_COMPLIANCE.md` still need advisor review. Nothing is
  implemented for e-invoicing, payments or shipping integrations.
- **Test gaps:** no Critical; High G1–G2 (sign-in rate limiting, image upload) tracked as QA-003 in
  `docs/TEST_PLAN.md`; G3 and G4 closed by INV-002.
- **DR-011 decided (Option A, Ahmed, 2026-10-22), not yet implemented:** releasing a QUARANTINED batch
  still restores all of its quarantined stock, including damaged units, until INV-006 lands.
- **Repository:** the default branch is still named `ccr-04855f0a-4t6vb0`; renaming is the owner's call.

## Verification evidence

- Session 4, INV-002 merged as `4210b62`: CI green on the PR head `e77d4a7`; base CI run
  [39768475242](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39768475242) on the merge
  commit. Locally at `e77d4a7`: lint, typecheck, Prettier, `npm test` (246), build, 22 e2e.
- Session 4, INV-002 on PR #5 before review fixes (base `2cf04f0` merged in): `npm run lint`, `npm run typecheck`, Prettier,
  `npm test` (20 files, 245 tests: unit 82, integration incl. `batches.test.ts` 29 and
  `inventory-batches-migration.test.ts` 4), the opposite-order concurrency test 20 runs in a row,
  `npm run build` and `npm run test:e2e` (22 Playwright tests) — all passed. Migration also applied to
  a populated development database; `prisma migrate diff` reports no drift.

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
session, effort and review by risk) · ADR-018 weighted average cost (Accepted) · ADR-023 batches
(INV-002) · ADR-024 cost precision (Accepted).
