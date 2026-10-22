# Test plan

Strategy, environments, the current coverage map and known gaps. Decision: ADR-013.

## Strategy

| Layer       | Tool           | Scope                                                                                                                 | Database                              |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Unit        | Vitest         | Pure logic: money, barcodes, text normalisation, RBAC scope rules, redaction, message catalogues                      | none                                  |
| Integration | Vitest         | Services end to end: validation, authorization per role and scope, transactions, constraints, triggers, audit entries | real PostgreSQL (`TEST_DATABASE_URL`) |
| End-to-end  | Playwright     | User flows in a browser against a production build, both languages                                                    | disposable seeded database (`*_e2e`)  |
| CI          | GitHub Actions | All of the above plus lint, format, typecheck and build on every push and pull request                                | PostgreSQL 16 service                 |

Principles: test behaviour at the service boundary (where business rules and authorization live); never
mock the database; every authorization rule has an allowed **and** a forbidden case; every bug fix adds a
test that fails without the fix; tests create their own data and never depend on order.

## Running

```bash
npm run test:unit          # no database
npm run test:integration   # TEST_DATABASE_URL (name must contain "test"); migrate deploy + truncation
npm test                   # both
npm run test:e2e           # builds and serves on :3100; E2E_DATABASE_URL or <test db>_e2e
```

Integration files run serially against one database; each test file truncates the tables it uses.
The e2e global setup creates the database if missing, applies migrations, empties every table
(including the audit log through its retention switch) and runs the development seed with a throw-away
password; tests run with one worker.

## Coverage map (2026-10-22: 56 unit, 72 integration, 18 e2e — all passing locally; CI run 1 covered Phase 1)

| Area                                               | Unit                                                                                                                                     | Integration                                                                                                                                                                                                         | E2E                                                                                                                |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Money parsing, comparison, formatting              | `money.test.ts` (8)                                                                                                                      | price storage and precision errors (`catalog.test.ts`)                                                                                                                                                              | prices shown per market                                                                                            |
| Barcodes (GS1 check digits, types, internal codes) | `barcode.test.ts` (9)                                                                                                                    | uniqueness, source/type consistency, races (`catalog.test.ts`)                                                                                                                                                      | scan lookup, GTIN inference in the variant form                                                                    |
| SKU, slug, code, Arabic search normalisation       | `catalog-text.test.ts` (8)                                                                                                               | product search incl. exact SKU/barcode match                                                                                                                                                                        | storefront search                                                                                                  |
| Translations                                       | `messages.test.ts` (3): key parity, plural forms                                                                                         | —                                                                                                                                                                                                                   | Arabic validation messages; RTL/LTR                                                                                |
| RBAC rules                                         | `rbac.test.ts` (16): scope coverage, `can`/`assertCan`, role catalogue                                                                   | scoped organisation access, role assignment with escalation guard, last Super Admin, audit access (`access-and-organization.test.ts`, 18)                                                                           | cashier read-only; KSA manager limited to KSA prices; audit hidden                                                 |
| Authentication                                     | —                                                                                                                                        | sign-in success/failure parity, inactive accounts, sign-up disabled, origin/CSRF enforcement (`auth.test.ts`, 6)                                                                                                    | redirect to sign-in with return URL, wrong password, sign-in/out                                                   |
| Audit log                                          | `redact-and-validation.test.ts` (redaction)                                                                                              | entries written per change; UPDATE/DELETE rejected by triggers                                                                                                                                                      | product history shows the reason                                                                                   |
| Catalogue                                          | —                                                                                                                                        | brands, categories (tree rules), products, variants, prices (scoped), publishing rules, search (`catalog.test.ts`, 28)                                                                                              | create → variant → prices → publish → storefront → unpublish; duplicate SKU message; required fields               |
| Storefront                                         | —                                                                                                                                        | market filtering, price sorting, filters incl. sub-categories, Arabic search, malformed queries, visibility rules (`storefront.test.ts`, 6)                                                                         | language negotiation, market switch, drafts hidden, filters kept on language switch                                |
| Validation messages                                | descriptor parsing (`redact-and-validation.test.ts`)                                                                                     | field errors from services                                                                                                                                                                                          | both languages                                                                                                     |
| Suppliers (PUR-001)                                | `procurement-schema.test.ts` (5): tax rule per supplier country (SA, EG, other), NET days, normalisation; `rbac.test.ts` supplier grants | profiles, scopes (COUNTRY, LEGAL_ENTITY, STORE), view vs manage, uniqueness, CHECKs, contacts (one primary, no PII in audit), supplier products, last-cost currency and dating, history (`procurement.test.ts`, 14) | create supplier → contact → linked product with cost → list and history; Arabic RTL; no access for catalogue staff |

## Phase 1 acceptance criteria → evidence

| Criterion                                                | Evidence                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Authentication protects admin routes                     | `auth.spec.ts` redirect tests; `auth.test.ts`                                                  |
| Server-side authorization prevents unauthorized CRUD     | `access-and-organization.test.ts`, `catalog.test.ts` forbidden cases; `access-control.spec.ts` |
| Create/edit/view/search/deactivate products and variants | `catalog.test.ts`; `catalog.spec.ts`                                                           |
| SKU and barcode uniqueness                               | `catalog.test.ts` (including concurrent duplicate SKU); `catalog.spec.ts`                      |
| Prices per market and currency                           | `catalog.test.ts` market prices; `storefront.spec.ts`                                          |
| RTL/LTR                                                  | `storefront.spec.ts`                                                                           |
| Understandable validation                                | `catalog.spec.ts`, `storefront.spec.ts`                                                        |
| Migrations on a clean database, build                    | CI run 1                                                                                       |

## Known gaps (tracked)

| Gap                                                                      | Plan                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in rate limiting is disabled in test environments and not exercised | Add an integration test with rate limiting enabled (SEC-002 or next auth change)                                                     |
| Image upload and barcode label page have no automated tests              | Add integration test for `uploadProductImage` (sharp re-encoding, limits) and an e2e smoke for labels with the next catalogue change |
| No automated accessibility checks                                        | Add axe-core checks to key pages (REL-001)                                                                                           |
| `docker-compose.yml` not exercised                                       | OPS-001 manual verification                                                                                                          |
| Concurrency, idempotency, financial consistency                          | Arrive with INV-001, ORD-001, PAY-001, FIN-001 (each task's acceptance criteria require them)                                        |
| Backup/restore, performance                                              | REL-001, OPS-003                                                                                                                     |

## Future test requirements by phase (from the brief)

- **Phase 2:** partial receipts, stock shortages, concurrent sales (parallel transactions), rejected and
  quarantined batches never sellable, rollback behaviour, idempotent retries.
- **Phase 3:** complete product-to-order lifecycle in both markets; server-side recalculation ignores
  client totals; reservation expiry.
- **Phase 4:** webhook signature rejection, duplicate event delivery, redirect-only "success" never marks
  payment paid, COD and bank-transfer verification, returns with dispositions.
- **Phase 5:** balanced journals, immutable posted entries, credit notes, tax breakdowns, fiscal adapters
  validated against authority sandboxes when credentials exist.
- **Phase 8:** authorization/data-isolation suite, payment idempotency, inventory concurrency, financial
  consistency, backup/restore drill, accessibility and responsive checks, dependency audit, performance.
