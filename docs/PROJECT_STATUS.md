# Project status

_Last updated: 2026-10-22 — end of session 2_

**Phase:** 2 — Inventory and suppliers, in progress. Phase 1 complete except OPS-001 (docker-compose
needs one run on a machine with Docker).
**Merged (2026-10-22):** APR-001 approval framework (PR #2) and INV-001 stock ledger (PR #1).
**In review:** PUR-001 suppliers (PR #3). Merge order #2 → #1 → #3 and ADR numbering (019/020/021) in
`docs/SESSION_HANDOFF.md`.
**Next task:** INV-002 batches or INV-003 adjustments (both unblocked).

## Completed milestones

- **Phase 0** — stack chosen and documented (ADR-001…006), tooling, migrations, safe seed.
- **M1.1 Foundation** — staff auth with DB sessions, scoped RBAC (48 permissions, 12 roles), append-only
  audit log, Arabic/English with RTL/LTR, organisation setup, admin shell, dashboard, staff management.
- **M1.2 Catalogue slice** — brands, categories, fragrance attributes, products, variants (SKU, verified
  GTIN or internal Code 128), per-market prices (SAR/EGP), images, regulatory references, labels,
  publish workflow; read-only storefront per market with search, filters, product pages, sitemap.
- **M1.3 Closure** — governance files, compliance register, README, CI pipeline, full documentation set,
  original brief preserved in `docs/reference/ORIGINAL_BRIEF.md`.
- **M2.1 Stock ledger (INV-001, merged)** — append-only movement ledger and per-status balances
  (ADR-020), concurrency-safe posting service with idempotency keys, opening balances, stock overview
  and per-variant movement history in Arabic and English.
- **APR-001 Approvals** (session 2) — shared maker-checker workflow: requests with resolved scope and
  append-only history, requester can never decide their own request (service + CHECK), scoped
  approvers, one pending request per subject, final and race-safe decisions (ADR-019). No screens yet:
  each consuming module (INV-003, PUR-002, RET-001) adds its own.
- **PUR-001 Suppliers (in review)** — supplier profiles per buying legal entity, tax-number checks by the
  supplier's country, payment terms, contacts, supplier product codes with dated last costs, new
  `suppliers.view` permission, Procurement → Suppliers pages in both languages (ADR-021).

## Verification evidence

- Session 2, APR-001 commit `436a974`: `npm run verify` (lint, typecheck, 131 tests, build) passed;
  `prettier --check .` clean; `prisma migrate diff` shows no drift.
- Session 2, INV-001 branch `claude/project-thread-qunsge`: lint, typecheck, `npx prettier --check .`,
  138 Vitest tests (53 unit, 85 integration), build and **18/18 Playwright** tests — all passed.
- Session 2, PUR-001 commit `603582f`: lint, Prettier check, typecheck, 128 Vitest tests (56 unit,
  72 integration), build and **18/18 Playwright** tests — all passed.
- Session 2, INV-001 after merging the base with APR-001: fresh databases, deploy (3 migrations), seed, no
  drift; lint, Prettier check, typecheck, 161 Vitest tests, build and **18/18 Playwright** — all passed;
  CI green on PR #1 (`3ce46c9`) before it was merged.
- Session 2, local reconciliation of all three PRs (base + #2 + #1 + #3 with ADRs renumbered): fresh
  databases, `db:deploy` (4 migrations) and seed, no schema drift; lint, Prettier check, typecheck,
  181 Vitest tests (63 unit, 118 integration), build and **20/20 Playwright** tests — all passed.
- CI run 1 ([39681695967](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39681695967),
  commit `25b1b15`): lint, format, typecheck, 108 Vitest tests, build and **16/16 Playwright** tests on a
  clean runner — all green.
- CI run 2 ([39683660413](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39683660413),
  commit `f23858a`, with actions v5 and the masked secret): all steps green.
- Session 1, local: `npm run verify` (lint, typecheck, 108 tests, build) passed; build warning
  about whole-project tracing fixed and re-built without warnings.
- `npm audit --omit=dev`: 0 vulnerabilities; dev-only tooling: 5 high (SEC-001).

## Known defects and blockers

- OPS-001 unverified (no Docker in the build sandbox).
- Test gaps: sign-in rate limiting, image upload, label page
  (`docs/TEST_PLAN.md` §Known gaps).
- Compliance summaries come from official-domain search extracts; documents must be re-read and
  reviewed by advisors (`docs/COUNTRY_COMPLIANCE.md`).
- Suppliers can only be priced in SAR or EGP until foreign currencies are added to reference data.
- External inputs needed later: legal-entity data, payment and shipping providers, ZATCA/ETA onboarding,
  accountant confirmation of ADR-018, final brand name.

## Recent decisions

ADR-019 generic maker-checker approvals · ADR-020 stock ledger (per-status balances, conditional
updates, posting keys) · ADR-021 suppliers belong to a buying legal entity; last costs keep their
currency · ADR-016 password forms POST + hydration gate · ADR-017 file-based governance ·
ADR-018 weighted average
cost (**proposed**) · plan re-aligned to the brief's phase numbering with documented sequencing
deviations (`docs/IMPLEMENTATION_PLAN.md`).

## Next recommended action

Merge PUR-001 (PR #3) once CI is green (PR #2 and PR #1 are merged). INV-003
adjustments/counts/transfers (needs both) and, with PUR-001 and INV-002, PUR-002 purchase orders.
