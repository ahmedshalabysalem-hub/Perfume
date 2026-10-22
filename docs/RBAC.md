# Roles, permissions and access scopes

Decision: ADR-007. Code: `src/server/rbac/` (`permissions.ts`, `roles.ts`, `scope.ts`, `authorize.ts`,
`actor.ts`, `sync.ts`). Tests: `tests/unit/rbac.test.ts`, `tests/integration/access-and-organization.test.ts`,
`tests/integration/procurement.test.ts`,
`tests/e2e/access-control.spec.ts`.

## Model

- **Permissions** — a fixed catalogue in code (49 keys). 20 are active today (`inventory.view` and
  `inventory.adjust.approve` since INV-001; `suppliers.view` and `suppliers.manage` since PUR-001); the rest are reserved for
  later modules (`available: false`) so roles can be defined once.
- **Roles** — 12 system roles in code, each with a permission set and the scope types it may be
  assigned at. `npm run db:sync-rbac` (also run by the seed) upserts both into the database.
- **Role assignments** (`user_roles`) — a user holds a role **at a scope**: GLOBAL, COUNTRY,
  LEGAL_ENTITY, STORE or WAREHOUSE. A user may hold several assignments.
- **Actor** — on every request the user, status and assignments are reloaded from the database, so
  revocations and suspensions take effect immediately.

## Scopes and targets

Services call `assertCan(actor, permission, target)` (or `can` / `scopeFilterFor` for lists).

| Target                                                 | Meaning                                                           | Satisfied by                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `"global"`                                             | Organisation-wide data or writes to shared master data            | the permission at GLOBAL scope only                                                                                    |
| `"any"` (default)                                      | Reading organisation-wide master data                             | the permission at any scope                                                                                            |
| `{ countryCode, legalEntityId, storeId, warehouseId }` | A record that belongs somewhere (callers pass its full hierarchy) | GLOBAL; COUNTRY with that country; LEGAL_ENTITY with that entity; STORE with that store; WAREHOUSE with that warehouse |

## Enforcement today

| Operation                                            | Permission and target                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Back office access, dashboard                        | `admin.access`; `dashboard.view` (any)                                                                                           |
| View catalogue, history, reference lists             | `products.view` (any)                                                                                                            |
| Create/update products, variants, images             | `products.create` / `products.update` — **global**                                                                               |
| Publish / unpublish                                  | `products.publish` — **global** (other status changes `products.update`)                                                         |
| Set a market price                                   | `products.prices.update` — the price's **country** (each changed entry checked)                                                  |
| Regulatory references                                | `products.compliance.manage` — the reference's **country**                                                                       |
| Brands, categories, notes, families, concentrations  | `catalog.*.manage` — **global**                                                                                                  |
| View organisation                                    | `organization.view` (any; lists filtered by scope)                                                                               |
| Update a country                                     | `organization.manage` — **global**                                                                                               |
| Create/update legal entities, stores, warehouses     | `organization.manage` — the record's country / legal entity                                                                      |
| View staff and roles                                 | `users.view`                                                                                                                     |
| Create or edit staff, reset passwords, change status | `users.manage` — **global**                                                                                                      |
| Assign / revoke a role                               | `users.manage` covering the assignment's scope (GLOBAL assignments need GLOBAL), plus every permission of the role at that scope |
| Audit log (and dashboard recent activity)            | `audit.view` — **global** (the log is not partitioned by scope)                                                                  |
| View stock balances and movements                    | `inventory.view` — the warehouse (lists filtered by scope; ADR-020)                                                              |
| Enter opening balances                               | `inventory.adjust.approve` — the warehouse                                                                                       |
| View suppliers, contacts, supplier products, history | `suppliers.view` — the supplier's **legal entity / country** (lists filtered by scope; ADR-021)                                  |
| Create/update suppliers, contacts, supplier products | `suppliers.manage` — the supplier's **legal entity / country**; STORE and WAREHOUSE assignments never cover suppliers            |

Pages additionally call `getAdminPageActor(permission)` and render a no-access state, but the
services above are the security boundary; hidden buttons are a convenience only.

## Rules

1. Authorization is decided in services, never in Server Actions, components or layouts.
2. A role can only be assigned at the scope types it allows (e.g. Cashier: STORE only).
3. **No privilege escalation:** assigning a role requires `users.manage` covering the target scope
   **and** every permission of that role at that scope.
4. The last active global Super Admin cannot be suspended, deactivated or lose the role (checked in a
   serializable transaction).
5. Only ACTIVE staff can sign in; suspension and deactivation revoke all sessions.
6. Customers (role `customer`) have no back-office permissions.
7. Every assignment, revocation, status change and password reset is audited.

## Roles

| Role (key)                                    | Assignable scopes                        | Purpose                                            |
| --------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Super Admin (`super_admin`)                   | GLOBAL                                   | Everything (all 49 permissions)                    |
| Business / Store Manager (`business_manager`) | GLOBAL, COUNTRY, LEGAL_ENTITY, STORE     | Runs a business unit: catalogue, prices, approvals |
| Catalogue Manager (`catalog_manager`)         | GLOBAL, COUNTRY                          | Catalogue content and prices                       |
| Sales Staff (`sales_staff`)                   | GLOBAL, COUNTRY, STORE                   | Orders and customers                               |
| Inventory Manager (`inventory_manager`)       | GLOBAL, COUNTRY, LEGAL_ENTITY, WAREHOUSE | Stock, receipts, adjustments approval              |
| Warehouse Staff (`warehouse_staff`)           | WAREHOUSE                                | Receiving, counting, adjustment requests           |
| Procurement Staff (`procurement_staff`)       | GLOBAL, COUNTRY, LEGAL_ENTITY            | Suppliers and purchase orders                      |
| Accountant (`accountant`)                     | GLOBAL, COUNTRY, LEGAL_ENTITY            | Payments verification, journals, financial reports |
| Marketing Staff (`marketing_staff`)           | GLOBAL, COUNTRY                          | Promotions, reviews                                |
| Customer Support (`customer_support`)         | GLOBAL, COUNTRY, STORE                   | Orders, customers, refund requests                 |
| Cashier (`cashier`)                           | STORE                                    | Point of sale                                      |
| Customer (`customer`)                         | GLOBAL                                   | Storefront account; no back office                 |

## Active permissions × roles

SA Super Admin · BM Business Manager · CM Catalogue Manager · SS Sales Staff · IM Inventory Manager ·
WS Warehouse Staff · PS Procurement · AC Accountant · MK Marketing · CS Customer Support · CA Cashier.
The Customer role has none.

| Permission                   | SA  | BM  | CM  | SS  | IM  | WS  | PS  | AC  | MK  | CS  | CA  |
| ---------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin.access`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |
| `dashboard.view`             | ✓   | ✓   | ✓   | ✓   | ✓   |     | ✓   | ✓   | ✓   |     |     |
| `products.view`              | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |     | ✓   | ✓   | ✓   |
| `products.create`            | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `products.update`            | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `products.publish`           | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `products.prices.update`     | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `products.compliance.manage` | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `catalog.brands.manage`      | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `catalog.categories.manage`  | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `catalog.attributes.manage`  | ✓   | ✓   | ✓   |     |     |     |     |     |     |     |     |
| `organization.view`          | ✓   | ✓   |     |     | ✓   |     |     | ✓   |     |     |     |
| `organization.manage`        | ✓   |     |     |     |     |     |     |     |     |     |     |
| `users.view`                 | ✓   | ✓   |     |     |     |     |     |     |     |     |     |
| `users.manage`               | ✓   |     |     |     |     |     |     |     |     |     |     |
| `audit.view`                 | ✓   | ✓   |     |     |     |     |     |     |     |     |     |
| `inventory.view`             | ✓   | ✓   |     |     | ✓   | ✓   | ✓   |     |     |     |     |
| `inventory.adjust.approve`   | ✓   | ✓   |     |     | ✓   |     |     |     |     |     |     |
| `suppliers.view`             | ✓   | ✓   |     |     | ✓   |     | ✓   | ✓   |     |     |     |
| `suppliers.manage`           | ✓   |     |     |     |     |     | ✓   |     |     |     |     |

Because catalogue writes and the audit log are **global** targets, a Business or Catalogue Manager
assigned at COUNTRY scope can view the catalogue and change only their country's prices and regulatory
references; they cannot create products, edit shared master data or read the audit log.

## Reserved permissions (planned modules)

| Module       | Permissions (roles holding them today)                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Inventory    | `inventory.receive` (IM, WS), `inventory.adjust.request` (IM, WS), `inventory.transfer` (IM), `inventory.count` (IM, WS) |
| Procurement  | `purchases.view` (BM, IM, PS), `purchases.create` (PS), `purchases.approve` (BM)                                         |
| Sales        | `orders.view` (BM, SS, AC, CS), `orders.create` (SS), `orders.update` (BM, SS), `orders.cancel` (BM)                     |
| CRM          | `customers.view` (BM, SS, CS, CA), `customers.manage` (CS), `customers.export` (SA only)                                 |
| Payments     | `payments.verify` (AC), `payments.refund.request` (CS), `payments.refund.approve` (BM)                                   |
| POS          | `pos.sell` (CA), `pos.session.manage` (BM), `pos.discount.override` (BM)                                                 |
| Accounting   | `accounting.view` (AC), `accounting.post` (AC), `expenses.manage` (AC)                                                   |
| Reports      | `reports.view` (BM, IM, AC, MK), `reports.financial.view` (BM, AC)                                                       |
| Marketing    | `marketing.manage` (MK), `loyalty.manage` (SA only), `reviews.moderate` (MK)                                             |
| Integrations | `integrations.manage` (SA only)                                                                                          |

Super Admin holds all of them. Each module task revisits its permissions (approval separation of
duties, scopes) before marking them available.

## Approvals and separation of duties (APR-001, ADR-019)

Approval policies live in `src/server/modules/approvals/subjects.ts`: `inventory.adjustment`
(`inventory.adjust.request` → `inventory.adjust.approve`), `purchases.order` (`purchases.create` →
`purchases.approve`), `payments.refund` (`payments.refund.request` → `payments.refund.approve`).

- Submitting needs the request permission at a scope covering the subject; deciding needs the approve
  permission at a covering scope. The scope is resolved from its most specific element (a warehouse
  request is also matched by approvers at its legal entity or country).
- The requester can never approve or reject their own request, whatever roles they hold (service check
  plus the CHECK `approval_requests_requester_cannot_decide`). Roles that hold both permissions (Inventory
  Manager, Super Admin) can therefore only decide other people's requests.
- Only staff users submit and decide; only the requester (or a system actor voiding the subject) cancels.
- A request is visible to its requester and to holders of its approve permission in scope; others get
  "not found".

## Changing permissions or roles

1. Edit `src/server/rbac/permissions.ts` / `roles.ts` (keys are stable; never reuse a key).
2. Update this document and the unit tests in `tests/unit/rbac.test.ts`.
3. Run `npm run db:sync-rbac` (or the seed) in each environment; the sync reports grants added/removed.
4. Add integration tests for the new service checks (allowed and forbidden, per scope).
