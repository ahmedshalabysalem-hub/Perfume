# Business rules

Rules the system enforces today, where they are enforced, and rules planned for later phases (marked
**planned**). Services are authoritative; the database repeats critical rules as constraints.
Regulatory sources: `docs/COUNTRY_COMPLIANCE.md`. Decisions: `docs/DECISIONS.md`.

## Markets and currencies

- A market is an active **country**: Saudi Arabia (SA, SAR) and Egypt (EG, EGP) are seeded. A country
  has exactly one currency; the database ties each price's currency to its country's currency
  (composite foreign key), so a price can never be in the wrong currency.
- `prices_include_tax` per country states whether shelf prices include VAT (true for SA by regulation;
  true for EG pending confirmation — EG-TAX-01).
- Country codes and currency codes are ISO (`^[A-Z]{2}$`, `^[A-Z]{3}$`); currencies have 0–4 minor units
  (SAR and EGP: 2).

## Money

- Stored as `NUMERIC(14,2)`; carried as canonical decimal strings outside the database; never floats.
- Input accepts Arabic-Indic digits, spaces and thousands separators (`"١٬٢٥٠٫٥"`, `"1,250.5"`) and is
  normalised to `"1250.50"`. More decimals than the currency allows is **rejected** (not rounded);
  more than 12 integer digits is rejected.
- Display uses Latin digits and the currency code/symbol for the viewer's language.
- Rounding (**planned**, PRC-001): half-up at the currency's minor unit, per line; tax for
  tax-inclusive prices = price × rate / (1 + rate).

## Catalogue

### Products

| Status       | Meaning                     | Allowed next                        |
| ------------ | --------------------------- | ----------------------------------- |
| DRAFT        | Being prepared, never shown | PUBLISHED, INACTIVE, DISCONTINUED   |
| PUBLISHED    | Visible where sellable      | INACTIVE, DISCONTINUED              |
| INACTIVE     | Temporarily withdrawn       | PUBLISHED, DRAFT, DISCONTINUED      |
| DISCONTINUED | Permanently withdrawn       | INACTIVE (deliberate reinstatement) |

- Transitions into or out of PUBLISHED need `products.publish`; other transitions `products.update`.
  An optional reason is stored in the audit log.
- **Publish requirements:** active brand, and at least one ACTIVE variant with an active price in an
  active market. `published_at` is set on first publication (database CHECK: PUBLISHED ⇒ timestamp).
- Products are never deleted; history is preserved.
- Names in English and Arabic are required; the slug is generated from the English name (made unique
  with `-2`, `-3`, …) or given explicitly (a clash is a conflict), pattern `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Categories: up to 20 per product; the primary category must be one of them. Launch year 1700–2200.
- Fragrance notes are assigned per layer (top, heart, base) with an order.

### Variants

| Status       | Allowed next           |
| ------------ | ---------------------- |
| ACTIVE       | INACTIVE, DISCONTINUED |
| INACTIVE     | ACTIVE, DISCONTINUED   |
| DISCONTINUED | INACTIVE               |

- A variant cannot be reactivated while its product is DISCONTINUED.
- **SKU:** trimmed, upper-cased, internal spaces become hyphens; pattern `^[A-Z0-9][A-Z0-9._/-]{0,63}$`;
  unique across the catalogue (database unique index; races resolve to a conflict message).
- Size in ml and weight in grams must be positive when given. Display label defaults to the size
  ("100 ml"); testers are flagged.
- Inventory flags: tracking batches requires tracking inventory; tracking expiry requires tracking
  batches (database CHECKs). Inventory tracking is enforced by the ledger (INV-001); batch and expiry
  tracking take effect with INV-002 (**planned**).
- **Sellable** in a market = product PUBLISHED, variant ACTIVE, market active, price active in that market.

### Barcodes (ADR-011)

- Types: EAN-13, EAN-8, UPC-A, GTIN-14 (digits, GS1 check digit verified) and Code 128 (internal).
- Source: MANUFACTURER (the GTIN printed by the brand owner) or INTERNAL. Barcode, type and source are
  all set or all empty (database CHECK). Barcodes are unique across the catalogue.
- Internal codes start with letters (`PF…`), so they can never collide with a GTIN; they are for in-store
  scanning only and are labelled "not a GS1 GTIN" on printed labels.
- Scanning a GTIN into the variant form infers the type and marks it as a manufacturer barcode.
- GS1 prefix 952 (demonstration numbers) is used only in seed and test data; CAT-002 will refuse it in
  production. Never invent GTINs for real products.

### Prices

- One price per variant per market, in that market's currency; amount > 0; optional compare-at
  ("was") price must be greater than the amount; a price can be inactive.
- Clearing the amount removes that market's price.
- Users with country-scoped price permission may change only their countries' prices; unchanged
  entries for other markets may be submitted alongside, changed ones are refused (whole request).
- Every price change is audited with before/after values.

### Brands, categories and attributes

- Brands, categories, fragrance families, concentrations and notes are activated/deactivated, not
  deleted. Managing them requires a GLOBAL grant (they are shared by all markets).
- An inactive brand hides its products from the storefront and blocks publishing.
- Categories form a tree up to 5 levels; a category cannot be its own ancestor. Filtering by a
  category on the storefront includes its sub-categories.

### Images and regulatory references

- Images: JPEG, PNG, WebP or AVIF up to 5 MB, re-encoded to WebP (max 2000 px), at most 12 per
  product; the first image is the primary one; alt text in both languages.
- Regulatory references (`product_compliance`): authority, reference type and number, status (PENDING,
  ACTIVE, EXPIRED, REJECTED, NOT_REQUIRED), issue and expiry dates (expiry ≥ issue) per product and
  country. Recorded for information; not yet required for publishing (open question in
  `docs/COUNTRY_COMPLIANCE.md`).

## Storefront

- Shows only sellable products (see above) for the visitor's market; drafts, inactive and discontinued
  products and products of inactive brands return 404.
- "From" price = lowest active price among the product's active variants in that market.
- No online ordering yet; the product page says so (ADR-014).

## Organisation

- Legal entities belong to one country (fixed after creation). Stores and warehouses belong to a legal
  entity and must be in the same country (composite foreign key).
- Codes (legal entities, stores, warehouses): upper-case `^[A-Z0-9][A-Z0-9_-]*$`, unique.
- Tax registration number format: SA 15 digits starting and ending with 3; EG 9 digits (pending
  confirmation, KSA-ID-01 / EG-ID-01).
- Store types: ONLINE or RETAIL; each store has a time zone and the country's currency.

## Staff users and access

- Staff e-mails are stored lower-case and unique. Statuses: ACTIVE, SUSPENDED, DEACTIVATED; only
  ACTIVE users can sign in. Suspending or deactivating a user, or an administrator resetting their
  password, signs them out everywhere.
- Passwords: 12–128 characters, not a common password, not containing the e-mail name.
- Role assignments are scoped (`docs/RBAC.md`). Nobody can grant permissions or scopes they do not hold
  themselves; the last active global Super Admin cannot be suspended or lose the role (checked in a
  serializable transaction).

## Audit

- Every create, update, status change, price change, role change, sign-in event and seed run is
  recorded with actor, time, IP, user agent, correlation id, summary and redacted before/after data.
- Audit entries cannot be edited or deleted (database triggers). The full log is visible only with a
  GLOBAL `audit.view` grant.

## Dashboard KPIs

| KPI                        | Definition                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Published products         | Products with status PUBLISHED                                                             |
| Draft products             | Products with status DRAFT                                                                 |
| Active SKUs                | Variants with status ACTIVE (any product status)                                           |
| Active brands / categories | Brands / categories marked active                                                          |
| SKUs without barcode       | ACTIVE variants with no barcode                                                            |
| Missing Arabic description | DRAFT or PUBLISHED products without an Arabic description                                  |
| Priced SKUs per market     | ACTIVE variants with an active price in that country                                       |
| Published without price    | PUBLISHED products with no ACTIVE variant actively priced in that market (invisible there) |
| Active staff               | Staff users with status ACTIVE (shown with `users.view`)                                   |
| Recent activity            | Latest audit entries (shown with GLOBAL `audit.view`)                                      |

## Approvals (APR-001, ADR-019)

- A request names its subject (type and id), a summary, a reason and the scope where the subject lives.
  At most one request per subject is pending at a time.
- Submitting requires the subject's request permission at that scope; approving or rejecting requires
  its approve permission at that scope (`docs/RBAC.md` §Approvals).
- **The requester can never approve or reject their own request**, even when they hold the approve
  permission. A rejection must give a reason.
- A decision is final. The requester may withdraw (cancel) a pending request; the owning module may
  cancel it as the system when the subject is voided.
- Submission, decision and cancellation are audited and recorded in the request's history, in the same
  transaction as the subject's change.

## Inventory (INV-001, ADR-020)

- Stock is kept per variant, warehouse and status: sellable, quarantined, damaged, returned. Quantities
  are whole units. Only variants with inventory tracking hold stock.
- Every change is a movement in the append-only stock ledger, written in the same transaction as the
  balance it changes; corrections are new movements, never edits.
- Stock never goes negative and only unreserved stock can leave (`available = on hand − reserved`),
  also under concurrent sales. A posting either applies all its lines or none.
- Repeating a posting with the same key changes nothing; reusing a key for different lines is refused.
- Unit costs are exact decimals with up to 4 places in the warehouse country's currency; more precision
  is rejected.
- Opening balances record stock that existed before the system: permission `inventory.adjust.approve`
  for the warehouse, a reason and a unit cost (zero allowed), once per variant, warehouse and status,
  and only while that balance has no history. Each is audited.

## Suppliers (PUR-001, ADR-021)

- A supplier belongs to one buying legal entity (and its country), fixed after creation; a supplier
  selling to both markets has one record per entity.
- Tax numbers are format-checked by the **supplier's** country (KSA: 15 digits starting and ending
  with 3; Egypt: 9 digits; elsewhere 4–40 letters/digits) and unique within a buying entity.
- Payment terms: prepaid, on delivery, or net with 1–365 days.
- Contacts: at most one primary (the first contact becomes primary); removable; the audit trail keeps
  only the name, job title and which fields changed.
- Supplier products link the supplier's code to one of our variants (found by SKU or barcode), once per
  supplier and once per supplier code. The last unit cost is exact to two decimals, stored with its
  currency and date; an unchanged amount is never relabelled when the supplier's currency changes.
  Purchase orders (PUR-002) will update it.
- Suppliers and supplier products are deactivated, never deleted; inactive suppliers cannot get new
  product links.

## Planned rules (later phases — not enforced yet)

- **Inventory (INV-002…005):** adjustments need a reason and approval; batches with expiry are picked
  first-expiry-first-out; quarantined or rejected batches are never sold; valuation per ADR-018 (moving
  weighted average per legal entity).
- **Orders (ORD-001):** prices, taxes and product names are snapshotted on the order; stock is reserved
  at checkout and released on expiry or cancellation; order numbers are sequential per country.
- **Payments (PAY-001/002):** an order is paid only on verified evidence (provider confirmation with a
  valid signature, staff-verified bank transfer, collected COD); refunds need approval; no card data is
  stored.
- **POS (POS-001):** sales only within an open cashier session; discounts beyond policy need an override
  permission; sessions close with cash reconciliation.
- **Tax documents (EINV-001/002):** invoices are immutable once issued; corrections use credit/debit
  notes; authority submissions are never reported as successful without an acknowledgement.
