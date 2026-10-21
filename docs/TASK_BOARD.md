# Task board

Statuses: **Backlog** → **Ready** (spec complete, dependencies met) → **In Progress** → **Review** →
**Done**; **Blocked** when an external input is missing. Priority: **P0** blocks release · **P1** current
phase · **P2** next phase · **P3** later. New tasks use `docs/TASK_TEMPLATE.md`. Change a status only
with evidence (commands run, tests passing). Phases and milestones: `docs/IMPLEMENTATION_PLAN.md`.

## Open tasks

| ID        | Title                                                     | Status  | Pri               | Depends on                                   |
| --------- | --------------------------------------------------------- | ------- | ----------------- | -------------------------------------------- |
| GOV-001   | Project governance and session handoff                    | Done    | P1                | —                                            |
| COMP-001  | Country compliance register (KSA, Egypt)                  | Done    | P1                | —                                            |
| DOC-001   | README and local development setup                        | Ready   | P1                | —                                            |
| OPS-001   | docker-compose for local PostgreSQL                       | Ready   | P1                | —                                            |
| CI-001    | GitHub Actions CI pipeline                                | Ready   | P1                | —                                            |
| DOC-002   | PRD, architecture and business rules documents            | Ready   | P1                | —                                            |
| DOC-003   | Database, ERD, RBAC, API spec and test plan documents     | Ready   | P1                | —                                            |
| PUR-001   | Supplier register                                         | Backlog | P2                | Phase 1 closed                               |
| INV-001   | Inventory ledger and stock levels                         | Backlog | P2                | Phase 1 closed, ADR-018                      |
| INV-002   | Batches, lots and expiry (FEFO)                           | Backlog | P2                | INV-001                                      |
| PUR-002   | Purchase orders and goods receipt                         | Backlog | P2                | INV-001, PUR-001                             |
| INV-003   | Stock transfers and stock counts                          | Backlog | P2                | INV-001                                      |
| CAT-002   | Refuse GS1 demo-range barcodes outside development/test   | Backlog | P2                | —                                            |
| OPS-002   | S3-compatible storage adapter                             | Backlog | P2                | —                                            |
| SEC-002   | Multi-factor authentication for staff                     | Backlog | P2                | —                                            |
| PRC-001   | Tax rates and price calculation engine                    | Backlog | P2                | CAT-001                                      |
| CUST-001  | Customer accounts, addresses and consent                  | Backlog | P2                | AUTH-001, COMP-001                           |
| SHIP-001  | Shipping zones, methods and fees                          | Backlog | P2                | ORG-001                                      |
| STORE-002 | Seller identification and legal pages per market          | Backlog | P2                | ORG-001, COMP-001                            |
| ORD-001   | Cart, checkout and order lifecycle with stock reservation | Backlog | P2                | INV-001, PRC-001, CUST-001, SHIP-001         |
| PAY-001   | Cash on delivery and bank-transfer verification           | Backlog | P2                | ORD-001                                      |
| PAY-002   | Online card payments via a payment provider               | Blocked | P2                | PAY-001; provider + credentials              |
| ORD-002   | Fulfilment, returns and refunds                           | Backlog | P2                | ORD-001, PAY-001                             |
| POS-001   | Point of sale and cashier sessions                        | Backlog | P3                | INV-001, PRC-001, PAY-001                    |
| FIN-001   | Accounting foundation (chart of accounts, journals)       | Backlog | P3                | ADR-018 confirmed, ORD-001, PUR-002, POS-001 |
| EINV-001  | ZATCA e-invoicing (FATOORA, integration phase)            | Blocked | P3                | ORD-001, POS-001, PRC-001; ZATCA onboarding  |
| EINV-002  | Egypt ETA e-invoice and e-receipt                         | Blocked | P3                | ORD-001, POS-001, PRC-001; ETA registration  |
| MKT-001   | Coupons and promotions                                    | Backlog | P3                | PRC-001, ORD-001                             |
| LOY-001   | Loyalty points                                            | Backlog | P3                | ORD-001, POS-001                             |
| RPT-001   | Operational and financial reports                         | Backlog | P3                | FIN-001 (financial part)                     |
| INT-001   | Integration API and webhooks (n8n)                        | Backlog | P3                | ORD-001                                      |
| AI-001    | AI-assisted features behind business rules                | Backlog | P3                | INT-001                                      |
| OPS-003   | Production deployment, backups and observability          | Backlog | P1 before release | OPS-002                                      |
| SEC-003   | Pre-release security review                               | Backlog | P0 before release | all release scope                            |
| SEC-001   | Dev-dependency audit follow-up                            | Backlog | P3                | —                                            |

## Done

Commits are where the work landed; tests are the evidence that it still holds.

| ID        | Title                                                                                                                         | Commits                         | Evidence                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| BOOT-001  | Next.js 16 + TS strict + Tailwind 4 + ESLint/Prettier bootstrap                                                               | `4767a8f`                       | lint, typecheck, format check clean                                                                      |
| DB-001    | Schema (27 tables), migration with 29 CHECKs + 3 audit triggers, safe seed                                                    | `4767a8f`                       | integration suites run on `migrate deploy`                                                               |
| AUTH-001  | Staff sign-in/out, DB sessions, rate limit, password policy, change password                                                  | `6513a01`, `648acd9`, `e6c131f` | `tests/integration/auth.test.ts` (6), e2e `auth.spec.ts` (3)                                             |
| AUTH-002  | RBAC: 48 permissions, 12 roles, scoped assignments, escalation guard                                                          | `4767a8f`, `648acd9`            | `tests/unit/rbac.test.ts` (16), `access-and-organization.test.ts` (18), e2e `access-control.spec.ts` (2) |
| AUD-001   | Append-only audit log, same-transaction writes, redaction, viewer                                                             | `4767a8f`, `648acd9`            | audit rows asserted in integration suites; triggers verified by fixture purge                            |
| I18N-001  | Arabic RTL / English LTR, typed messages, parity test, negotiation                                                            | `6513a01`                       | `tests/unit/messages.test.ts` (3), e2e `storefront.spec.ts`                                              |
| ORG-001   | Countries, legal entities, stores, warehouses (scoped)                                                                        | `648acd9`                       | `access-and-organization.test.ts`                                                                        |
| ADM-001   | Admin shell, scoped navigation, dashboard KPIs                                                                                | `6513a01`                       | manual check of KPIs against seed; e2e access spec                                                       |
| ACC-001   | Staff users and role-assignment management                                                                                    | `648acd9`                       | `access-and-organization.test.ts`                                                                        |
| CAT-001   | Catalogue: brands, categories, attributes, products, variants, SKU/GTIN, market prices, images, compliance references, labels | `6513a01`, `1cb7076`            | `catalog.test.ts` (28), e2e `catalog.spec.ts` (4)                                                        |
| STORE-001 | Read-only storefront: market selection, listing, filters, product pages, sitemap                                              | `b1b2848`                       | `storefront.test.ts` (6), e2e `storefront.spec.ts` (7)                                                   |
| QA-001    | Vitest unit + integration and Playwright e2e infrastructure                                                                   | `4767a8f`, `e6c131f`            | 108 Vitest tests passing; e2e see `docs/PROJECT_STATUS.md`                                               |

---

## Ready task specifications

### GOV-001 — Project governance and session handoff

- **Objective:** A new session can resume work from files alone in a few minutes.
- **Scope:** `CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/TASK_BOARD.md`,
  `docs/DECISIONS.md`, `docs/SESSION_HANDOFF.md`, `docs/TASK_TEMPLATE.md`, reconciled with the code.
- **Out of scope:** Technical reference documents (DOC-002, DOC-003).
- **Acceptance:** Files exist; statuses match the repository and test evidence; the handoff names the
  next task; `CLAUDE.md` stays short and links to detail instead of copying it.
- **Verification:** Review against `git log`, test counts and file tree; Prettier check passes.

### COMP-001 — Country compliance register

- **Objective:** One register of regulatory requirements for KSA and Egypt that later tasks reference.
- **Scope:** `docs/COUNTRY_COMPLIANCE.md` covering VAT (ZATCA, ETA), e-invoicing (FATOORA phase 2; ETA
  e-invoice and e-receipt), cosmetics market authorisation (SFDA, EDA), e-commerce and consumer
  protection, personal data protection (PDPL, Egypt Law 151/2020), GS1 barcodes. Each entry: official
  source URL, date checked, requirement, implementation status, owning task, unresolved questions.
- **Out of scope:** Implementing any integration; legal advice.
- **Acceptance:** Every requirement cites an official source; nothing is marked compliant or integrated;
  how sources were accessed is disclosed; open questions are listed for a qualified advisor.
- **Security/data:** No credentials or taxpayer identifiers in the document.

### DOC-001 — README and local development setup

- **Objective:** A developer can install, migrate, seed, run and test the app from the README alone.
- **Scope:** `README.md` (purpose, stack, prerequisites, setup with Docker or a local PostgreSQL,
  environment variables, commands, demo accounts and how their password is set, tests, project layout,
  troubleshooting, links to docs). `.env.example` reviewed.
- **Acceptance:** Every command in the README exists in `package.json` or is a standard tool command and
  was executed in this repository at least once (or is explicitly marked unverified).

### OPS-001 — docker-compose for local PostgreSQL

- **Objective:** `docker compose up -d` provides the databases `.env.example` expects.
- **Scope:** `docker-compose.yml` (PostgreSQL 16, credentials matching `.env.example`, init script
  creating `perfume_test`/`perfume_e2e`, health check, named volume).
- **Acceptance:** Valid compose file; documented as **unverified** while Docker is unavailable in the
  build sandbox. Verify on a machine with Docker and record the result here.

### CI-001 — GitHub Actions CI pipeline

- **Objective:** Every push and pull request runs the same checks a developer runs locally.
- **Scope:** `.github/workflows/ci.yml`: Node from `.nvmrc`, `npm ci`, lint, typecheck, format check,
  unit + integration tests against a PostgreSQL 16 service, production build, Playwright e2e with
  browsers installed by `npx playwright install --with-deps chromium`; artefacts on failure.
- **Acceptance:** Workflow is syntactically valid and mirrors local commands; first remote run result is
  recorded in `docs/PROJECT_STATUS.md` (pass, or failure with cause).
- **Security:** Test-only secrets generated in the job; no repository secrets required.

### DOC-002 — PRD, architecture and business rules documents

- **Scope:** `docs/PRD.md` (vision, markets, personas, functional scope by module and phase, NFRs),
  `docs/ARCHITECTURE.md` (layers, modules, request flow, auth, authorization, audit, i18n, storefront,
  storage, security headers, error handling, integration and AI design boundaries),
  `docs/BUSINESS_RULES.md` (money, prices, tax display, lifecycles, publish rule, SKU/barcode policy,
  deletion policy, user lifecycle; planned rules clearly marked).
- **Acceptance:** Statements match the code; planned behaviour is labelled planned; decisions link to
  `docs/DECISIONS.md` rather than repeating them.

### DOC-003 — Database, ERD, RBAC, API spec and test plan documents

- **Scope:** `docs/DATABASE.md` (conventions, tables by domain, constraints, triggers, indexes,
  migration and seed workflow), `docs/ERD.md` (Mermaid), `docs/RBAC.md` (roles × permissions, scopes,
  rules), `docs/API_SPEC.md` (Server Actions and HTTP endpoints implemented; planned integration API),
  `docs/TEST_PLAN.md` (layers, commands, coverage map, gaps).
- **Acceptance:** Counts and names match the schema and code (27 tables, 29 CHECK constraints, 3 audit
  triggers, 48 permissions, 12 roles at the time of writing).

## Backlog task outlines

Turn an outline into a full specification (template) before moving it to Ready.

- **PUR-001 Supplier register** — suppliers with country, tax number, contacts, payment terms,
  active/inactive; scoped permissions (`suppliers.manage`); audit. Independent CRUD — good first Phase 2
  task while inventory design is reviewed.
- **INV-001 Inventory ledger** — append-only `stock_movements` (receipt, adjustment, transfer, sale,
  return, count correction) with unit cost; `stock_levels` per variant and warehouse (on hand, reserved)
  updated in the same transaction with row-level locking; no negative stock (CHECK + locked update);
  adjustments need a reason and approval (request/approve permissions); audit. Acceptance includes a
  concurrency test proving parallel decrements cannot oversell. Valuation reports are out of scope.
- **INV-002 Batches and expiry** — lots with expiry per variant (`trackBatches`/`trackExpiry`), FEFO
  allocation, expiry alerts.
- **PUR-002 Purchase orders and receipt** — PO lifecycle with approval, partial receipts posting RECEIPT
  movements with batch and landed cost.
- **INV-003 Transfers and counts** — two-step transfers (in transit), cycle counts posting corrections.
- **CAT-002 GS1 demo-range guard** — reject `952…` GTINs when `NODE_ENV=production` unless explicitly
  allowed; GS1 says demo numbers must never identify real items.
- **OPS-002 Object storage** — S3-compatible `FileStorage` adapter, signed URLs or proxying, migration
  of local files.
- **SEC-002 Staff MFA** — TOTP for back-office users, mandatory for Super Admin and finance roles.
- **PRC-001 Tax and price engine** — tax rates with effective dates per country (KSA 15 %, Egypt 14 %
  standard — confirm per COMP-001), inclusive/exclusive display, half-up rounding per line, totals.
- **CUST-001 Customers** — storefront sign-up/sign-in, e-mail verification, addresses (KSA national
  address fields, Egyptian governorates), marketing consent, data export/erasure requests.
- **SHIP-001 Shipping** — zones by country/city, methods, fees, COD availability rules.
- **STORE-002 Seller identification and legal pages** — per-market footer and pages showing the legal
  entity's name, address, contact, CR and VAT/tax numbers (KSA-COM-01), terms of sale, returns, privacy
  notice (PDPL); content managed by staff, bilingual. Required before live sales.
- **ORD-001 Orders** — cart, checkout, price/tax snapshot, stock reservation with expiry, order numbers
  per country, status workflow, notifications.
- **PAY-001 COD and bank transfer** — payment records, manual bank-transfer verification with proof,
  COD collection reconciliation; never store card data.
- **PAY-002 Online payments** — provider abstraction, hosted payment page or tokenisation, webhook
  signature verification, idempotency, refunds. **Blocked:** provider choice and credentials per country.
- **ORD-002 Fulfilment and returns** — pick/pack/ship, return authorisation (KSA e-commerce 7-day return
  right per COMP-001), refunds with approval.
- **POS-001 Point of sale** — cashier sessions, barcode scanning, payments, receipts, offline strategy
  decision, sessions reconciliation.
- **FIN-001 Accounting** — chart of accounts per legal entity, journals from sales, purchases,
  inventory and payments; period close. Requires ADR-018 confirmed.
- **EINV-001 ZATCA** — FATOORA onboarding (CSID), XML (UBL) generation, cryptographic stamp, QR (TLV),
  clearance (B2B) and reporting (B2C within 24 h). **Blocked:** taxpayer onboarding and credentials.
- **EINV-002 ETA** — e-invoice (B2B) and e-receipt (POS/B2C) submission with signing, POS registration,
  UUID chaining. **Blocked:** ETA registration, POS credentials, signing certificate.
- **MKT-001, LOY-001, RPT-001** — promotions, loyalty and reporting after orders and accounting exist.
- **INT-001 Integration API** — versioned REST over existing services, API clients with scoped keys,
  HMAC-signed webhooks, idempotency keys, rate limits; n8n consumes it.
- **AI-001 AI features** — drafting translations/descriptions, search assistance and summaries through
  INT-001 with the same authorization; no AI action bypasses business rules, payment verification or
  inventory controls; human approval for writes.
- **OPS-003 Production operations** — hosting, managed PostgreSQL with backups and restore drills,
  secrets management, structured logs, error tracking, uptime checks on `/api/health`.
- **SEC-003 Pre-release review** — threat model, dependency audit, authz matrix tests, CSP review,
  penetration test.
- **SEC-001 Dev dependencies** — `npm audit` reports 5 high-severity issues in development-only
  tooling (`braces` via the Next.js ESLint plugin chain); production dependencies report 0. Update when
  upstream releases a fix; do not force-downgrade.
