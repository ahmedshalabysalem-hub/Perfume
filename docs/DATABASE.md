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

## Tables (40)

### Organisation (`prisma/schema/organization.prisma`)

| Table            | Purpose and key rules                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `currencies`     | ISO 4217 code (PK), names, symbols, `minor_units` 0–4                                                                                                                                                                                                                                            |
| `countries`      | ISO 3166 code (PK), currency, default locale, time zone, phone code, `prices_include_tax`, active; unique `(code, currency_code)` for composite references                                                                                                                                       |
| `legal_entities` | Company per country: code, legal/trade names (en/ar), CR number, tax registration number, national-address fields, contact; unique `(id, country_code)`                                                                                                                                          |
| `stores`         | ONLINE or RETAIL; belongs to a legal entity **in the same country** (FK `(legal_entity_id, country_code)` → `legal_entities(id, country_code)`); time zone; currency; optional `fulfilment_warehouse_id` of the **same legal entity** (FK `(fulfilment_warehouse_id, legal_entity_id)`, ADR-025) |
| `warehouses`     | Same country rule as stores; time zone, address                                                                                                                                                                                                                                                  |

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

### Inventory (`prisma/schema/inventory.prisma`, ADR-020, ADR-023)

| Table             | Purpose and key rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stock_batches`   | One lot of one variant owned by one legal entity (ADR-023): lot number (unique per entity and variant; NULL only on the one LEGACY batch per entity and variant), LEGACY and details-complete flags, manufacturing date, expiry basis `RECORDED`/`UNKNOWN`/`NOT_TRACKED` with date and precision `DAY`/`MONTH`, optional supplier of the same entity (FK `(supplier_id, legal_entity_id)`), inspection status with reason, actor and time, latest verification (result, both checks, notes, actor, time), `version`; never deleted |
| `stock_balances`  | One row per variant × warehouse × stock status (`SELLABLE`, `QUARANTINED`, `DAMAGED`, `RETURNED`) × batch (`NULL` only for variants without batch tracking; unique `NULLS NOT DISTINCT`; FK `(batch_id, variant_id)`): integer `on_hand` and `reserved`; changed only by `postStockMovements` together with a movement                                                                                                                                                                                                             |
| `stock_movements` | Append-only ledger: type (incl. `INSPECTION`, `BATCH_ASSIGNMENT`), variant, warehouse, status, batch, signed non-zero quantity, `balance_after`, optional unit cost NUMERIC(19,4) with currency, source document, reason, actor, correlation id; unique `(idempotency_key, line_no)`; indexed by variant/warehouse/time                                                                                                                                                                                                            |

### Procurement (`prisma/schema/procurement.prisma`, ADR-021)

| Table               | Purpose and key rules                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suppliers`         | Code (unique), names (en/ar), buying legal entity **in the same country** (FK `(legal_entity_id, country_code)`), supplier's own country, tax and CR numbers, payment terms and days, purchasing currency, contact fields, notes, active |
| `supplier_contacts` | People at a supplier (name, job title, e-mail, phone, primary flag; one primary enforced by the service under a row lock). Personal data: removable, audited by name only                                                                |
| `supplier_products` | Supplier's code and name for one of our variants; last cost with its own currency and date; active. Unique `(supplier_id, variant_id)` and `(supplier_id, supplier_sku)`                                                                 |

### Sales (`prisma/schema/sales.prisma`, ADR-025)

| Table                   | Purpose and key rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders`                | Storefront order: number `SA-000001` (unique, prefix = country), channel ONLINE, store + legal entity + country (FK `(store_id, legal_entity_id, country_code)`), currency (FK with country), warehouse of the same entity, status, payment status (UNPAID only), guest flag, locale, contact and address snapshot, item count, subtotal, delivery fee and total (both set at confirmation), review deadline, confirmation/cancellation details, idempotency key (unique per store) and request hash, `version` |
| `order_items`           | Snapshot per line: line number, variant and product ids, SKU, product/brand/variant names (en/ar), size, tester flag, quantity, unit price, line total; one line per variant per order; append-only                                                                                                                                                                                                                                                                                                             |
| `order_status_changes`  | Append-only history: from/to status, actor type and user, reason, time                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `stock_reservations`    | Units held for an order line from one balance key (variant, warehouse, batch; FK `(order_item_id, order_id)` and `(batch_id, variant_id)`): quantity, ACTIVE or RELEASED with time and reason; the reserved total is mirrored in `stock_balances.reserved`                                                                                                                                                                                                                                                      |
| `order_number_counters` | Last order number per country, locked and incremented in the placing transaction                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `request_throttles`     | Fixed-window counters for public endpoints (key, window start, hits)                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Governance (`prisma/schema/governance.prisma`)

| Table               | Purpose and key rules                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audit_logs`        | Append-only: time, actor type and user, action, entity type and id, summary, redacted `before`/`after` JSON, reason, correlation id, IP, user agent; indexed by entity, actor, time and action                                                                                                                                                                     |
| `approval_requests` | Maker-checker requests (ADR-019): subject type and id, status PENDING/APPROVED/REJECTED/CANCELLED, resolved scope (country, legal entity, store, warehouse), summary, redacted snapshot, request reason, requester, decider, decision time and reason; at most one PENDING per subject (partial unique index); never deleted; a decided request is final (trigger) |
| `approval_actions`  | Append-only history per request: SUBMITTED/APPROVED/REJECTED/CANCELLED, actor type and user, reason, time                                                                                                                                                                                                                                                          |

## CHECK constraints (89)

| Area               | Constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference data     | `currencies_code_format`, `currencies_minor_units_range`, `countries_code_format`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Organisation       | `legal_entities_code_format`, `stores_code_format`, `warehouses_code_format` (upper-case codes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Identity           | `users_email_lowercase`, `user_roles_scope_consistency`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Slugs and codes    | `brands_slug_format`, `categories_slug_format`, `fragrance_notes_slug_format`, `products_slug_format`, `fragrance_families_code_format`, `fragrance_concentrations_code_format`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Categories         | `categories_not_own_parent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Products           | `products_launch_year_range` (1700–2200), `products_published_has_timestamp`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Variants           | `product_variants_sku_format`, `product_variants_barcode_consistency` (barcode, type, source all set or all null), `product_variants_gtin_format` (digit counts per GTIN type), `product_variants_internal_barcode_code128`, `product_variants_size_positive`, `product_variants_weight_positive`, `product_variants_batches_require_inventory`, `product_variants_expiry_requires_batches`                                                                                                                                                                                                                                                                                      |
| Prices             | `product_prices_amount_positive`, `product_prices_compare_at_gt_amount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Images, compliance | `product_images_size_positive`, `product_compliance_date_order`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Approvals          | `approval_requests_subject_type_format`, `_subject_id_not_blank`, `_summary_not_blank`, `_request_reason_not_blank`, `_decision_consistency` (decided exactly when not PENDING), `_decision_has_decider`, `_requester_cannot_decide` (separation of duties), `_cancelled_by_requester`, `_rejection_has_reason`; `approval_actions_actor_consistency`                                                                                                                                                                                                                                                                                                                            |
| Stock balances     | `stock_balances_on_hand_non_negative`, `stock_balances_reserved_range` (0 ≤ reserved ≤ on hand), `stock_balances_reserved_only_sellable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Stock movements    | `stock_movements_quantity_non_zero`, `stock_movements_balance_after_non_negative`, `stock_movements_line_no_positive`, `stock_movements_cost_currency`, `stock_movements_unit_cost_non_negative`, `stock_movements_opening_balance_inbound`, `stock_movements_actor_consistency`, `stock_movements_document_pair`                                                                                                                                                                                                                                                                                                                                                                |
| Stock batches      | `stock_batches_lot_required` (lot unless LEGACY), `_lot_format` (DR-007), `_details_incomplete_only_legacy`, `_complete_needs_lot`, `_expiry_after_manufacture`, `_expiry_basis_date` (RECORDED ⇔ date), `_expiry_precision_date`, `_expiry_month_end` (MONTH ⇒ last day), `_verification_consistency`, `_release_needs_verification` (RELEASED LEGACY or unknown-expiry batch needs a PASSED verification), `_failed_not_sellable`, `_status_reason` (quarantine and rejection need a reason), `_document_pair`, `_version_positive`                                                                                                                                            |
| Sales              | `orders_number_format` (country prefix), `orders_ships_in_store_country`, `orders_locale`, `orders_request_hash`, `orders_idempotency_key`, `orders_item_count_positive`, `orders_subtotal_positive`, `orders_shipping_fee_non_negative`, `orders_total_is_sum` (total = subtotal + fee, both or neither), `orders_status_fields` (confirmation/cancellation details exactly in their statuses), `orders_version_positive`; `order_items_quantity_positive`, `_unit_price_positive`, `_line_total` (= price × quantity), `_line_no_positive`; `stock_reservations_quantity_positive`, `_release_fields`; `order_number_counters_non_negative`; `request_throttles_hits_positive` |
| Procurement        | `suppliers_code_format`, `suppliers_supplier_country_format`, `suppliers_payment_term_days` (NET ⇔ 1–365 days), `supplier_products_supplier_sku_format` (trimmed, upper-case), `supplier_products_last_cost_positive`, `supplier_products_last_cost_consistency` (amount, currency and date all set or all null)                                                                                                                                                                                                                                                                                                                                                                 |

GTIN check digits are verified in the service (`src/lib/barcode.ts`); the database checks shape.

## Unique indexes and keys

SKU, barcode, slugs (brands, categories, notes, products), codes (families, concentrations, legal
entities, stores, warehouses), `product_prices (variant_id, country_code)`, image storage key, user
e-mail, session token, account `(provider_id, account_id)`, role key, rate-limit key,
`user_roles (user_id, role_id, scope_key)`, `approval_requests_one_pending_per_subject` (partial, `status =
'PENDING'`), supplier code, `suppliers (legal_entity_id, tax_registration_no)` (NULLs never collide),
`supplier_products (supplier_id, variant_id)` and `(supplier_id, supplier_sku)`, `stock_batches (legal_entity_id, variant_id, lot_number)`,
`stock_batches_one_legacy_per_variant` (partial, `is_legacy`), `stock_balances (variant_id, warehouse_id, status, batch_id)`
(`NULLS NOT DISTINCT`), and the composite
candidate keys `countries (code,
currency_code)`, `legal_entities (id, country_code)`, `stock_batches (id, variant_id)` and
`suppliers (id, legal_entity_id)` used by composite foreign keys.

Search: `products_search_text_trgm_idx` — GIN index with `gin_trgm_ops` on `products.search_text`
(extension `pg_trgm`, created by the migration).

## Triggers

`audit_logs_no_update`, `audit_logs_no_delete` (row-level) and `audit_logs_no_truncate` (statement-level)
call `audit_logs_block_mutation()`: UPDATE is always rejected; DELETE and TRUNCATE are allowed only in a
transaction that sets `app.audit_retention_purge = 'on'` (retention jobs and test fixtures). Production
should additionally run the application with a database role lacking UPDATE/DELETE/TRUNCATE on
`audit_logs` (OPS-003).

`approval_requests_guard_update` / `_guard_delete` call `approval_requests_guard()`: DELETE is always
rejected; UPDATE is rejected once a request has left PENDING, and the requested content (subject, scope,
summary, snapshot, reason, requester, time) can never change. `approval_actions_no_update`,
`_no_delete` and `_no_truncate` call `approval_actions_block_mutation()`: the history is append-only;
TRUNCATE is allowed only with `app.audit_retention_purge = 'on'` (test fixtures).
`stock_movements_no_update`, `stock_movements_no_delete` and `stock_movements_no_truncate` call
`stock_movements_block_mutation()`: UPDATE and DELETE are always rejected; TRUNCATE only when the session
sets `app.stock_ledger_purge = 'on'` (test-database resets). Corrections are compensating movements.

Batches (ADR-023): `stock_movements_batch_rules` and `stock_balances_batch_rules` call
`stock_ledger_batch_rules()`: a row has a batch exactly when its variant tracks batches, and the batch's
company is the warehouse's. `stock_balances_sellable_guard` refuses any increase of SELLABLE stock of a
batch that `stock_batch_is_sellable(batch, warehouse)` rejects (RELEASED, not expired on the warehouse's
local date, and verified if expiry is unknown) — the database form of `batchEligibility`.
`stock_balances_key_fixed` refuses any UPDATE that changes a balance's variant, warehouse, status or
batch: stock moves between keys only through movements, so neither the batch rules nor the sellable
guard can be bypassed by relabelling a row.
`stock_batches_guard` refuses deletes, NOT_TRACKED expiry for a variant that tracks expiry, a LEGACY
insert that is not pending, unverified and without lot or dates, identity changes, a version that does
not advance by one, any change to a REJECTED status, removing a lot, changing a non-LEGACY lot once
stock exists, and turning a recorded expiry back into anything else. `product_variants_tracking_guard`
freezes `track_inventory` and `track_batches` once the variant has movements and refuses `track_expiry`
while a NOT_TRACKED batch exists. `stock_carry_over_to_legacy_batches()` is the INV-002 carry-over
(idempotent; reconciles quantities and the ledger, aborting on any difference).

Orders (ADR-025): `orders_guard` refuses deletes, any change to a placed order's number, store,
company, warehouse, contact, address, lines total or idempotency data, backwards or skipped status
changes (PENDING_REVIEW → CONFIRMED | CANCELLED, CONFIRMED → CANCELLED; CANCELLED is final), changing
confirmation details once set, and a version that does not advance by one. `order_items_append_only`
and `order_status_changes_append_only` refuse UPDATE and DELETE. `stock_reservations_guard` allows only
ACTIVE → RELEASED and no deletes.

## Migrations

- Location: `prisma/migrations/<timestamp>_<name>/migration.sql`; current: `20261021195313_init`, `20261022071737_inventory_stock_ledger`, `20261022071950_approvals`, `20261022072014_suppliers`, `20261022095900_stock_movement_types_for_batches` (enum values only, so they are committed before use), `20261022100000_inventory_batches`, `20261022110000_stock_balance_keys_fixed` (review fix: balance keys are immutable), `20261027090000_storefront_orders` (ORD-001: 6 tables, store fulfilment warehouse, 19 CHECKs, 4 triggers).
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
SA/EG, two demo legal entities, three stores (each online store with its fulfilment warehouse), two warehouses (Riyadh, Cairo), RBAC, a Super Admin and four demo staff (including KSA procurement),
fragrance reference data, fictional brands and six products (five published) with GS1-952 demo GTINs
or internal codes, and one fictional supplier (no tax number) with two linked variants. Idempotent: re-running creates nothing new and keeps passwords.

## Test databases

- Integration: `TEST_DATABASE_URL` (name must contain `test`), migrated with `migrate deploy`, tables
  truncated per test file (`tests/integration/fixtures.ts`).
- End-to-end: `E2E_DATABASE_URL` or `<test db>_e2e`; created if missing, migrated, emptied and seeded by
  `tests/e2e/global-setup.ts`.

## Planned tables

Following the brief's table groups as modules are built (not before): inventory (counts,
adjustments), procurement (purchase orders and receipts, supplier
invoices/returns/payments), sales
(`customers`, addresses, invoices, credit notes, returns; carts stay in the browser per ADR-025),
payments and shipping (providers, payments, transactions, refunds, reconciliations, shipments, COD
settlements, POS terminals/sessions/transactions), finance (chart of accounts, periods, journals,
expenses, tax profiles and rates, exchange rates, fiscal documents), marketing and governance
(promotions, coupons, loyalty, reviews, notifications, webhook events,
integration jobs/logs). The brief's `user_store_access` is replaced by scoped `user_roles` (ADR-007);
`warehouse_locations` will be added only if bin-level stock is needed (ADR-020).
