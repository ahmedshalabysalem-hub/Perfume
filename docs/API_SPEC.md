# API specification

Today the application exposes **Server Actions** (used by its own UI) and a few **HTTP endpoints**.
There is no public business API yet; the integration API for n8n and other systems is INT-001
(conventions fixed below so modules are built ready for it). Authorization rules: `docs/RBAC.md`.

## 1. Server Actions

Next.js Server Actions are POST requests from the application's own pages, bound to an encrypted
action id, same-origin only, authenticated by the session cookie. They are not a stable public API.

### Contract

- Every authenticated action runs through `runAction` (`src/server/actions/run-action.ts`): it
  re-validates the session, reloads the actor, calls exactly one service and maps errors.
- Input is validated by the service with the shared Zod schema named below (the client validates the
  same schema for UX only). Unknown fields are stripped; money, digits and codes are normalised.
- Result (`src/server/actions/result.ts`):

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        messageKey: string;
        params?: Record<string, string | number>;
        fieldErrors?: Record<string, string[]>;
      };
    };
type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_STATE"
  | "RATE_LIMITED"
  | "INTERNAL";
```

- `messageKey`/`fieldErrors` hold translation keys (`validation.required`,
  `errors.conflict.sku`, or `key|{"param":…}` descriptors); the client translates them.
- `INTERNAL` carries only a `reference` (the request correlation id) — details are logged server-side.
- State changes are audited in the same transaction. Idempotency keys are not needed for these
  interactive forms; they become mandatory for the integration API and webhooks (§4).

### Catalogue — `src/app/[locale]/admin/catalog/**/actions.ts`

| Action                                                                         | Service                                              | Permission (target)                                     | Input schema                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `createProductAction`                                                          | `createProduct`                                      | `products.create` (global)                              | `productSchema`                                            |
| `updateProductAction`                                                          | `updateProduct`                                      | `products.update` (global)                              | `productSchema`                                            |
| `updateProductContentAction`                                                   | `updateProductContent`                               | `products.update` (global)                              | `productContentSchema`                                     |
| `updateProductNotesAction`                                                     | `updateProductNotes`                                 | `products.update` (global)                              | `productNotesSchema`                                       |
| `changeProductStatusAction`                                                    | `changeProductStatus`                                | `products.publish` or `products.update` (global)        | `productStatusChangeSchema`                                |
| `createVariantAction` / `updateVariantAction`                                  | `createVariant` / `updateVariant`                    | `products.update` (global)                              | `variantSchema`                                            |
| `changeVariantStatusAction`                                                    | `changeVariantStatus`                                | `products.update` (global)                              | `variantStatusChangeSchema`                                |
| `setVariantPricesAction`                                                       | `setVariantPrices`                                   | `products.prices.update` (each changed price's country) | `variantPricesSchema`                                      |
| `suggestInternalBarcodeAction`                                                 | `suggestInternalBarcode`                             | `products.update` (global)                              | —                                                          |
| `uploadProductImageAction`                                                     | `uploadProductImage`                                 | `products.update` (global)                              | `FormData` file (JPEG/PNG/WebP/AVIF ≤ 5 MB) + alt text     |
| `removeProductImageAction` / `makePrimaryImageAction`                          | images service                                       | `products.update` (global)                              | image id                                                   |
| `addComplianceAction` / `updateComplianceAction` / `removeComplianceAction`    | compliance service                                   | `products.compliance.manage` (reference's country)      | `complianceSchema`                                         |
| `createBrandAction` / `updateBrandAction` / `setBrandActiveAction`             | brands service                                       | `catalog.brands.manage` (global)                        | `brandSchema`, `activationSchema`                          |
| `createCategoryAction` / `updateCategoryAction` / `setCategoryActiveAction`    | categories service                                   | `catalog.categories.manage` (global)                    | `categorySchema`, `activationSchema`                       |
| `createAttributeAction` / `updateAttributeAction` / `setAttributeActiveAction` | attributes service (notes, families, concentrations) | `catalog.attributes.manage` (global)                    | `fragranceNoteSchema` / `lookupSchema`, `activationSchema` |

### Organisation — `src/app/[locale]/admin/organization/actions.ts`

| Action                                                                               | Permission (target)                                    | Input schema                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| `updateCountryAction`                                                                | `organization.manage` (global)                         | `countryUpdateSchema`                                 |
| `createLegalEntityAction` / `updateLegalEntityAction` / `setLegalEntityActiveAction` | `organization.manage` (entity's country / entity)      | `legalEntityCreateSchema` / `legalEntityUpdateSchema` |
| `createStoreAction` / `updateStoreAction` / `setStoreActiveAction`                   | `organization.manage` (store's entity and country)     | `storeCreateSchema` / `storeUpdateSchema`             |
| `createWarehouseAction` / `updateWarehouseAction` / `setWarehouseActiveAction`       | `organization.manage` (warehouse's entity and country) | `warehouseCreateSchema` / `warehouseUpdateSchema`     |

### Access — `src/app/[locale]/admin/access/actions.ts`, `src/app/[locale]/(auth)/actions.ts`

| Action                                            | Permission (target)                                  | Input schema            |
| ------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| `createStaffUserAction`                           | `users.manage` (global) + assignment rules           | `createStaffUserSchema` |
| `updateStaffUserAction`                           | `users.manage` (global)                              | `updateStaffUserSchema` |
| `resetStaffPasswordAction`                        | `users.manage` (global); revokes the user's sessions | `resetPasswordSchema`   |
| `setStaffUserStatusAction`                        | `users.manage` (global); last Super Admin protected  | status + reason         |
| `assignRoleAction` / `revokeRoleAssignmentAction` | `users.manage` covering the scope; no escalation     | `roleAssignmentSchema`  |
| `changePasswordAction`                            | signed-in user (own account)                         | `changePasswordSchema`  |
| `signOutAction`                                   | signed-in user                                       | —                       |

### Storefront — `src/app/[locale]/(store)/actions.ts`

| Action                  | Auth | Behaviour                                                                                       |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `setMarketAction(code)` | none | Accepts only an active market code; sets the http-only `market` cookie (1 year, `SameSite=Lax`) |

## 2. HTTP endpoints

| Method and path                | Auth            | Purpose and responses                                                                                                                                                                                                                                                                                            |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in/email` | none            | Better Auth e-mail/password sign-in. Body `{ email, password, rememberMe }`. 200 + session cookie; 401 with an identical body for a wrong password and an unknown e-mail; a 4xx without a session for non-ACTIVE accounts; 429 after 5 attempts per minute; 403 for cross-origin or origin-less cookie requests. |
| `GET /api/auth/get-session`    | cookie          | Current session or `null`.                                                                                                                                                                                                                                                                                       |
| `POST /api/auth/sign-up/email` | —               | Disabled (staff are created by administrators): 400, no user created.                                                                                                                                                                                                                                            |
| other `/api/auth/*`            | per Better Auth | Library endpoints; origin and CSRF checks enforced.                                                                                                                                                                                                                                                              |
| `GET /api/files/{key}`         | none            | Product images registered in `product_images` only; validated key pattern; `Cache-Control: public, max-age=31536000, immutable`, `nosniff`, restrictive CSP. 404 for anything else.                                                                                                                              |
| `GET /api/health`              | none            | `200 {"status":"ok"}` when PostgreSQL answers, `503 {"status":"unavailable"}` otherwise; `Cache-Control: no-store`; no version or configuration details.                                                                                                                                                         |
| `GET /sitemap.xml`             | none            | Published products, top pages and category listings with `hreflang` alternates (rendered per request).                                                                                                                                                                                                           |
| `GET /robots.txt`              | none            | Allows the storefront; disallows `/api/`, admin, login and account paths; points to the sitemap.                                                                                                                                                                                                                 |

Pages (`/{locale}/…`) are not an API; signed-out requests to `/{locale}/admin/**` are redirected to
`/{locale}/login?next=…` (same-origin admin paths only are honoured after sign-in).

## 3. Error handling (all endpoints)

- No stack traces, SQL, secrets or internal identifiers in responses; unexpected errors return a
  correlation reference that matches the server log (`x-request-id` response header on pages).
- Validation errors are field-specific and translatable; domain rule violations use `INVALID_STATE`
  with a specific message key (e.g. `errors.invalidState.publishRequirements`).
- Authorization failures return `FORBIDDEN` without revealing whether the record exists in another
  scope.

## 4. Integration API (planned — INT-001) and webhooks (PAY-001)

Conventions every new module follows so that the API is a thin layer over existing services:

| Aspect                                 | Convention                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path                              | `/api/v1/…`, resources in kebab-case plural (`/api/v1/orders`, `/api/v1/stock-movements`)                                                                                                                                                           |
| Authentication                         | API clients created by administrators; secret shown once, stored hashed; `Authorization: Bearer <key>`; keys bound to a role assignment (same RBAC and scopes as staff); rotation and revocation audited                                            |
| Authorization                          | Exactly the service checks used by the UI — no separate rules                                                                                                                                                                                       |
| Idempotency                            | `Idempotency-Key` header required on every POST that creates or changes state; stored with the request hash and response for 24 h; a replay returns the original response; a different body with the same key is rejected                           |
| Payloads                               | JSON; money as decimal strings with an ISO currency; quantities as integers; timestamps ISO 8601 UTC; bilingual fields as `nameEn`/`nameAr`                                                                                                         |
| Pagination                             | Cursor based: `?limit=` (≤ 100) and `?cursor=`; responses carry `nextCursor`                                                                                                                                                                        |
| Errors                                 | `application/problem+json` (RFC 9457) with `type`, `title`, `status`, `code` (the ErrorCode above), `messageKey`, `fieldErrors`, `reference`                                                                                                        |
| Rate limits                            | Per client; `429` with `Retry-After`                                                                                                                                                                                                                |
| Outgoing events                        | Business events (e.g. `order.paid`, `stock.low`) written to an outbox in the same transaction, delivered as webhooks with an event id, timestamp and HMAC-SHA256 signature header; retries with backoff; receivers must deduplicate by event id     |
| Incoming webhooks (payments, carriers) | `/api/webhooks/{provider}`: verify the provider signature before parsing, store the provider event id with a unique constraint, process idempotently, respond 2xx only after durable storage; never trust redirect query strings for payment status |
| Versioning                             | Additive changes within `v1`; breaking changes create `v2` with a deprecation window                                                                                                                                                                |

AI features (AI-001) call the same API or services with a dedicated, minimally scoped client and
cannot bypass validation, authorization, payment verification or inventory controls.
