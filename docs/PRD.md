# Product requirements

Structured requirements derived from the original brief (`docs/reference/ORIGINAL_BRIEF.md`). Rules
are detailed in `docs/BUSINESS_RULES.md`; delivery order in `docs/IMPLEMENTATION_PLAN.md`; task status
in `docs/TASK_BOARD.md`.

## 1. Product

A full-stack perfume e-commerce platform integrated with retail, inventory, purchasing and operational
accounting, for one business selling **its own stock** online and in physical stores in **Saudi Arabia
and Egypt**. Suppliers sell to the business; the business sells to customers. It is **not a
marketplace** and has no supplier portal unless requested later.

- Markets and currencies: Saudi Arabia (SAR), Egypt (EGP). Separate legal entities and country
  configuration; one legal entity is not assumed to operate in both countries.
- Languages: Arabic (RTL, default) and English (LTR) across storefront and back office.
- Channels: online store, physical retail stores (POS); one warehouse at launch, multiple warehouses and
  stores supported.
- Payments: online provider, cash on delivery, bank transfer, in-store POS.
- Future: n8n automations and AI services through narrowly scoped, authenticated APIs.

## 2. Users

| Persona / role                     | Needs                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| Customer (visitor, account)        | Browse in their language and market, clear prices, buy, track, return |
| Super Admin                        | Configure everything, manage staff and roles                          |
| Business / Store Manager           | Run a country, entity or store: catalogue, prices, approvals, reports |
| Catalogue Manager                  | Products, variants, prices, images, compliance references             |
| Sales Staff, Customer Support      | Orders and customers within scope                                     |
| Inventory Manager, Warehouse Staff | Receipts, counts, adjustments, transfers, batches                     |
| Procurement Staff                  | Suppliers, purchase orders                                            |
| Accountant                         | Payments verification, journals, expenses, financial reports          |
| Marketing Staff                    | Promotions, coupons, reviews                                          |
| Cashier                            | Sell in an assigned store                                             |

Permissions and scopes: `docs/RBAC.md`.

## 3. Interfaces

**Storefront** — premium fragrance-brand look (not a dashboard), responsive, Arabic/English switching
with correct RTL/LTR, product imagery and cards, clear pricing and availability, accessible forms and
errors, loading/empty/error/success/unavailable states, search, sorting, filtering, pagination,
SEO-friendly product pages.

**Back office** — sidebar navigation by module, dashboard KPIs, searchable/sortable/paginated tables,
validated forms, status indicators, role-aware navigation and actions, filters by country, store,
warehouse, date range, supplier and product, confirmation dialogs for sensitive actions, consistent
states. Authorization is enforced on the server, never only by hiding UI.

## 4. Functional modules

Status: **Done** (implemented and tested), **Partial**, **Planned**. Phase numbers follow the brief.

| #   | Module                                 | Phase | Status                        | Tasks                                  |
| --- | -------------------------------------- | ----- | ----------------------------- | -------------------------------------- |
| 1   | Product catalogue                      | 1     | Done (import/export planned)  | CAT-001, CAT-002, CAT-003              |
| 2   | Inventory and warehouse management     | 2     | Partial (stock ledger)        | ORG-001, INV-001…005                   |
| 3   | Suppliers and procurement              | 2     | Partial (suppliers)           | PUR-001, PUR-002, PUR-003              |
| 4   | Customers and CRM                      | 3, 6  | Planned                       | CUST-001, CRM-001                      |
| 5   | Cart and checkout                      | 3     | Planned                       | ORD-001, PRC-001, SHIP-001             |
| 6   | Order management                       | 3     | Planned                       | ORD-001, ORD-002                       |
| 7   | Payments and refunds                   | 4     | Planned                       | PAY-001, PAY-002                       |
| 8   | Shipping and returns                   | 4     | Planned                       | SHIP-002, RET-001                      |
| 9   | Point of sale                          | 4, 6  | Planned                       | POS-001, POS-002                       |
| 10  | Invoicing and country compliance       | 5     | Planned (research done)       | INVC-001, EINV-001, EINV-002, COMP-001 |
| 11  | Operational accounting                 | 5     | Planned                       | FIN-001…003                            |
| 12  | Loyalty, promotions, marketing         | 6     | Planned                       | MKT-001, LOY-001, REV-001              |
| 13  | Dashboard and reporting                | 1, 7  | Partial (catalogue KPIs)      | ADM-001, RPT-001                       |
| 14  | Users, RBAC, approvals, audit          | 1, 2  | Done (approval UI per module) | AUTH-001/002, AUD-001, APR-001         |
| 15  | System administration and integrations | 1, 7  | Partial (organisation)        | ORG-001, INT-001, AI-001               |

### Module 1 — Product catalogue _(Done, except import/export)_

Products, brands, hierarchical categories, variants (each sellable SKU has its own SKU, barcode, cost,
price, inventory and status), images, fragrance notes (top/heart/base), product-category and
product-note relations, country-specific availability and pricing, statuses (draft, published,
inactive, discontinued), search/sort/filter/pagination. Perfume attributes: audience, concentration
(configurable), family, notes, volume in ml, country of origin, manufacturer, ingredients, warnings,
storage, regulatory references. Regular perfumes, gift sets and other product types; products may have
several sizes. Barcodes: scanning, uniqueness, label printing, never fabricated GTINs.
**Open:** product import/export with validation (CAT-003); per-variant purchase cost arrives with
procurement (PUR-002).

### Module 2 — Inventory and warehouse _(Partial: warehouses, stock ledger, balances and opening balances — INV-001)_

Warehouses and optional locations/shelves, balances, movements, reservations, goods receipts, counts,
adjustments, transfers, statuses (sellable, damaged, quarantined, returned), reorder thresholds and
low-stock alerts, valuation support, batch/lot tracking (number, variant, supplier and receipt,
manufacturing and expiry dates, inspection/quarantine status, quantities, compliance references).
Critical rules (ledger, same-transaction updates, no overselling, no negative stock, approved
adjustments with reasons, no sale from quarantined/rejected batches, return dispositions, consistent
reservations, idempotent retries, multi-warehouse): `docs/BUSINESS_RULES.md` §Planned rules.

### Module 3 — Suppliers and procurement _(Partial: supplier profiles, contacts and supplier products — PUR-001)_

Supplier profiles and contacts, supplier product references/codes, purchase orders and items with
configurable approval, partial and full receipts, inspections and rejected quantities, supplier
invoices, returns, payments and balances, purchase cost history, supplier performance. One PO may have
many receipts; one product many suppliers; purchase costs are separate from selling prices.

### Module 4 — Customers and CRM _(Planned)_

Profiles, contact details, multiple addresses, marketing consent records, order history, segmentation,
loyalty history, authorised support notes, export and deletion/anonymisation workflows, optional guest
checkout. Data minimisation; no access to other customers' data by changing identifiers.

### Module 5 — Cart and checkout _(Planned)_

Guest and registered carts, live price and availability validation, coupon/promotion validation,
address selection, shipping cost, country and currency determination, order creation, stock
reservation, failure recovery, confirmation notifications. The server recalculates every amount and
snapshots prices, discounts, taxes and currency.

### Module 6 — Orders _(Planned)_

Documented state machine (pending payment, payment verification, confirmed, processing, ready for
dispatch, shipped, delivered, cancellation requested, cancelled, return requested, partially returned,
returned, failed delivery — only those that fit), unique references, items with price snapshots, status
history, authorised cancellation with reason, partial fulfilment, shipment/return/refund links, search,
customer tracking, admin notes. Order, payment, fulfilment, shipment and return statuses are separate.

### Module 7 — Payments and refunds _(Planned)_

Online provider (adapter abstraction; possibly different providers per country), COD, bank transfer,
POS. Payment records, attempts and provider ids, status history, refunds, reconciliation, idempotency,
verified webhooks with deduplicated event ids, retries, COD collection and settlement, verified bank
transfers, POS session transactions. Never trust browser redirects; never store card data; mock/manual
adapters clearly labelled and never used as real in production.

### Module 8 — Shipping and returns _(Planned)_

Provider configuration per market, zones and fees, shipments and tracking, status history, partial
shipments, failed deliveries (including COD), return requests and items, inspection and disposition,
refunds, carrier COD reconciliation.

### Module 9 — POS _(Planned)_

Cashier sessions, product lookup and barcode scanning, variant selection, cart and checkout, tender
types (cash, card via terminal, others), payment references, receipts, discount permissions, returns
and refunds, session open/close, cash drawer reconciliation, user and store association. Online
connection required initially; offline support only if designed and tested. Sales update stock,
customer, accounting and fiscal documents consistently.

### Module 10 — Invoicing and country compliance _(Planned; register done)_

Country/legal-entity configuration, tax profiles with effective-dated rates, inclusive/exclusive
pricing, invoice numbering and sequences, invoice items with tax breakdown, credit notes and
corrections, fiscal submission status, authority references and error logs, seller/buyer legal
details, document generation and storage. ZATCA (KSA) and ETA (Egypt) via adapters with configuration
checklists; never claim integration or compliance without validation. Requirements and sources:
`docs/COUNTRY_COMPLIANCE.md`.

### Module 11 — Operational accounting _(Planned)_

Chart of accounts, periods, balanced journal entries (posted entries corrected only by reversal),
expense categories and expenses, customer payments, refunds and credit notes, supplier invoices and
payments, inventory cost and COGS (valuation policy first — ADR-018), shipping and operating costs,
sales and gross-margin reports, cash/POS and COD reconciliation, currency and exchange rates with
snapshots. Not a certified statutory accounting system; accountant review required.

### Module 12 — Loyalty, promotions, marketing _(Planned)_

Coupons and redemptions, fixed and percentage discounts, dates, usage limits, eligibility,
product/category restrictions, minimum order value, stacking rules, loyalty accounts with a ledger
(earn, redeem, expiry, reversal on returns), product reviews with moderation, campaigns, consented
abandoned-cart events, notification preferences.

### Module 13 — Dashboards and reports _(Partial)_

Catalogue KPIs exist (definitions in `docs/BUSINESS_RULES.md`). Planned: gross/net sales, orders by
status, sales by country/store/channel/date, best sellers, discounts/refunds/cancellations, gross
margin and COGS, inventory valuation, low and slow stock, expiry alerts, purchasing and supplier
performance, repeat purchases, supplier balances, COD outstanding, POS reconciliation, expenses,
loyalty. Financial KPIs carry written definitions; sales are never labelled profit.

### Module 14 — Users, RBAC, approvals, audit _(Done; approval screens arrive with each module)_

Server-side permission checks with data scopes by legal entity, country, store and warehouse; audit of
sensitive actions with actor, time, action, target, safe before/after values, reason/approval reference
and correlation id; no secrets or unnecessary personal data in logs. The approval framework
(APR-001, ADR-019) gives stock adjustments, purchase orders and refunds a maker-checker workflow;
financial postings will add their policy with FIN-001. Approval screens ship with each consuming module.

### Module 15 — Administration and integrations _(Partial)_

Done: countries, legal entities, stores, warehouses, roles and access scopes, barcode labels.
Planned: tax and invoice profiles, payment methods and providers, shipping providers, notifications
and templates, label settings, audit-log retention, integration configuration and health, feature
flags; authenticated, scoped APIs and validated business events with idempotency and retries for n8n;
AI features (sales summaries, replenishment suggestions, recommendations) that cannot bypass business
rules, authorization, payment verification or inventory controls.

## 5. Non-functional requirements

| Area          | Requirement                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security      | OWASP top risks addressed (access control, injection, XSS, CSRF, IDOR); server-side validation and authorization; secrets in environment/secret manager; no card data |
| Privacy       | Data minimisation, consent, export/erasure, KSA PDPL and Egypt Law 151/2020 (`docs/COUNTRY_COMPLIANCE.md`)                                                            |
| Integrity     | Transactions, constraints, idempotency, immutable ledgers, validated state transitions, historical snapshots, soft deactivation                                       |
| Money         | Exact decimals, documented precision and rounding, currency preserved on transactions                                                                                 |
| Time          | Timestamps stored with time zone; store-specific time zones                                                                                                           |
| i18n and a11y | Full Arabic/English, RTL/LTR, keyboard-accessible, labelled forms, target WCAG 2.1 AA                                                                                 |
| Performance   | Pagination and indexes for large lists; storefront pages render server-side                                                                                           |
| Operability   | Health check, correlation ids, structured errors, backup and restore, observability (OPS-003)                                                                         |
| Quality       | Automated unit, integration and e2e tests; CI on every push                                                                                                           |

## 6. Out of scope

Third-party seller marketplace, supplier portal, multi-tenant SaaS, offline POS (until designed),
certified statutory accounting, any authority integration without credentials and validation.

## 7. Open business decisions

Final brand name (placeholder "Perfume House"); legal-entity details per country; payment providers per
country; shipping carriers; return and refund policy per market; loyalty earning and expiry rules;
accountant review of the inventory costing method (ADR-018 Accepted by the owner; review recommended); whether regulatory registration must exist before
publishing (COUNTRY_COMPLIANCE open questions); hosting region (PDPL).
