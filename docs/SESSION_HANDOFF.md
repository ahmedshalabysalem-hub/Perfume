# Session handoff

_Session 1 — 2026-10-21 — branch `ccr-04855f0a-4t6vb0`_

## Completed in this session

- Phase 1 implementation (foundation, catalogue, storefront, e2e) — commits `4767a8f` … `e6c131f`.
- GOV-001 governance system; COMP-001 compliance register; DOC-001 README; CI-001 pipeline (green);
  OPS-001 docker-compose (unverified); DOC-002 PRD/architecture/business rules; DOC-003 database, ERD,
  RBAC, API spec, test plan; original brief preserved verbatim.
- Plan and board re-aligned to the brief's phases 0–8; INV-001 fully specified (Ready).
- Fixes: CI secret masked and actions moved to v5; build no longer traces the whole project
  (`src/server/storage/storage.ts`); dashboard KPI comment points to `docs/BUSINESS_RULES.md`.

## Files created or changed (this governance/documentation round)

`CLAUDE.md`, `README.md`, `docker-compose.yml`, `docker/postgres/init/01-test-databases.sql`,
`.github/workflows/ci.yml`, `.prettierignore`, `docs/*.md` (PROJECT_STATUS, SESSION_HANDOFF,
TASK_BOARD, TASK_TEMPLATE, IMPLEMENTATION_PLAN, DECISIONS, COUNTRY_COMPLIANCE, PRD, ARCHITECTURE,
BUSINESS_RULES, DATABASE, ERD, RBAC, API_SPEC, TEST_PLAN), `docs/reference/ORIGINAL_BRIEF.md`,
`src/server/storage/storage.ts`, `src/server/modules/dashboard/dashboard.service.ts`.

## Checks actually run

- `npm ci`, `npm run db:deploy`, `npm run db:sync-rbac`, `npm run db:seed` (second run: nothing created).
- `npm run verify` — passed (108 tests). `npm run build` again after the storage fix — passed, 0 warnings.
- `npx prettier --check .` — clean. YAML of CI and compose parsed with js-yaml.
- CI run 1 on `25b1b15` — all steps green, 16/16 e2e. (A second run is triggered by this session's
  final push; check it at the start of the next session.)

## Unresolved

- OPS-001 needs `docker compose up -d` on a machine with Docker.
- Test gaps listed in `docs/TEST_PLAN.md`.
- ADR-018 needs an accountant's confirmation before FIN-001 (not before INV-001).

## Next exact task

**INV-001 — Stock ledger and balances** (spec and acceptance criteria in `docs/TASK_BOARD.md`).
First step: record the design ADR, then the migration.

## Context that would otherwise be lost

- After a container restart run `service postgresql start`. Databases: `perfume_dev`, `perfume_test`,
  `perfume_e2e` (role `perfume` with CREATEDB; password in the local, uncommitted `.env`).
- Playwright here: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`; reuse an existing build
  with `E2E_SERVER_COMMAND="npm run start -- --port 3100"`.
- Next.js maintains `AGENTS.md`; keep it committed.
- `docs/reference/ORIGINAL_BRIEF.md` is excluded from Prettier on purpose (verbatim copy).
