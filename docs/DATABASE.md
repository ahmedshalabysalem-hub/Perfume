# Database

PostgreSQL 16, schema managed by Prisma 7 (`prisma/schema/*.prisma`) plus hand-written SQL in
migrations for what Prisma cannot express. Diagram: `docs/ERD.md`. Decisions: ADR-004, ADR-005,
ADR-008 in `docs/DECISIONS.md`.

## Conventions

- Model names PascalCase singular; tables snake_case plural (`@@map`); columns snake_case (`@map`).
- Business entities use **UUIDv7** primary keys (time-ordered). ISO reference data uses the ISO code as
  primary key (`countries.code`, `currencies.code`).
- Money: `NUMERIC(14,2)`; never floating point. Quantities will be integers (INV-001).
- Timestamps: `timestamptz(3)`; dates without time (`date`) only where the business meaning is a day.
- Bilingual business text: `*_en` / `*_ar` columns.
- Deletion: business records are deactivated or moved through statuses, not deleted. Foreign keys are
  `RESTRICT` by default; `CASCADE` only for owned children (product images, compliance references,
  join rows, sessions, a user's role assignments).
- Integrity rules that protect money, identity or history are enforced in the database too (CHECKs,
  unique indexes, composite foreign keys, triggers) — not only in services.

## Tables (30)

### Organisation (`prisma/schema/organization.prisma`)

| Table            | Purpose and key rules                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currencies`     | ISO 4217 code (PK), names, symbols, `minor_units` 0–4                                                                                                                |
| `countries`      | ISO 3166 code (PK), currency, default locale, time zone, phone code, `prices_include_tax`, active; unique `(code, currency_code)` for composite references           |
| `legal_entities` | Company per country: code, legal/trade names (en/ar), CR number, tax registration number, national-address fields, contact; unique `(id, country_code)`              |
| `stores`         | ONLINE or RETAIL; belongs to a legal entity **in the same country** (FK `(legal_entity_id, country_code)` → `legal_entities(id, country_code)`); time zone; currency |
| `warehouses`     | Same country rule as stores; time zone, address                                                                                                                      |

### Identity and access (`prisma/schema/identity.prisma`)

| Table              | Purpose and key rules                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`            | Staff and (later) customers: lower-case unique e-mail (CHECK), type STAFF/CUSTOMER, status ACTIVE/SUSPENDED/DEACTIVATED, preferred locale, last login                                                                                                            |
| `sessions`         | Better Auth database sessions (unique token, expiry, IP, user agent)                                                                                                                                                                                             |
| `accounts`         | Credentials per provider (scrypt hash for e-mail/password); unique `(provider_id, account_id)`                                                                                                                                                                   |
| `verifications`    | Better Auth verification tokens                                                                                                                                                                                                                                  |
| `rate_limits`      | Better Auth rate-limit counters (unique key)                                                                                                                                                                                                                     |
| `permissions`      | Synced from the code catalogue (`src/server/rbac/permissions.ts`)                                                                                                                                                                                                |
| `roles`            | System roles synced from code, allowed scope types                                                                                                                                                                                                               |
| `role_permissions` | Role ↔ permission grants                                                                                                                                                                                                                                         |
| `user_roles`       | Scoped assignment: scope type GLOBAL / COUNTRY / LEGAL_ENTITY / STORE / WAREHOUSE, the matching reference column, a derived `scope_key` (e.g. `COUNTRY:SA`), assigned-by; unique `(user_id, role_id, scope_key)`; CHECK keeps type, reference and key consistent |

### Catalogue (`prisma/schema/catalog.prisma`)

| Table                      | Purpose and key rules                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brands`                   | Houses: unique slug, names, description, origin, active                                                                                                                                                                                 |
| `categories`               | Tree via `parent_id` (≤ 5 levels, no cycles — service), unique slug, sort order, active                                                                                                                                                 |
| `fragrance_families`       | Unique code (e.g. `OUD`), names, sort, active                                                                                                                                                                                           |
| `fragrance_concentrations` | Unique code (e.g. `EDP`), names, sort, active                                                                                                                                                                                           |
| `fragrance_notes`          | Unique slug, names, active                                                                                                                                                                                                              |
| `products`                 | Type, status, brand, primary category, names, descriptions, audience, concentration, family, origin, manufacturer, ingredients, warnings, storage, SEO fields, launch year, normalised `search_text`, `published_at`, `discontinued_at` |
| `product_categories`       | Product ↔ category (composite PK)                                                                                                                                                                                                       |
| `product_fragrance_notes`  | Product ↔ note with layer TOP/HEART/BASE and order                                                                                                                                                                                      |
| `product_variants`         | Unique SKU, unique optional barcode with type and source, labels, size (ml), weight (g), tester flag, status, inventory/batch/expiry tracking flags, sort                                                                               |
| `product_prices`           | One per variant and country: amount, optional compare-at, active; currency tied to the country (FK `(country_code, currency_code)` → `countries(code, currency_code)`)                                                                  |
| `product_images`           | Storage key (unique), MIME type, size, dimensions, alt text (en/ar), optional variant, order                                                                                                                                            |
| `product_compliance`       | Regulatory references per product and country: authority, reference type/number, status, issue and expiry dates, notes                                                                                                                  |

### Procurement (`prisma/schema/procurement.prisma`, ADR-019)

| Table               | Purpose and key rules                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suppliers`         | Code (unique), names (en/ar), buying legal entity **in the same country** (FK `(legal_entity_id, country_code)`), supplier's own country, tax and CR numbers, payment terms and days, purchasing currency, contact fields, notes, active |
| `supplier_contacts` | People at a supplier (name, job title, e-mail, phone, primary flag; one primary enforced by the service under a row lock). Personal data: removable, audited by name only                                                                |
| `supplier_products` | Supplier's code and name for one of our variants; last cost with its own currency and date; active. Unique `(supplier_id, variant_id)` and `(supplier_id, supplier_sku)`                                                                 |

### Governance (`prisma/schema/governance.prisma`)

| Table        | Purpose and key rules                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs` | Append-only: time, actor type and user, action, entity type and id, summary, redacted `before`/`after` JSON, reason, correlation id, IP, user agent; indexed by entity, actor, time and action |

## CHECK constraints (35)

| Area               | Constraints                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference data     | `currencies_code_format`, `currencies_minor_units_range`, `countries_code_format`                                                                                                                                                                                                                                                                                                           |
| Organisation       | `legal_entities_code_format`, `stores_code_format`, `warehouses_code_format` (upper-case codes)                                                                                                                                                                                                                                                                                             |
| Identity           | `users_email_lowercase`, `user_roles_scope_consistency`                                                                                                                                                                                                                                                                                                                                     |
| Slugs and codes    | `brands_slug_format`, `categories_slug_format`, `fragrance_notes_slug_format`, `products_slug_format`, `fragrance_families_code_format`, `fragrance_concentrations_code_format`                                                                                                                                                                                                             |
| Categories         | `categories_not_own_parent`                                                                                                                                                                                                                                                                                                                                                                 |
| Products           | `products_launch_year_range` (1700–2200), `products_published_has_timestamp`                                                                                                                                                                                                                                                                                                                |
| Variants           | `product_variants_sku_format`, `product_variants_barcode_consistency` (barcode, type, source all set or all null), `product_variants_gtin_format` (digit counts per GTIN type), `product_variants_internal_barcode_code128`, `product_variants_size_positive`, `product_variants_weight_positive`, `product_variants_batches_require_inventory`, `product_variants_expiry_requires_batches` |
| Prices             | `product_prices_amount_positive`, `product_prices_compare_at_gt_amount`                                                                                                                                                                                                                                                                                                                     |
| Images, compliance | `product_images_size_positive`, `product_compliance_date_order`                                                                                                                                                                                                                                                                                                                             |
| Procurement        | `suppliers_code_format`, `suppliers_supplier_country_format`, `suppliers_payment_term_days` (NET ⇔ 1–365 days), `supplier_products_supplier_sku_format` (trimmed, upper-case), `supplier_products_last_cost_positive`, `supplier_products_last_cost_consistency` (amount, currency and date all set or all null)                                                                            |

GTIN check digits are verified in the service (`src/lib/barcode.ts`); the database checks shape.

## Unique indexes and keys

SKU, barcode, slugs (brands, categories, notes, products), codes (families, concentrations, legal
entities, stores, warehouses), `product_prices (variant_id, country_code)`, image storage key, user
e-mail, session token, account `(provider_id, account_id)`, role key, rate-limit key,
`user_roles (user_id, role_id, scope_key)`, supplier code, `suppliers (legal_entity_id,
tax_registration_no)` (NULLs never collide), `supplier_products (supplier_id, variant_id)` and
`(supplier_id, supplier_sku)`, and the composite candidate keys `countries (code,
currency_code)` and `legal_entities (id, country_code)` used by composite foreign keys.

Search: `products_search_text_trgm_idx` — GIN index with `gin_trgm_ops` on `products.search_text`
(extension `pg_trgm`, created by the migration).

## Triggers

`audit_logs_no_update`, `audit_logs_no_delete` (row-level) and `audit_logs_no_truncate` (statement-level)
call `audit_logs_block_mutation()`: UPDATE is always rejected; DELETE and TRUNCATE are allowed only in a
transaction that sets `app.audit_retention_purge = 'on'` (retention jobs and test fixtures). Production
should additionally run the application with a database role lacking UPDATE/DELETE/TRUNCATE on
`audit_logs` (OPS-003).

## Migrations

- Location: `prisma/migrations/<timestamp>_<name>/migration.sql`; current: `20261021195313_init`, `20261022072014_suppliers`.
- Change workflow: edit `prisma/schema/*.prisma` → `npm run db:migrate -- --name <change>` → review the
  generated SQL (data loss, defaults on large tables, locking) → add hand-written CHECKs/triggers to the
  same migration → `npx prisma generate` → tests.
- Prisma does not diff CHECK constraints or triggers: a migration that alters those tables must restate
  them explicitly. Never edit an applied migration; add a new one.
- Deploy: `npm run db:deploy` (`prisma migrate deploy`) — non-destructive, used by CI and test setup.
- `prisma migrate reset` is refused for AI agents by Prisma; humans may use `npm run db:reset` on
  development databases only.

## Seed

`prisma/seed.ts` with data in `prisma/seed-data.ts`; refuses `NODE_ENV=production`. Creates SAR/EGP,
SA/EG, two demo legal entities, three stores, a warehouse, RBAC, a Super Admin and four demo staff (including KSA procurement),
fragrance reference data, fictional brands and six products (five published) with GS1-952 demo GTINs
or internal codes, and one fictional supplier (no tax number) with two linked variants. Idempotent: re-running creates nothing new and keeps passwords.

## Test databases

- Integration: `TEST_DATABASE_URL` (name must contain `test`), migrated with `migrate deploy`, tables
  truncated per test file (`tests/integration/fixtures.ts`).
- End-to-end: `E2E_DATABASE_URL` or `<test db>_e2e`; created if missing, migrated, emptied and seeded by
  `tests/e2e/global-setup.ts`.

## Planned tables

Following the brief's table groups as modules are built (not before): inventory (`stock_movements`,
`stock_balances`, `batches`, reservations, counts, adjustments), procurement (purchase orders and receipts, supplier invoices/returns/payments), sales
(`customers`, addresses, carts, orders with status history, invoices, credit notes, returns),
payments and shipping (providers, payments, transactions, refunds, reconciliations, shipments, COD
settlements, POS terminals/sessions/transactions), finance (chart of accounts, periods, journals,
expenses, tax profiles and rates, exchange rates, fiscal documents), marketing and governance
(promotions, coupons, loyalty, reviews, notifications, approval requests/actions, webhook events,
integration jobs/logs). The brief's `user_store_access` is replaced by scoped `user_roles` (ADR-007);
`warehouse_locations` will be added only if bin-level stock is needed (INV-001 design note).
