# UI/UX audit — back office (Phase 1, read-only)

_UX-000 · 2026-10-26 · base `7ea936b` (PR #12 merged) · no application code changed._

Scope: the staff back office (`/[locale]/admin/**`), sign-in and password pages. The storefront is
noted only where it shares components. Evidence is code inspection plus a production build run
locally against the seeded development database (two opening balances posted through the UI), with
screenshots in Arabic and English at 1440×900 and in Arabic at 390×844.

Priorities: **P0** blocks operation or access · **P1** high impact on frequent workflows · **P2**
moderate · **P3** cosmetic. These rank UX work only; they are not task-board priorities.

## 1. Executive summary

The back office is in better shape than a typical "first build": one shell, one set of hand-written
shadcn-style components, a shared list toolbar, confirmation dialogs with reasons, logical (RTL-safe)
CSS throughout, Latin digits per ADR-009, every form disabled while submitting, and no console errors
or horizontal page scroll on any audited screen. **No P0 issue was found.**

The problems are about **meaning and flow**, mostly on the inventory screens that INV-002 added:

1. Stock status words confuse: in Arabic, _محجور_ (quarantined) and _المحجوز للطلبات_ (reserved) differ
   by one dot, and a row can show a green "Sellable" status with **0 available for sale** and no reason.
2. Screens are islands: catalogue, stock and batch pages do not link to each other, and most detail
   pages have no way back except the sidebar.
3. Batch inspection shows three independent forms side by side; a batch release or the final
   _Rejected_ decision is applied with no confirmation of its effect.
4. Shared visual tokens miss accessibility thresholds in a few places (warning badges, the gold
   "Publish" button, input borders, focus ring) and three components map statuses to colours separately.
5. The dashboard still says inventory indicators "will appear when those modules are delivered",
   while inventory has shipped and has the most actionable queues (pending inspection, expiring).

Recommended first slice (section 11): **UX-001 — inventory status clarity**, UI-only, no shared-shell
changes: a single status-tone map, the "why not sellable" reason in the stock list, cross-links between
product, stock and batch pages, and a confirmation step on batch decisions. Two wording questions go to
the Project Director first (section 12).

## 2. Existing frontend architecture

| Area          | What exists (verified in code)                                                                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | Next.js 16.4 App Router, React 19, TypeScript strict; Server Components by default, client components only for forms, dialogs and menus                                                                                            |
| Styling       | Tailwind 4 with CSS-variable tokens in `src/app/globals.css` (warm palette shared with the storefront, `--radius`, sidebar colours, Arabic/Latin font stacks per `:lang`), `.ltr-value` for codes                                  |
| Components    | Hand-written shadcn-style: `src/components/ui/*` (Button, Input, NativeSelect, Checkbox, Table, Dialog/AlertDialog/Sheet, DropdownMenu, Card, Badge, Alert, Skeleton) on `radix-ui`, `cva`, `lucide-react`, `sonner`               |
| Admin parts   | `src/components/admin/*`: `AdminShell`, `PageHeader`, `EmptyState`, `NoAccess`, `ListToolbar` (GET form), `TableCard`, `Pagination`, `StatusBadge`/`ActiveBadge`, `ConfirmAction`, `FormDialog`, `ActivationToggle`, `AuditAction` |
| Forms         | React Hook Form + shared Zod schemas (ADR-016); `Field`, `TextInput`, `SelectInput`, `TextAreaInput`; `useActionSubmit` maps server field errors and toasts                                                                        |
| Data flow     | Pages call services directly (`src/server/modules/*`); mutations through thin Server Actions (`actions.ts`) with `runAction`; lists filter through URL query strings; no client data cache or global state                         |
| Navigation    | Sidebar built server-side by `navigationFor(actor)` in `src/server/admin-nav.ts` (permission-filtered; pages re-check access); mobile uses a sheet; no breadcrumbs, no `loading.tsx`                                               |
| Auth boundary | `getAdminPageActor(permission)` per page, `assertCan` in services; hiding a button is never the control                                                                                                                            |
| i18n          | next-intl 4, `/ar` and `/en` prefixes, Arabic default, `messages/{ar,en}.json` with a parity test, logical CSS, `dir` on `<html>`; language independent of market/currency (ADR-009 amendment)                                     |
| Tests and CI  | Vitest (unit + integration on real PostgreSQL), Playwright e2e on a production build; CI runs lint, Prettier, typecheck, tests, build, e2e                                                                                         |

## 3. Implemented screens

Roles are the seeded system roles (`src/server/rbac/roles.ts`). "Shared" lists components beyond the
shell and `PageHeader`.

| Screen (route under `/[locale]/admin`)                | Purpose and main actions                                                                         | Permission                                    | Lists, filters, forms                                                         | Shared                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Dashboard `/`                                         | Catalogue KPIs, market price coverage, catalogue health, recent audit activity                   | `dashboard.view`                              | —                                                                             | Card, Alert, AuditAction                    |
| Products `/catalog/products`                          | Find products (search incl. exact SKU/barcode match), create                                     | `products.view` / `.create`                   | Search, status, brand, category, type, sort; paginated                        | ListToolbar, Table, StatusBadge, Pagination |
| Product new / detail `/catalog/products/new`, `/[id]` | Edit content, notes, variants and prices, images, compliance; publish/pause/discontinue; history | `products.*`                                  | Tabs; big general form; variant table with dialogs                            | FormDialog, ConfirmAction, StatusBadge      |
| Variant label `/catalog/variants/[id]/label`          | Print barcode label                                                                              | `products.view`                               | —                                                                             | back link                                   |
| Brands, Categories `/catalog/brands`, `/categories`   | Reference data CRUD with activation                                                              | `products.view` / manage                      | Brands: search; categories: none; not paginated                               | FormDialog, ActivationToggle                |
| Notes, Families, Concentrations                       | Attribute reference data                                                                         | (shared `attribute-page.tsx`)                 | Table + dialog forms                                                          | FormDialog, ActivationToggle                |
| Stock levels `/inventory/stock`                       | Balances per variant × warehouse × batch × status; opening balance entry                         | `inventory.view`                              | Search (scanner), warehouse, status; paginated                                | ListToolbar, StockStatusBadge, LotLabel     |
| Stock of a variant `/inventory/stock/[variantId]`     | Balances with ineligibility reason; movement history                                             | `inventory.view`                              | Own warehouse filter form; paginated movements                                | Table, Pagination                           |
| Opening balance `/inventory/opening-balances/new`     | Post go-live counts, line by line (focus returns to the code field)                              | `inventory.adjust.approve`                    | Form with batch fieldset                                                      | form inputs                                 |
| Batches `/inventory/batches`                          | Batches with expiry, inspection, sale eligibility, quantities                                    | `inventory.view`                              | Search, warehouse, inspection status, expiry, "incomplete details"; paginated | ListToolbar, batch badges                   |
| Batch detail `/inventory/batches/[id]`                | Verify, decide (release/quarantine/reject), correct details; movements, decision log             | `inventory.view` / `inventory.batches.manage` | Three forms side by side; two tables                                          | Card, Alert, Table                          |
| Suppliers `/procurement/suppliers`, `/[id]`           | Supplier profiles, contacts, supplier product codes and last costs                               | `suppliers.view` / manage                     | Search + filters; panels with dialogs                                         | ListToolbar, FormDialog                     |
| Countries, Legal entities, Stores, Warehouses         | Organisation setup                                                                               | `organization.view` / manage                  | Tables / location lists with dialogs                                          | FormDialog, ActivationToggle                |
| Users `/access/users`, `/[id]`; Roles; Audit log      | Staff, scoped role assignments, role matrix, audit search                                        | `users.view`, `audit.view`                    | Users: search, not paginated; audit: own filter form, paginated               | ListToolbar (users), own form (audit)       |
| Sign-in, change password (`(auth)`)                   | Staff authentication                                                                             | public / signed in                            | Forms with hydration guard                                                    | Field                                       |

**Not implemented** (so not redesigned in this initiative): POS, sales/orders, purchase orders and
goods receipts, customers and loyalty, accounting, payments, settings per company beyond organisation
setup. The dashboard correctly shows no figures for them.

## 4. Findings ranked by impact

Each finding names its evidence. "Approval" marks items that change wording or behaviour users rely on.

### P1 — high impact on frequent workflows

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| F1  | **Quarantined vs reserved are near-homographs in Arabic.** `stockStatus.QUARANTINED` = «محجور», `inventory.columns.reserved` = «المحجوز للطلبات». They sit in adjacent columns of the stock tables. A misread directly affects what staff think can be sold. _Approval: wording._                                                                                                                 | `messages/ar.json`; stock list and variant stock screenshots                       |
| F2  | **"Sellable" status with nothing sellable, and no reason in the list.** The stock list shows the balance status badge (green «قابل للبيع» for SELLABLE) and an "Available for sale" number that is 0 when the batch is pending, unverified or expired; the reason is shown only on the variant page (`ineligibleReason`). Three quantity columns (available, available for sale) need explaining. | `inventory/stock/page.tsx` vs `stock/[variantId]/page.tsx`; `stock.service.ts:167` |
| F3  | **No cross-navigation between modules.** Product and variant pages never link to the variant's stock or batches; stock and batch pages never link to the product. Detail pages (product, batch, stock variant, supplier) have no breadcrumb; only users and the label page have a back link, and the batch page a "Batches" button. Users go back through the sidebar and re-search.              | `grep admin/inventory` in catalog/procurement and the reverse: no matches          |
| F4  | **Batch decisions are not confirmed.** Release (makes stock sellable), quarantine and the final _Rejected_ are a select + reason + "Apply decision" with no confirmation stating the effect (units that move, finality). Elsewhere the app uses `ConfirmAction` for far smaller changes.                                                                                                          | `batch-forms.tsx` `BatchStatusForm`                                                |
| F5  | **Batch detail shows three parallel forms with no order.** Verify, Decide and Correct details appear at once, each with its own required reason; the inspection status is not in the page header. The workflow (verify → decide) is only described in small hint text.                                                                                                                            | batch detail screenshot (ar/en)                                                    |

### P2 — moderate

| #   | Finding                                                                                                                                                                                                                                                                                             | Evidence                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| F6  | **Dashboard ignores inventory.** "Indicators will appear when those modules are delivered" is stale; pending-inspection and expiring batches are the obvious queues and already have list filters to link to. Needs read-only counts from existing services. _Approval: new data on the dashboard._ | `admin/page.tsx`, `dashboard.modulesNotice`                      |
| F7  | **Recent activity is technical.** Raw action keys (`inventory.opening_balance.post`) shown as code chips next to the translated label, and English summaries in the Arabic UI (stored summaries are English — known limit of I18N-002).                                                             | dashboard screenshot                                             |
| F8  | **Contrast below WCAG AA in shared tokens.** Warning badge text 4.29:1 (12 px); white on gold (`Publish` button, gold badges) 3.49:1; input border 1.48:1; focus ring at 50 % opacity ≈1.8:1 against the card.                                                                                      | computed from `globals.css` tokens                               |
| F9  | **Status colours are defined three times** (`StatusBadge`, `StockStatusBadge`, `InspectionBadge`/`EligibilityBadge`) with collisions: _Pending inspection_ and _Draft_ share the beige `secondary`, ineligible is a faint `outline`.                                                                | `status-badge.tsx`, `stock-status-badge.tsx`, `batch-badges.tsx` |
| F10 | **Toasts cover the submit button.** Toasts sit at the bottom-end corner, where every form puts its primary button (seen covering "Post" on the opening-balance form after a validation error).                                                                                                      | `toaster.tsx`; opening-balance screenshot                        |
| F11 | **No navigation feedback.** No `loading.tsx` or Suspense in the back office: after a click on a dynamic page nothing changes until the server answers; fine on localhost, slow-feeling in production.                                                                                               | no `loading.tsx` under `src/app`                                 |
| F12 | **Required fields are only visual.** `Field` renders an `aria-hidden` asterisk; inputs get no `required`/`aria-required`, so screen readers do not announce them.                                                                                                                                   | `components/forms/field.tsx`, `inputs.tsx`                       |
| F13 | **Phone layout of wide tables.** No page scroll (good), but stock and batch tables scroll inside the card; key quantities fall off-screen and codes break mid-token (`SA-RUH-` / `WH1`, `QA-ROI-` / `50`).                                                                                          | 390 px screenshots                                               |
| F14 | **List search autofocuses on every list page** (scanner-friendly on desktop), which opens the soft keyboard on phones and moves screen-reader users past the page heading.                                                                                                                          | `ListToolbar autoFocusSearch`                                    |
| F15 | **Product status actions have equal weight.** Publish (gold), Pause (outline) and Discontinue (red) sit together in the header; the general product form is one long ungrouped grid.                                                                                                                | product detail screenshot; `product-form.tsx`                    |
| F16 | **Static alerts use `role="alert"`.** Every `Alert` (also informational ones like the dashboard notice) is announced as urgent; field errors are also each `role="alert"`.                                                                                                                          | `ui/primitives.tsx` `Alert`, `field.tsx`                         |

### P3 — cosmetic or low impact

- F17 Sidebar labels 0.7rem uppercase with letter-spacing: no effect in Arabic, letter-spacing hurts
  Arabic shaping, and 11 px Arabic is hard to read.
- F18 Audit log and variant movements use hand-made filter forms instead of `ListToolbar`; the
  "incomplete details" batch filter is a one-option select.
- F19 Users and brands lists are not paginated (fine at today's size).
- F20 Card titles are `h3` directly under the page `h1`.
- F21 Hard-coded `" ml"` in `procurement/suppliers/[id]/page.tsx:70` (English in the Arabic UI).
- F22 Dashboard KPI numbers are not grouped (`1234`, not `1,234`); large display serif for numbers.

## 5. Recommended design direction

Keep the current stack, components and warm identity; tune for ERP density and clarity rather than
re-skin.

- **Tokens:** keep `globals.css` as the single source. Add semantic status tokens
  (`--status-ok|attention|blocked|neutral|info` with text/background pairs that pass 4.5:1), darken
  `--warning` text and the gold used for text/buttons, raise `--input` border to ≥3:1, use a solid
  focus ring (`ring-2 ring-ring` + offset). Spacing, radius and type scale stay; use the display serif
  only for page titles, not numbers.
- **One status vocabulary:** a `statusTone(domain, value)` map feeding one `StatusBadge`, used by
  product, variant, stock, inspection and eligibility badges. Text always accompanies colour.
- **Page frame:** `PageHeader` gains optional breadcrumbs/back link and a status slot; detail pages
  show the record's key status in the header.
- **Tables:** compact density, numeric columns end-aligned with `tabular-nums`, `whitespace-nowrap`
  on codes, a "why" line under zero quantities, and on phones a stacked row layout for the two
  inventory lists only.
- **Feedback:** `loading.tsx` skeletons per section, toasts at the top-centre (or bottom-start), and
  `ConfirmAction`-style confirmation for irreversible or stock-moving decisions.

## 6. Components to standardise

StatusBadge (one tone map) · PageHeader with breadcrumbs/back link · ListToolbar for every filtered
list (audit, movements) · Field `required` semantics · Alert roles (`status` vs `alert`) · a
"quantity with reason" cell · loading skeletons · toast placement.

## 7. Components to reuse, not replace

`AdminShell`, `ListToolbar` (GET forms keep URLs shareable and scanners working), `Pagination`,
`ConfirmAction`, `FormDialog`, `ActivationToggle`, `useActionSubmit`, form inputs, `ui/*` primitives,
`.ltr-value`, `navigationFor`. No new UI library is needed.

## 8. Technical risks and dependencies

- **Shared files with upcoming tasks.** INV-006, INV-003 and PUR-002 will edit `inventory/*` pages,
  `batch-forms.tsx` and messages. UX slices touching those files must not run in parallel with them;
  shell and token changes touch every page and must land alone.
- **e2e selectors.** Tests use `data-testid` and some visible text (`i18n.spec.ts`, inventory specs).
  Keep test ids; wording changes need test updates in the same PR.
- **Messages parity test.** Every new key must be added to both `ar.json` and `en.json`.
- **Business rules stay in services.** The "why not sellable" text must come from the existing
  `batchEligibility` result, never be recomputed in components (ADR-023).
- **Dashboard counts** need new read-only queries in `dashboard.service.ts`, scoped like the
  existing ones; this is a service change and needs integration tests.

## 9. Baseline verification (before any change)

Run on `7ea936b` in this sandbox (PostgreSQL 16 local, fresh `perfume_dev/_test/_e2e`):

| Check                  | Result                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run lint`         | Passed                                                                                                                               |
| `npm run format:check` | Passed                                                                                                                               |
| `npm run typecheck`    | Passed                                                                                                                               |
| `npm test`             | Passed — 21 files, 252 tests (unit + integration), 198 s                                                                             |
| `npm run build`        | Passed                                                                                                                               |
| `npm run test:e2e`     | Passed — 30 Playwright tests                                                                                                         |
| Manual browser run     | Production build on the dev database; no console errors or warnings on 11 screens × 2 languages; no horizontal page scroll at 390 px |

No pre-existing failures. Environment notes: a fresh container needs the `perfume` role, the three
databases and a `.env` (as `README.md` describes).

## 10. Proposed implementation phases

| Slice  | Content                                                                           | Risk   | Touches                                           |
| ------ | --------------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| UX-001 | Inventory status clarity: F1 (after approval), F2, F3 links, F4, F5 header status | Medium | inventory pages, batch forms, badges, messages    |
| UX-002 | Tokens and accessibility: F8, F9 (one tone map), F12, F16, F17                    | Medium | `globals.css`, `ui/*`, forms, badges — every page |
| UX-003 | Page frame and feedback: breadcrumbs/back links (rest of F3), F10, F11, F14       | Low    | `page-parts`, shell, toaster, `loading.tsx`       |
| UX-004 | Dashboard: F6, F7 (needs approval)                                                | Medium | dashboard page and service                        |
| UX-005 | Phone tables and catalogue polish: F13, F15, F18–F22                              | Low    | list pages, product form                          |

Order follows impact and file ownership: UX-001 first while no inventory task is running; UX-002 as
its own PR between feature tasks; later slices any time.

## 11. Recommended first slice — UX-001

**Goal:** a stock or batch row tells staff, in words, whether it can be sold and why not; and staff
can move between a product, its stock and its batches in one click; and stock-moving batch decisions
are confirmed.

- In the stock list, show the existing ineligibility reason under a zero "Available for sale" (data
  from the eligibility `listStock` already computes; it returns only the number today, so the service gains a read-only reason field like `getVariantStock`).
- Links: product variant row → stock of the variant; stock and batch pages → product; batch detail →
  stock of the variant.
- Batch decision: confirmation dialog naming the decision, the warehouse quantities affected (already
  on the page) and, for _Rejected_, that it is final. Server rules unchanged.
- Batch header: inspection and sale badges next to the title.
- Wording (F1): QUARANTINED becomes «موقوف للفحص» in Arabic (decided 2026-10-26), in every
  stock-status label and filter.

Acceptance: no service rule changes; unit test for the tone/reason mapping; e2e for the confirmation and
the links; lint, typecheck, tests, build, e2e; screenshots in both languages and at phone width.

## 12. Items for Project Director approval

1. **Arabic term for QUARANTINED** (F1) — **Decided by Ahmed, 2026-10-26: «موقوف للفحص»** (chosen
   over «معزول» and «في الحجر»). «المحجوز للطلبات» stays for reserved; the English stays "Quarantined".
2. **Dashboard inventory widgets** (F6): add counts of batches pending inspection, expiring within the
   configured window, and expired with stock — read-only queries, linked to existing filters.
3. **Direction and order** of sections 5 and 10, and that UX-001 starts now and must finish before
   INV-006 begins (or after it merges — not in parallel).
4. Whether phone use of inventory screens matters for warehouse staff (decides F13's priority).
