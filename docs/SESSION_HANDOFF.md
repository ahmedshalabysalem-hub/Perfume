# Session handoff

_Session 1 — 2026-10-21 — branch `ccr-04855f0a-4t6vb0` (in progress; updated at session end)_

## Completed this session

- Phase 1 foundation and catalogue slice (see `docs/PROJECT_STATUS.md`), storefront, Playwright e2e.
- Security fix: sign-in and change-password forms POST and stay disabled until hydrated (ADR-016).
- Governance files created (GOV-001): `CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/TASK_BOARD.md`,
  `docs/IMPLEMENTATION_PLAN.md`, `docs/DECISIONS.md`, `docs/TASK_TEMPLATE.md`, this file.

## Checks actually run

See "Verification evidence" in `docs/PROJECT_STATUS.md`.

## Unresolved

- Full 16-test Playwright run not yet repeated after the storefront spec fix.
- Documents still missing: COUNTRY_COMPLIANCE, README, PRD, ARCHITECTURE, BUSINESS_RULES, DATABASE,
  ERD, RBAC, API_SPEC, TEST_PLAN; docker-compose; CI workflow.

## Next exact task

COMP-001 — write `docs/COUNTRY_COMPLIANCE.md` (acceptance criteria in `docs/TASK_BOARD.md`).

## Context that would otherwise be lost

- Restarted containers stop PostgreSQL: run `service postgresql start`. Databases: `perfume_dev`,
  `perfume_test`, `perfume_e2e` (user `perfume`, password from local `.env`, which is not committed).
- e2e against an existing build: `E2E_SERVER_COMMAND="npm run start -- --port 3100"` skips `next build`.
- Compliance research results (official domains, checked 2026-10-21): ZATCA e-invoicing guidelines and
  FAQ, ETA eInvoicing/eReceipt SDK, SFDA cosmetics notification guidance, EDA cosmetics notification guide
  (2023), ZATCA VAT guidelines (15 %, VAT-inclusive display), Egypt VAT law 67/2016 (14 %), SDAIA PDPL
  transfer regulation, Egypt PDPC portal, MoC consumer guide (7-day return), GS1 952 demo prefix.
