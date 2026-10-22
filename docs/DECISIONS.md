# Architectural decision log

Settled decisions are not reopened without a concrete new fact (a failing requirement, a security issue,
an upstream change). To change one, add a new entry that supersedes it. Status values: **Accepted**,
**Proposed** (needs confirmation), **Superseded**.

| ID      | Decision                                                             | Status   | Date       |
| ------- | -------------------------------------------------------------------- | -------- | ---------- |
| ADR-001 | Modular monolith on Next.js App Router with a service layer          | Accepted | 2026-10-21 |
| ADR-002 | Better Auth with database sessions for staff authentication          | Accepted | 2026-10-21 |
| ADR-003 | TypeScript 5.9 (not the TypeScript 7 native preview)                 | Accepted | 2026-10-21 |
| ADR-004 | Prisma 7 + pg driver adapter; integrity rules in SQL migrations      | Accepted | 2026-10-21 |
| ADR-005 | Exact money: NUMERIC(14,2) and decimal strings                       | Accepted | 2026-10-21 |
| ADR-006 | Cache Components off; dynamic rendering with per-request CSP nonce   | Accepted | 2026-10-21 |
| ADR-007 | Code-defined permissions, system roles, scoped role assignments      | Accepted | 2026-10-21 |
| ADR-008 | Append-only audit log written in the same transaction                | Accepted | 2026-10-21 |
| ADR-009 | next-intl, `/ar` and `/en` prefixes, Arabic default, Latin digits    | Accepted | 2026-10-21 |
| ADR-010 | Status lifecycles instead of deletes; publish requirements           | Accepted | 2026-10-21 |
| ADR-011 | Barcode policy: verified GTINs, internal Code 128, GS1 952 demo only | Accepted | 2026-10-21 |
| ADR-012 | File-storage abstraction; local adapter now, S3-compatible later     | Accepted | 2026-10-21 |
| ADR-013 | Tests against real PostgreSQL; e2e on a production build             | Accepted | 2026-10-21 |
| ADR-014 | Storefront: cookie market, published+priced only, no fake checkout   | Accepted | 2026-10-21 |
| ADR-015 | Arabic-aware search with a normalised column and pg_trgm             | Accepted | 2026-10-21 |
| ADR-016 | Forms: shared Zod schemas, translatable message descriptors          | Accepted | 2026-10-21 |
| ADR-017 | File-based project governance and session handoff                    | Accepted | 2026-10-21 |
| ADR-018 | Inventory costing: weighted average cost                             | Proposed | 2026-10-21 |
| ADR-019 | Suppliers belong to a buying legal entity; last costs carry currency | Accepted | 2026-10-22 |

---

### ADR-001 — Modular monolith on Next.js App Router with a service layer

- **Context:** One team; catalogue, inventory, orders, POS and accounting must stay transactionally
  consistent; Arabic/English UI and storefront SEO are required.
- **Decision:** One Next.js application. Pages and thin Server Actions call domain services in
  `src/server/modules/*`, which own validation, authorization, transactions and audit. Services never
  import React; they can also back route handlers (integration API) and scripts.
- **Alternatives:** Separate API backend (e.g. NestJS) plus SPA — more deployables and duplicated
  contracts; microservices — distributed transactions without a team to run them.
- **Consequences:** Module boundaries are enforced by convention and review. The n8n/integration API
  (INT-001) will be route handlers over the same services.

### ADR-002 — Better Auth with database sessions for staff authentication

- **Context:** The prompt allowed Auth.js or another maintained library. Auth.js is now maintained by
  the Better Auth team ([announcement](https://www.better-auth.com/blog/authjs-joins-better-auth),
  [discussion](https://github.com/nextauthjs/next-auth/discussions/13252)); its credentials provider is
  limited with database sessions.
- **Decision:** Better Auth 1.7 with e-mail/password, server-side sessions in PostgreSQL (12 h expiry,
  1 h refresh), scrypt hashing, public sign-up disabled, database-backed rate limiting (5 sign-ins per
  minute), a hook that refuses sessions for non-ACTIVE users, cookie prefix `perfume`. Origin and CSRF
  checks are pinned on because the library relaxes them when `NODE_ENV=test`.
- **Alternatives:** Auth.js v5; Lucia (deprecated); a custom implementation.
- **Consequences:** Suspending a user or changing roles takes effect on the next request (the actor is
  reloaded per request). Customer accounts (CUST-001) need their own sign-up flow and policy.

### ADR-003 — TypeScript 5.9

- **Decision:** TypeScript 5.9 strict with `noUncheckedIndexedAccess`. TypeScript 7 is only an
  experimental option in `next build`
  ([Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli)).
- **Consequences:** Revisit when TypeScript 7 is stable and supported by Next.js and ESLint tooling.

### ADR-004 — Prisma 7 with the pg driver adapter; integrity rules in SQL migrations

- **Decision:** Prisma 7 `prisma-client` generator (output `src/generated/prisma`), `@prisma/adapter-pg`,
  multi-file schema in `prisma/schema`, `prisma.config.ts`. UUIDv7 primary keys; ISO codes as natural
  keys for countries and currencies. CHECK constraints (29), composite foreign keys that keep stores,
  warehouses and legal entities in one country, the `pg_trgm` extension and audit triggers are written
  as raw SQL in migrations ([upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions)).
- **Consequences:** Prisma does not diff CHECKs or triggers — every later migration that touches those
  tables must keep them in sync by hand. Prisma 7 no longer generates or seeds on `migrate dev`.
  Prisma blocks `migrate reset` when run by an AI agent; agents must not bypass that guard.

### ADR-005 — Exact money

- **Decision:** Amounts are `NUMERIC(14,2)`; outside the database they are canonical decimal strings.
  Input with more decimals than the currency allows is rejected, never silently rounded. Arabic-Indic
  digits are accepted on input. Where rounding becomes necessary (tax, discounts — PRC-001) it is
  half-up at the currency's minor unit, per line.
- **Consequences:** No JavaScript floats in pricing code; formatting uses `Intl.NumberFormat` on strings.

### ADR-006 — Cache Components off; dynamic rendering with a per-request CSP nonce

- **Decision:** All pages render dynamically. `src/proxy.ts` issues a per-request nonce and a strict CSP
  (`'strict-dynamic'`, no `unsafe-inline` scripts), a request id and security headers.
- **Alternatives:** Cache Components / static generation — incompatible with nonce-based CSP and the
  auth-gated back office; the storefront can adopt targeted caching later if performance requires it.

### ADR-007 — Code-defined permissions, system roles, scoped role assignments

- **Decision:** 48 permissions (16 active, the rest reserved for later modules) and 12 system roles are
  defined in code and synced to the database. Users hold role assignments with a scope: GLOBAL, COUNTRY,
  LEGAL_ENTITY, STORE or WAREHOUSE. Services call `assertCan(actor, permission, target)`; organisation-wide
  operations (brands, categories, users' global roles, audit log) require a GLOBAL grant. Users cannot
  grant permissions or scopes beyond their own; the last active Super Admin cannot be removed.
- **Alternatives:** Free-form roles editable in the UI — deferred until a business need appears.
- **Detail:** `docs/RBAC.md`.

### ADR-008 — Append-only audit log in the same transaction

- **Decision:** Services call `recordAudit(tx, …)` inside the business transaction. Database triggers
  reject UPDATE, DELETE and TRUNCATE on `audit_logs` unless a session explicitly enables retention purge.
  Secrets and password fields are redacted before storage.
- **Consequences:** An action and its audit entry commit or fail together.

### ADR-009 — Internationalisation

- **Decision:** next-intl with locale prefixes always (`/ar/…`, `/en/…`), Arabic as default and fallback,
  locale negotiated from `Accept-Language`, typed messages with a parity test, logical CSS properties for
  RTL. Numbers and prices use Latin digits in both languages (consistent with SKUs and receipts).

### ADR-010 — Status lifecycles instead of deletes

- **Decision:** Products move DRAFT → PUBLISHED → INACTIVE/DISCONTINUED; variants ACTIVE ↔ INACTIVE →
  DISCONTINUED; reference data is activated/deactivated. Publishing requires an active brand and at least
  one ACTIVE variant with an active price in an active market. Rules: `docs/BUSINESS_RULES.md`.

### ADR-011 — Barcode policy

- **Decision:** GTIN-8/12/13/14 check digits are verified; SKUs and barcodes are unique in the database.
  Products without a manufacturer GTIN get an internal Code 128 value starting with letters (`PF…`) so it
  can never collide with a GTIN. GS1 prefix 952 is reserved by GS1 for demonstrations
  ([GS1 company prefix](https://www.gs1.org/standards/id-keys/company-prefix)) and is used only in seed
  and test data. Storefront structured data declares `gtin` only for manufacturer barcodes.

### ADR-012 — File-storage abstraction

- **Decision:** `FileStorage` interface with a local-disk adapter (development, single server). Files are
  served by `/api/files/*` only when registered in `product_images`. An S3-compatible adapter is required
  before multi-instance production (OPS-002).

### ADR-013 — Testing against real PostgreSQL

- **Decision:** Integration tests run services against a dedicated PostgreSQL database (name must contain
  `test`), prepared with `prisma migrate deploy` and truncated per test file. Playwright runs against a
  production build and a disposable `*_e2e` database that global setup empties and seeds each run.
- **Consequences:** No database mocks; tests catch constraint, trigger and transaction behaviour.

### ADR-014 — Storefront behaviour before orders exist

- **Decision:** Visitor market chosen by cookie (default `DEFAULT_MARKET`). Only PUBLISHED products of
  active brands with an ACTIVE variant priced in that market are shown. There is no cart or checkout
  until ORD-001; product pages say so instead of showing inert buttons. Structured data omits stock
  availability until inventory exists.

### ADR-015 — Arabic-aware search without an external engine

- **Decision:** `products.search_text` holds normalised Arabic/Latin text (diacritics, hamza and
  alef-maqsura forms folded) maintained by the catalogue service and indexed with `pg_trgm`. Exact SKU or
  barcode matches are surfaced first in the back office (scanner-friendly).
- **Consequences:** Revisit (e.g. PostgreSQL full-text or a search service) when catalogue size or
  relevance needs exceed trigram matching.

### ADR-016 — Forms and validation messages

- **Decision:** React Hook Form with shared Zod schemas. Messages are locale-independent descriptors
  (`validation.key|{params}`) translated in the client; Server Actions return field errors in the same
  form. Password forms use `method="post"` and stay disabled until hydrated so credentials can never be
  submitted in a URL.

### ADR-017 — File-based project governance

- **Decision:** `CLAUDE.md` (short permanent rules) plus `docs/PROJECT_STATUS.md`,
  `docs/SESSION_HANDOFF.md`, `docs/TASK_BOARD.md`, `docs/IMPLEMENTATION_PLAN.md` and this log are the
  source of truth between sessions. Task IDs use module prefixes (BOOT, DB, AUTH, CAT, INV, ORD, …).
- **Consequences:** Every session ends by updating status, board and handoff with evidence.

### ADR-018 — Inventory costing: weighted average cost (Proposed)

- **Context:** Inventory valuation, cost of goods sold and profitability reports (INV-001, FIN-001,
  RPT-001) depend on the costing method. Perfume stock is tracked by batch for expiry.
- **Proposal:** Perpetual inventory valued at moving weighted average cost per variant and legal entity;
  batches/lots drive expiry and FEFO picking, not valuation. Landed costs (freight, customs) are added to
  receipt cost.
- **Alternatives:** FIFO by batch (more precise per lot, more complex corrections); standard cost.
- **Needs:** Confirmation by the business's accountant for both KSA and Egypt before FIN-001 posts
  journals. INV-001 records unit cost per movement so either method remains possible.

### ADR-019 — Suppliers belong to a buying legal entity; last costs carry their currency

- **Context:** PUR-001 adds supplier profiles. Purchase orders, supplier invoices, payables and tax
  treatment (PUR-002, PUR-003, FIN-001) are per legal entity, and procurement staff are assigned at
  GLOBAL, COUNTRY or LEGAL_ENTITY scope.
- **Decision:** A supplier record belongs to exactly one buying legal entity (composite FK
  `(legal_entity_id, country_code)` like stores and warehouses), which is fixed after creation. The
  supplier's own country (`supplier_country_code`, any ISO 3166-1 code) is separate and decides which
  tax-number format check applies (KSA 15 digits `3…3`, Egypt 9 digits, otherwise 4–40 letters/digits,
  the existing `taxNumberLooksValid` rule). A supplier that sells to both the Saudi and Egyptian
  entities has one record per entity. Tax numbers are unique per buying entity. Payment terms are
  `PREPAID`, `ON_DELIVERY` or `NET` with 1–365 days (database CHECK). Each supplier has a purchasing
  currency from the currencies table. A supplier product stores the supplier's code for a variant
  and an optional last cost as NUMERIC(14,2) **together with its currency code and date**, so a later
  change of the supplier's currency never relabels recorded costs. Until PUR-002 exists, last cost is
  entered by hand; PUR-002 receipts will update it. A new permission `suppliers.view` (Business Manager,
  Inventory Manager, Procurement Staff, Accountant) gates reading; `suppliers.manage` gates writes.
  Both are checked against `{countryCode, legalEntityId}`; STORE and WAREHOUSE assignments do not
  cover suppliers.
- **Alternatives:** Organisation-wide supplier master (one record across countries) — rejected because
  payables, tax and scoping are per entity and a COUNTRY-scoped buyer could not be limited. Supplier
  scoped by market country only — rejected because LEGAL_ENTITY-scoped staff could not be covered.
- **Consequences:** Contacts are personal data (PDPL, Egyptian Law 151/2020); they can be removed and
  the audit entry keeps only the contact's name. Imported currencies (USD, EUR) need currency
  reference data before suppliers can be priced in them (not in PUR-001).
