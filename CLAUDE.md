# CLAUDE.md — Perfume Commerce (Saudi Arabia & Egypt)

Private-inventory perfume e-commerce and retail management system (catalogue, inventory, orders, POS,
accounting) for Saudi Arabia (SAR) and Egypt (EGP). Arabic (RTL, default) and English (LTR). One company
selling its own stock — **not a marketplace**. Next.js 16 notes that override training data: `AGENTS.md`.

## Start of every session

1. Read `docs/PROJECT_STATUS.md`, then `docs/SESSION_HANDOFF.md` (it names the next task).
2. Read that task's entry in `docs/TASK_BOARD.md` — not the whole board, not every doc.
3. Run `git status` and `git log --oneline -5`. Verify claimed state from code and tests, not from notes.
4. Open only the files the task touches. Consult `docs/DECISIONS.md` before revisiting a design choice.

## Architecture principles (detail: `docs/ARCHITECTURE.md`)

- Modular monolith: App Router pages → thin Server Actions (`src/app/**/actions.ts`) → services
  (`src/server/modules/*`) → Prisma → PostgreSQL. Business rules live in services, never in components.
- Authorization is enforced server-side in every service (`assertCan`), scoped by country/entity/store/
  warehouse. Layouts and hidden buttons are not security. The actor is reloaded on every request.
- Every state change writes an audit entry in the same transaction (`recordAudit`); the log is append-only.
- Money is PostgreSQL `NUMERIC` and exact decimal strings in TypeScript. No floats; excess precision is
  rejected, not rounded. Prices are per market (country) in that market's currency.
- Shared Zod schemas (`src/lib/schemas`) validate on client and server; the server is authoritative.
- No hard deletes of business records — status lifecycles (deactivate/discontinue) instead.
- Never invent GS1 GTINs. Prefix `952` only in demo/test data; internal codes are Code 128 `PF…`.
- Never fake integrations, payments or compliance (ZATCA, ETA, SFDA, EDA). Not implemented ⇒ say so.

## Stack and constraints

Next.js 16.4 (App Router, `src/proxy.ts`, async params) · React 19 · TypeScript 5.9 strict · Tailwind 4 +
hand-written shadcn-style components · React Hook Form + Zod 4 · Prisma 7 (`prisma-client` generator →
`src/generated/prisma`, `@prisma/adapter-pg`, schema folder `prisma/schema`) · PostgreSQL 16 · Better Auth
1.7 · next-intl 4 · Vitest 5 · Playwright 1.64.

- Prisma 7 does not generate or seed on `migrate dev`: run `npx prisma generate` after schema changes.
- CHECK constraints and triggers live in raw SQL in migrations (Prisma does not diff them).
- AI agents must not run `prisma migrate reset`; Prisma blocks it and the guard must not be bypassed.
  Tests use `migrate deploy` plus truncation of name-guarded test databases.
- This sandbox: start PostgreSQL with `service postgresql start`; for Playwright set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`.

## Commands

`npm run dev` · `lint` · `typecheck` · `test` (unit + integration) · `test:e2e` · `build` · `verify`
(lint + typecheck + test + build) · `db:deploy` · `db:seed` · `db:sync-rbac` — setup in `README.md`.

## Working rules

- One primary task at a time, scoped by its board entry. Split a task that grows; record new tasks.
- Reuse existing services and components. No speculative features or refactors outside scope.
- Record decisions that constrain future work in `docs/DECISIONS.md`; do not reopen settled ones
  without new facts.
- Every rule or authorization change gets unit/integration tests; user-visible flows get e2e coverage.
- A task is Done only with evidence: lint, typecheck, relevant tests (full suites at milestone ends),
  build when routes or config change. Report failures as failures.
- Security: never commit `.env` or secrets, never log passwords/tokens, never store card data, never
  weaken authorization for a demo.
- Git: focused commits with descriptive messages; push only to the designated session branch; no
  force-push; never discard uncommitted work without permission.

## Roles, effort and review (ADR-022)

- Roles are responsibilities, not separate agents; one session normally covers all three.
  **Director:** picks the next Ready task, checks dependencies, completes the spec and acceptance
  criteria, keeps the architecture consistent, reviews the result, updates status/board/handoff.
  **Implementer:** reads the spec and the code it touches, implements, writes tests, reports actual
  results. **Reviewer/QA:** checks every acceptance criterion, authorization and data integrity, reads
  the diff, runs the tests, names regressions and gaps.
- Review depth follows risk: routine work — self-review of the diff plus the checks; high and highest
  effort — a separate review pass against the acceptance criteria before the task is Done.
- Subagents only for genuinely independent work, given only their task's context; never two agents on
  the same files or migrations. Parallel threads each keep their own handoff section; ADR numbers and
  the shared status files are reconciled at merge.
- Effort is a recommendation per task (`Effort` field on the board): **normal** — CRUD, form validation,
  UI styling, simple fixes, doc formatting; **high** — schema and relationship design, architecture,
  complex business rules, authorization, integration design; **highest** — payments, financial
  consistency, inventory concurrency, security-sensitive changes, destructive migrations, production
  data recovery, hard production defects. The model and effort setting are chosen by the person in
  the app; nothing switches them by task, so never claim to have changed them.
- Report results and evidence, not narration; do not repeat analysis already recorded in the docs.

## End of every session

Run the checks above, review `git diff`, then update `docs/TASK_BOARD.md`, `docs/PROJECT_STATUS.md`
and `docs/SESSION_HANDOFF.md` (changes, checks actually run, open issues, next exact task). Replace
stale entries rather than appending; the handoff describes the latest state, git keeps the history.
Report with the completion format in `docs/TASK_TEMPLATE.md`.

## Documentation map

| Need                   | File                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| State, next action     | `docs/PROJECT_STATUS.md`, `docs/SESSION_HANDOFF.md`                                                                                                  |
| Tasks and roadmap      | `docs/TASK_BOARD.md`, `docs/IMPLEMENTATION_PLAN.md`                                                                                                  |
| Decisions              | `docs/DECISIONS.md`; open business questions `docs/DECISION_REQUESTS.md`                                                                             |
| Requirements and rules | `docs/PRD.md`, `docs/BUSINESS_RULES.md`, `docs/COUNTRY_COMPLIANCE.md`; original brief (verbatim, read by section) `docs/reference/ORIGINAL_BRIEF.md` |
| Design                 | `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/ERD.md`, `docs/RBAC.md`, `docs/API_SPEC.md`                                                        |
| Testing                | `docs/TEST_PLAN.md`                                                                                                                                  |
| New task specification | `docs/TASK_TEMPLATE.md`                                                                                                                              |
