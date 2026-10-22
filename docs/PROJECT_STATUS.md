# Project status

_Last updated: 2026-10-22 — end of session 2_

**Phase:** 2 — Inventory and suppliers, in progress. Phase 1 complete except OPS-001 (docker-compose
needs one run on a machine with Docker).
**Current:** INV-001 stock ledger implemented, in Review (PR from `claude/project-thread-qunsge`).
**Next task:** APR-001 approval workflow (needs its spec first), then INV-002/INV-003/INV-004.

## Completed milestones

- **Phase 0** — stack chosen and documented (ADR-001…006), tooling, migrations, safe seed.
- **M1.1 Foundation** — staff auth with DB sessions, scoped RBAC (48 permissions, 12 roles), append-only
  audit log, Arabic/English with RTL/LTR, organisation setup, admin shell, dashboard, staff management.
- **M1.2 Catalogue slice** — brands, categories, fragrance attributes, products, variants (SKU, verified
  GTIN or internal Code 128), per-market prices (SAR/EGP), images, regulatory references, labels,
  publish workflow; read-only storefront per market with search, filters, product pages, sitemap.
- **M1.3 Closure** — governance files, compliance register, README, CI pipeline, full documentation set,
  original brief preserved in `docs/reference/ORIGINAL_BRIEF.md`.
- **M2.1 Stock ledger (INV-001, in review)** — append-only movement ledger and per-status balances
  (ADR-020), concurrency-safe posting service with idempotency keys, opening balances, stock overview
  and per-variant movement history in Arabic and English.

## Verification evidence

- Session 2, local, branch `claude/project-thread-qunsge`: lint, typecheck, `npx prettier --check .`,
  138 Vitest tests (53 unit, 85 integration), build and **18/18 Playwright** tests — all passed. CI has
  not yet run on this branch.
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
- Test gaps: sign-in rate limiting, image upload, label page, Egyptian tax-number rule
  (`docs/TEST_PLAN.md` §Known gaps).
- Compliance summaries come from official-domain search extracts; documents must be re-read and
  reviewed by advisors (`docs/COUNTRY_COMPLIANCE.md`).
- External inputs needed later: legal-entity data, payment and shipping providers, ZATCA/ETA onboarding,
  accountant confirmation of ADR-018, final brand name.

## Recent decisions

ADR-020 stock ledger (per-status balances, conditional updates, posting keys) ·
ADR-016 password forms POST + hydration gate · ADR-017 file-based governance · ADR-018 weighted average
cost (**proposed**) · plan re-aligned to the brief's phase numbering with documented sequencing
deviations (`docs/IMPLEMENTATION_PLAN.md`).

## Next recommended action

Merge the INV-001 PR once CI is green. Then specify and build APR-001 (approval workflow), which
unblocks INV-003 adjustments/counts/transfers and PUR-002 purchase orders; INV-002 batches and PUR-001
suppliers can proceed in parallel.
