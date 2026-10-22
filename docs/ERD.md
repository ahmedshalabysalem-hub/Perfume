# Entity-relationship diagrams

Implemented schema (34 tables) as of migration `20261022072014_suppliers`. Columns are limited to keys and
the fields that define relationships; full definitions are in `prisma/schema/*.prisma` and
`docs/DATABASE.md`.

## Organisation and access

```mermaid
erDiagram
  CURRENCIES ||--o{ COUNTRIES : "currency of"
  COUNTRIES ||--o{ LEGAL_ENTITIES : "registers"
  LEGAL_ENTITIES ||--o{ STORES : "operates (same country)"
  LEGAL_ENTITIES ||--o{ WAREHOUSES : "operates (same country)"
  CURRENCIES ||--o{ STORES : "trades in"
  USERS ||--o{ SESSIONS : "signs in with"
  USERS ||--o{ ACCOUNTS : "authenticates via"
  USERS ||--o{ USER_ROLES : "holds"
  ROLES ||--o{ USER_ROLES : "assigned as"
  ROLES ||--o{ ROLE_PERMISSIONS : "grants"
  PERMISSIONS ||--o{ ROLE_PERMISSIONS : "granted in"
  COUNTRIES |o--o{ USER_ROLES : "scope"
  LEGAL_ENTITIES |o--o{ USER_ROLES : "scope"
  STORES |o--o{ USER_ROLES : "scope"
  WAREHOUSES |o--o{ USER_ROLES : "scope"
  USERS |o..o{ AUDIT_LOGS : "actor (no FK)"

  CURRENCIES {
    char3 code PK
    smallint minor_units
  }
  COUNTRIES {
    char2 code PK
    char3 currency_code FK
    boolean prices_include_tax
    boolean is_active
  }
  LEGAL_ENTITIES {
    uuid id PK
    varchar code UK
    char2 country_code FK
    varchar tax_registration_no
  }
  STORES {
    uuid id PK
    varchar code UK
    uuid legal_entity_id FK
    char2 country_code FK
    enum type
  }
  WAREHOUSES {
    uuid id PK
    varchar code UK
    uuid legal_entity_id FK
    char2 country_code FK
  }
  USERS {
    uuid id PK
    varchar email UK
    enum type
    enum status
  }
  SESSIONS {
    uuid id PK
    uuid user_id FK
    varchar token UK
  }
  ACCOUNTS {
    uuid id PK
    uuid user_id FK
    varchar provider_id
  }
  ROLES {
    uuid id PK
    varchar key UK
  }
  PERMISSIONS {
    varchar key PK
  }
  ROLE_PERMISSIONS {
    uuid role_id PK, FK
    varchar permission_key PK, FK
  }
  USER_ROLES {
    uuid id PK
    uuid user_id FK
    uuid role_id FK
    enum scope_type
    varchar scope_key
  }
  AUDIT_LOGS {
    uuid id PK
    uuid actor_user_id
    varchar action
    varchar entity_type
    varchar entity_id
  }
```

`verifications` and `rate_limits` (Better Auth bookkeeping) have no relationships and are omitted.
`audit_logs.actor_user_id` deliberately has no foreign key: the trail must outlive any record.

## Catalogue

```mermaid
erDiagram
  BRANDS ||--o{ PRODUCTS : "makes"
  CATEGORIES |o--o{ CATEGORIES : "parent of"
  CATEGORIES |o--o{ PRODUCTS : "primary category"
  PRODUCTS ||--o{ PRODUCT_CATEGORIES : "listed in"
  CATEGORIES ||--o{ PRODUCT_CATEGORIES : "contains"
  FRAGRANCE_FAMILIES |o--o{ PRODUCTS : "classifies"
  FRAGRANCE_CONCENTRATIONS |o--o{ PRODUCTS : "strength"
  PRODUCTS ||--o{ PRODUCT_FRAGRANCE_NOTES : "has"
  FRAGRANCE_NOTES ||--o{ PRODUCT_FRAGRANCE_NOTES : "used in"
  PRODUCTS ||--o{ PRODUCT_VARIANTS : "sold as"
  PRODUCT_VARIANTS ||--o{ PRODUCT_PRICES : "priced per market"
  COUNTRIES ||--o{ PRODUCT_PRICES : "market (with its currency)"
  PRODUCTS ||--o{ PRODUCT_IMAGES : "shown in"
  PRODUCT_VARIANTS |o--o{ PRODUCT_IMAGES : "optionally specific to"
  PRODUCTS ||--o{ PRODUCT_COMPLIANCE : "regulatory references"
  COUNTRIES ||--o{ PRODUCT_COMPLIANCE : "issued in"

  BRANDS {
    uuid id PK
    varchar slug UK
    boolean is_active
  }
  CATEGORIES {
    uuid id PK
    uuid parent_id FK
    varchar slug UK
  }
  PRODUCTS {
    uuid id PK
    varchar slug UK
    uuid brand_id FK
    uuid primary_category_id FK
    enum status
    text search_text
  }
  PRODUCT_CATEGORIES {
    uuid product_id PK, FK
    uuid category_id PK, FK
  }
  FRAGRANCE_NOTES {
    uuid id PK
    varchar slug UK
  }
  PRODUCT_FRAGRANCE_NOTES {
    uuid product_id PK, FK
    uuid note_id PK, FK
    enum layer PK
  }
  PRODUCT_VARIANTS {
    uuid id PK
    uuid product_id FK
    varchar sku UK
    varchar barcode UK
    enum status
  }
  PRODUCT_PRICES {
    uuid id PK
    uuid variant_id FK
    char2 country_code FK
    char3 currency_code FK
    numeric amount
  }
  PRODUCT_IMAGES {
    uuid id PK
    uuid product_id FK
    uuid variant_id FK
    varchar storage_key UK
  }
  PRODUCT_COMPLIANCE {
    uuid id PK
    uuid product_id FK
    char2 country_code FK
    varchar authority
    enum status
  }
```

`product_prices (country_code, currency_code)` references `countries (code, currency_code)`, so a
price is always in its market's currency; `(variant_id, country_code)` is unique.

## Procurement (PUR-001)

```mermaid
erDiagram
  LEGAL_ENTITIES ||--o{ SUPPLIERS : "buys from"
  COUNTRIES ||--o{ SUPPLIERS : "country of buying entity"
  CURRENCIES ||--o{ SUPPLIERS : "purchasing currency"
  SUPPLIERS ||--o{ SUPPLIER_CONTACTS : "reached through"
  SUPPLIERS ||--o{ SUPPLIER_PRODUCTS : "offers"
  PRODUCT_VARIANTS ||--o{ SUPPLIER_PRODUCTS : "supplied as"
  CURRENCIES |o--o{ SUPPLIER_PRODUCTS : "last cost currency"
```

## Approvals (APR-001)

```mermaid
erDiagram
  USERS ||--o{ APPROVAL_REQUESTS : "requests"
  USERS |o--o{ APPROVAL_REQUESTS : "decides"
  COUNTRIES |o--o{ APPROVAL_REQUESTS : "scope"
  LEGAL_ENTITIES |o--o{ APPROVAL_REQUESTS : "scope"
  STORES |o--o{ APPROVAL_REQUESTS : "scope"
  WAREHOUSES |o--o{ APPROVAL_REQUESTS : "scope"
  APPROVAL_REQUESTS ||--o{ APPROVAL_ACTIONS : "history"
  USERS |o--o{ APPROVAL_ACTIONS : "acted by"
```

The subject (`subject_type`, `subject_id`) is a polymorphic reference without a foreign key (ADR-019).

## Inventory (INV-001)

```mermaid
erDiagram
  WAREHOUSES ||--o{ STOCK_BALANCES : "holds"
  PRODUCT_VARIANTS ||--o{ STOCK_BALANCES : "stocked as"
  WAREHOUSES ||--o{ STOCK_MOVEMENTS : "at"
  PRODUCT_VARIANTS ||--o{ STOCK_MOVEMENTS : "of"
  CURRENCIES |o--o{ STOCK_MOVEMENTS : "unit cost currency"
```

One balance per variant, warehouse and status; movements are append-only (ADR-020).

## Phase 2 — indicative only (designed in INV-002/PUR-002)

Not implemented. The final design is recorded in `docs/DECISIONS.md` and this file when each task ends.

```mermaid
erDiagram
  PRODUCT_VARIANTS ||--o{ BATCHES : "received in"
  BATCHES |o--o{ STOCK_MOVEMENTS : "of batch"
  SUPPLIERS ||--o{ PURCHASE_ORDERS : "supplies"
  PURCHASE_ORDERS ||--o{ GOODS_RECEIPTS : "received through"
  GOODS_RECEIPTS ||--o{ STOCK_MOVEMENTS : "posts"
```
