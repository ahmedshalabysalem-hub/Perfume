# Decision requests

Business choices the code must not invent. Each request names the task it blocks, the question and the
answer. Ahmed (or whoever he names) decides; the answer is recorded here with its date and carried into
the task's ADR in `docs/DECISIONS.md`. Replace an entry's text when it is decided rather than appending
history; git keeps the history.

| ID     | Topic                                          | Blocks           | Status             |
| ------ | ---------------------------------------------- | ---------------- | ------------------ |
| DR-001 | Who owns a batch record                        | INV-002          | Decided 2026-10-22 |
| DR-002 | Initial inspection state and who decides       | INV-002, PUR-002 | Decided 2026-10-22 |
| DR-003 | Expired stock and sell-by cut-off              | INV-002, INV-004 | Decided 2026-10-22 |
| DR-004 | Approval for releasing or rejecting a batch    | INV-002          | Decided 2026-10-22 |
| DR-005 | Correcting batch details after creation        | INV-002          | Decided 2026-10-22 |
| DR-006 | Near-expiry filter and alerts                  | INV-002, INV-005 | Decided 2026-10-22 |
| DR-007 | Lot number format, month-only expiry, defaults | INV-002          | Decided 2026-10-22 |
| DR-008 | Stock that exists before batches               | INV-002          | Decided 2026-10-22 |
| DR-009 | Inventory costing method (ADR-018)             | FIN-001, FIN-003 | Open               |
| DR-010 | Sale eligibility of LEGACY and unknown expiry  | INV-002          | Decided 2026-10-22 |

## INV-002 — batches, inspection and expiry (ADR-023)

Answered by Ahmed in the project thread on 2026-10-22. DR-010 refines DR-008.

### DR-001 — Who owns a batch record

**Decided:** one batch record per company (legal entity). The Saudi and Egyptian companies have separate
batch records and separate stock; company-level data isolation is enforced (a batch is used only in
warehouses and with suppliers of its own company).

### DR-002 — Initial inspection state and who decides

**Decided:**

- Goods received from purchases (PUR-002) start in quarantine as `PENDING_INSPECTION`.
- An opening balance explicitly entered as sellable may create its batch as `RELEASED`, only when the
  user is authorised to release batches and the operation is audited.
- Only Super Admin and Inventory Manager may release or reject batches initially; Business Manager does
  not get this permission by default.
- Each decision records the reason, actor, timestamp and previous and new status.
- Quarantined and rejected stock is not available for sale or fulfilment.

### DR-003 — Expired stock

**Decided:** a batch is ineligible for sale from the day after its expiry date, in the warehouse's local
date. Expired stock is never allocated to new sales. Physical removal is a separately recorded stock
adjustment (INV-003); expired stock is never silently deleted or moved. No earlier sell-by cut-off.

### DR-004 — Approval for releasing or rejecting a batch

**Decided:** no second-person approval at this stage. Role-based authorisation, a mandatory reason and an
audit trail are enforced.

### DR-005 — Correcting batch details after creation

**Decided:**

- Manufacturing date, expiry date and supplier may be corrected only with a mandatory reason and a full
  audit record (old and new values, actor, timestamp). Dates must stay consistent and the supplier must
  belong to the batch's company.
- The lot number is immutable once stock has been recorded, except on explicitly identified LEGACY
  batches. LEGACY corrections are limited to authorised users, audited, and may not break historical
  traceability or silently reassign existing stock.

### DR-006 — Near-expiry filter and alerts

**Decided:** the batches page offers an "expiring within N days" filter, default 90 days, which excludes
batches that have already expired; expired stock has its own separate filter. No automatic
notifications or configurable alert rules in INV-002 (INV-005).

### DR-007 — Lot number format, month-only expiry, defaults

**Decided:**

- Lot numbers: letters, digits, spaces, hyphens, slashes and periods, up to 64 characters.
- When the manufacturer gives only a month and year, the effective expiry date is the last calendar day
  of that month, and the batch records that the date was given at month precision.
- Batch tracking stays on by default; expiry tracking stays off by default.
- No expiry date is inferred when none is supplied.

### DR-008 — Stock that exists before batches

**Decided:** the LEGACY approach, with these safeguards:

- Existing quantities and historical ledger records are preserved; the carry-over uses auditable ledger
  movements consistent with ADR-020.
- No double counting; the migration is idempotent and transaction-safe.
- No lot numbers, manufacturing dates or expiry dates are fabricated; LEGACY batches are clearly marked
  as having incomplete details so authorised staff can complete them later.
- Balances are reconciled before and after the migration.
- If the migration cannot preserve traceability and accounting integrity, implementation stops and a new
  decision is requested.

### DR-010 — Sale eligibility of LEGACY stock and unknown expiry

**Decided** (refines DR-008; the earlier proposal that LEGACY batches start released is withdrawn):

- Legacy stock is not written off or marked expired because batch or expiry data was never recorded,
  but it may be sold only after an authorised employee verifies that it is physically fit for sale
  and checks the manufacturer labelling; the verification status, employee, time and notes are
  recorded. If fitness cannot be established, the stock stays unavailable for sale.
- Stock known to be expired is never sold or allocated, LEGACY included, from the day after its
  effective expiry date in the warehouse's local date, and no sales channel (POS, storefront, order
  APIs, allocation) may bypass this.
- A missing expiry date means neither expired nor safe: expiry is tracked as unknown until verified,
  and an empty database field is not taken to mean unknown (the state is explicit).
- No lot numbers or dates are fabricated; migration preserves transactions and quantities without
  duplication; verifications and status changes are audited; authorised staff can complete legacy
  details later.
- Verification and release are restricted to authorised roles, need a recorded reason and are enforced
  by the backend.

## FIN — inventory costing (ADR-018, Proposed)

### DR-009 — Inventory costing method and landed cost

- **Asked of:** the business's accountant, through Ahmed (no accountant channel is set up). Raised
  2026-10-22. **Status:** Open — not yet sent; silence is not approval.
- **Question:** Which method values inventory and cost of goods sold for the Saudi and the Egyptian legal
  entities, and which purchase-related costs are added to inventory cost?
- **Current proposal (ADR-018, Proposed):** perpetual inventory at moving weighted average cost per
  variant and legal entity (one pool across that entity's warehouses); batches drive expiry and FEFO
  picking, not valuation; freight and customs are added to the receipt cost.
- **What exists today:** the stock ledger (INV-001, ADR-020) stores an optional unit cost per movement
  (NUMERIC(19,4), warehouse currency), so either method can still be adopted. Nothing values stock or
  posts journals yet.
- **Options and implications:**

  | Option                                | Financial effect                                                                                                         | Operational effect                                                                                                                          |
  | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
  | A. Moving weighted average (proposal) | COGS smooths price changes; an expired or damaged batch is written off at the current average, not its own purchase cost | Simplest; one running cost per variant and entity; a late or corrected receipt changes the average from that point                          |
  | B. FIFO by batch                      | COGS and write-offs follow each batch's real cost; margins move with purchase prices                                     | Needs a cost on every batch (INV-002) and per-batch cost layers; corrections and returns must find the original batch; more work in FIN-003 |
  | C. Standard cost                      | Differences go to variance accounts; standards must be maintained                                                        | Needs a standard-cost process and variance reporting; uncommon for a small retailer                                                         |

- **Recommendation (engineering view, not accounting advice):** A, with landed costs capitalised,
  because it fits batch-for-expiry tracking and keeps corrections simple. Only the accountant can confirm
  that it is acceptable for both entities' reporting and tax filings.
- **Confirmation needed, in writing:**
  1. The costing method for the Saudi entity and for the Egyptian entity (the same or different).
  2. The cost pool: per legal entity across its warehouses, or per warehouse.
  3. Which costs are capitalised (freight, customs duties, insurance, clearing fees; whether import VAT is
     excluded as recoverable) and how they are allocated to items (by value, quantity or weight).
  4. How expired, damaged and lost stock is expensed (at the cost under the chosen method).
  5. Precision: unit cost kept to 4 decimals, journal amounts rounded to 2 decimals per line.
- **Blocks:** FIN-001 (journals), FIN-003 (valuation), RPT-001 profitability. **Does not block** INV-002
  or INV-003, provided movements keep recording unit cost per batch line so option B stays possible.
  Question 3 also feeds the PUR-002 cost-precision ADR; PUR-002 must not assume an allocation rule.
- **Answer:** none yet.
