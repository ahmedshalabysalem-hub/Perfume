# Project status

_Last updated: 2026-10-21 — session 1_

**Phase:** 1 — Foundation and catalogue vertical slice. M1.1 and M1.2 done; closing M1.3 (documents, CI).

**Current task:** GOV-001 (governance files) → then COMP-001, DOC-001, OPS-001, CI-001, DOC-002, DOC-003.

## Completed milestones

- **M0 Bootstrap** — Next.js 16.4 / React 19 / TS 5.9 strict / Tailwind 4 / Prisma 7 / PostgreSQL 16 /
  Better Auth 1.7 / next-intl 4 / Vitest 5 / Playwright 1.64.
- **M1.1 Foundation** — staff auth with DB sessions, scoped RBAC (48 permissions, 12 roles), append-only
  audit log, Arabic/English with RTL/LTR, organisation setup, admin shell and dashboard, staff management.
- **M1.2 Catalogue slice** — brands, categories, fragrance attributes, products, variants (SKU, verified
  GTIN or internal Code 128), per-market prices in SAR/EGP, images, compliance references, barcode labels,
  publish workflow; read-only storefront per market with search, filters, product pages, sitemap.

## Verification evidence (2026-10-21)

- `npx tsc --noEmit`, `npx eslint --max-warnings=0 .`, `npx prettier --check .` — clean.
- `npx vitest run` — 10 files, 108 tests passed (unit 50, integration 58).
- `npx playwright test` (production build) — 13/14 passed; the failure was a wrong test assumption
  (browser language), fixed; the storefront spec then passed 7/7. Full 16-test run pending this session.
- `next build` — succeeded inside the e2e run.
- `npm audit --omit=dev` — 0 vulnerabilities; dev-only tooling has 5 high (SEC-001).

## Pending (priority order)

1. M1.3 closure: COMP-001, DOC-001, OPS-001, CI-001, DOC-002, DOC-003.
2. Phase 2 start: PUR-001 (independent CRUD), then INV-001 after ADR-018 review.

## Known defects and blockers

- Docker is unavailable in the build sandbox: `docker-compose.yml` (OPS-001) cannot be verified here.
- Government websites cannot be fetched directly from the sandbox; compliance research uses search
  results from official domains and needs human verification (COMP-001).
- Sandbox Chromium differs from Playwright 1.64's expected build; use `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
- External inputs needed later: legal-entity data (CR, VAT/tax numbers), payment and shipping providers,
  ZATCA and ETA onboarding credentials, final brand name (placeholder "Perfume House").

## Recent decisions

ADR-016 (password forms POST + hydration gate), ADR-017 (file-based governance), ADR-018 (weighted
average costing — **proposed**, needs finance confirmation). Full log: `docs/DECISIONS.md`.

## Next recommended action

Finish M1.3 in the order listed above, run `npm run verify` plus the full Playwright suite, push to the
session branch, then specify PUR-001 with `docs/TASK_TEMPLATE.md` and move it to Ready.
