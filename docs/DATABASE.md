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

## Tables (27)

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

### Inventory (`prisma/schema/inventory.prisma`, ADR-020)

| Table             | Purpose and key rules                                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_balances`  | One row per variant × warehouse × stock status (`SELLABLE`, `QUARANTINED`, `DAMAGED`, `RETURNED`): integer `on_hand` and `reserved`; changed only by `postStockMovements` together with a movement                                                                      |
| `stock_movements` | Append-only ledger: type, variant, warehouse, status, signed non-zero quantity, `balance_after`, optional unit cost NUMERIC(19,4) with currency, source document, reason, actor, correlation id; unique `(idempotency_key, line_no)`; indexed by variant/warehouse/time |

### Governance (`prisma/schema/governance.prisma`)

| Table        | Purpose and key rules                                                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs` | Append-only: time, actor type and user, action, entity type and id, summary, redacted `before`/`after` JSON, reason, correlation id, IP, user agent; indexed by entity, actor, time and action |

## CHECK constraints (40)

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
| Stock balances     | `stock_balances_on_hand_non_negative`, `stock_balances_reserved_range` (0 ≤ reserved ≤ on hand), `stock_balances_reserved_only_sellable`                                                                                                                                                                                                                                                    |
| Stock movements    | `stock_movements_quantity_non_zero`, `stock_movements_balance_after_non_negative`, `stock_movements_line_no_positive`, `stock_movements_cost_currency`, `stock_movements_unit_cost_non_negative`, `stock_movements_opening_balance_inbound`, `stock_movements_actor_consistency`, `stock_movements_document_pair`                                                                           |

GTIN check digits are verified in the service (`src/lib/barcode.ts`); the database checks shape.

## Unique indexes and keys

SKU, barcode, slugs (brands, categories, notes, products), codes (families, concentrations, legal
entities, stores, warehouses), `product_prices (variant_id, country_code)`, image storage key, user
e-mail, session token, account `(provider_id, account_id)`, role key, rate-limit key,
`user_roles (user_id, role_id, scope_key)`, and the composite candidate keys `countries (code,
currency_code)` and `legal_entities (id, country_code)` used by composite foreign keys.

Search: `products_search_text_trgm_idx` — GIN index with `gin_trgm_ops` on `products.search_text`
(extension `pg_trgm`, created by the migration).

## Triggers

`audit_logs_no_update`, `audit_logs_no_delete` (row-level) and `audit_logs_no_truncate` (statement-level)
call `audit_logs_block_mutation()`: UPDATE is always rejected; DELETE and TRUNCATE are allowed only in a
transaction that sets `app.audit_retention_purge = 'on'` (retention jobs and test fixtures). Production
should additionally run the application with a database role lacking UPDATE/DELETE/TRUNCATE on
`audit_logs` (OPS-003).

`stock_movements_no_update`, `stock_movements_no_delete` and `stock_movements_no_truncate` call
`stock_movements_block_mutation()`: UPDATE and DELETE are always rejected; TRUNCATE only when the session
sets `app.stock_ledger_purge = 'on'` (test-database resets). Corrections are compensating movements.

## Migrations

- Location: `prisma/migrations/<timestamp>_<name>/migration.sql`; current: `20261021195313_init`.
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
SA/EG, two demo legal entities, three stores, a warehouse, RBAC, a Super Admin and three demo staff,
fragrance reference data, fictional brands and six products (five published) with GS1-952 demo GTINs
or internal codes. Idempotent: re-running creates nothing new and keeps passwords.

## Test databases

- Integration: `TEST_DATABASE_URL` (name must contain `test`), migrated with `migrate deploy`, tables
  truncated per test file (`tests/integration/fixtures.ts`).
- End-to-end: `E2E_DATABASE_URL` or `<test db>_e2e`; created if missing, migrated, emptied and seeded by
  `tests/e2e/global-setup.ts`.

## Planned tables

Following the brief's table groups as modules are built (not before): inventory (`batches`,
reservations, counts, adjustments), procurement (`suppliers`,
`supplier_products`, purchase orders and receipts, supplier invoices/returns/payments), sales
(`customers`, addresses, carts, orders with status history, invoices, credit notes, returns),
payments and shipping (providers, payments, transactions, refunds, reconciliations, shipments, COD
settlements, POS terminals/sessions/transactions), finance (chart of accounts, periods, journals,
expenses, tax profiles and rates, exchange rates, fiscal documents), marketing and governance
(promotions, coupons, loyalty, reviews, notifications, approval requests/actions, webhook events,
integration jobs/logs). The brief's `user_store_access` is replaced by scoped `user_roles` (ADR-007);
`warehouse_locations` will be added only if bin-level stock is needed (ADR-020).
