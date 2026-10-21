# Project status

_Last updated: 2026-10-21 — end of session 1_

**Phase:** 1 complete except OPS-001 (docker-compose needs one run on a machine with Docker).
**Next phase:** 2 — Inventory and suppliers. **Next task:** INV-001 (Ready, spec in `docs/TASK_BOARD.md`).

## Completed milestones

- **Phase 0** — stack chosen and documented (ADR-001…006), tooling, migrations, safe seed.
- **M1.1 Foundation** — staff auth with DB sessions, scoped RBAC (48 permissions, 12 roles), append-only
  audit log, Arabic/English with RTL/LTR, organisation setup, admin shell, dashboard, staff management.
- **M1.2 Catalogue slice** — brands, categories, fragrance attributes, products, variants (SKU, verified
  GTIN or internal Code 128), per-market prices (SAR/EGP), images, regulatory references, labels,
  publish workflow; read-only storefront per market with search, filters, product pages, sitemap.
- **M1.3 Closure** — governance files, compliance register, README, CI pipeline, full documentation set,
  original brief preserved in `docs/reference/ORIGINAL_BRIEF.md`.

## Verification evidence

- CI run 1 ([39681695967](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39681695967),
  commit `25b1b15`): lint, format, typecheck, 108 Vitest tests, build and **16/16 Playwright** tests on a
  clean runner — all green.
- CI run 2 ([39683660413](https://github.com/ahmedshalabysalem-hub/Perfume/actions/runs/39683660413),
  commit `f23858a`, with actions v5 and the masked secret): all steps green.
- Local, end of session: `npm run verify` (lint, typecheck, 108 tests, build) passed; build warning
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

ADR-016 password forms POST + hydration gate · ADR-017 file-based governance · ADR-018 weighted average
cost (**proposed**) · plan re-aligned to the brief's phase numbering with documented sequencing
deviations (`docs/IMPLEMENTATION_PLAN.md`).

## Next recommended action

Start INV-001 at highest effort: write its design ADR (balance granularity, cost precision, locking,
idempotency), then the migration, the posting service with concurrency tests, the opening-balance flow
and the stock pages.
