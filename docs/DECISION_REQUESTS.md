# Decision requests

Business choices the code must not invent. Each request names the task it blocks, the question and the
answer. Ahmed (or whoever he names) decides; the answer is recorded here with its date and carried into
the task's ADR in `docs/DECISIONS.md`. Accounting requests are approved by either the business's
accountant or the owner (Ahmed); who approves is chosen when each request comes up, and the record
names who approved (Ahmed, 2026-10-22). Replace an entry's text when it is decided rather than appending
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
| DR-009 | Inventory costing method (ADR-018)             | FIN-001, FIN-003 | Decided 2026-10-22 |
| DR-010 | Sale eligibility of LEGACY and unknown expiry  | INV-002          | Decided 2026-10-22 |
| DR-011 | What releasing a quarantined batch restores    | INV-006          | Decided 2026-10-22 |

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

**Decided 2026-10-22** (refines DR-008 and withdraws the proposal that LEGACY batches start released;
Ahmed clarified the same day):

1. **Preserve existing stock.** The migration to LEGACY never writes off stock, invents expiry dates, or
   marks stock expired because expiry information is missing. Existing quantities and historical ledger
   records are preserved, without duplication.
2. **Initial LEGACY state.** A LEGACY batch starts pending inspection, unverified and not sellable. Its
   expiry state distinguishes unknown expiry from expiry tracking not applying. Missing data never means
   tracking does not apply.
3. **Verification.** An authorised inventory user records both the physical-condition check and the
   label check, with actor, time and notes. A lot number or expiry date is not required when neither can
   be established.
4. **Unknown expiry.** If both checks pass and no expiry date can be established, the authorised user
   may record that outcome and release the batch with expiry marked unknown. The missing date is never
   proof that the item is safe or expired.
5. **Known expiry.** An expiry date established from the label is recorded accurately. Release is
   refused if the batch is already expired under DR-003. A batch known to be expired is never sold or
   allocated through any channel.
6. **Unfit products.** If either check finds a safety, condition or compliance concern, the batch stays
   unavailable for sale and is moved to quarantine or rejected, as appropriate.
7. **No automatic release.** Verification and release are explicit, authorised, reasoned and audited.
   Verification alone never makes a batch sellable.
8. **Shared eligibility function.** The rule is enforced through the inventory ledger and one shared
   eligibility function. Future order, reservation, storefront, POS and other stock-consuming paths must
   use it and test the relevant cases.

### DR-011 — What releasing a quarantined batch restores

**Decided 2026-10-22: Option A** (Ahmed approved the recommended option on the handoff page). Raised by
the INV-002 review. Implemented by INV-006, which must land before INV-003 or PUR-002 put damaged or
otherwise held units into QUARANTINED on a batch. Until then `moveForDecision` in
`src/server/modules/inventory/batches.service.ts` moves **all** of a batch's QUARANTINED stock in each
warehouse back to SELLABLE when the batch goes QUARANTINED → RELEASED (except the LEGACY carry-over),
including units quarantined for another reason, such as damage.

- **Option A (chosen):** QUARANTINED → RELEASED moves back only the net quantity of the batch's
  own `INSPECTION` movements; units quarantined for other reasons stay held until their own decision.
  PENDING_INSPECTION → RELEASED keeps today's behaviour. The LEGACY subtraction becomes the same rule.
- **Option B:** keep today's behaviour; damaged units must be moved out of QUARANTINED (adjusted or
  written off) before a release.

Answer: Option A (Ahmed, 2026-10-22).

**Implemented by INV-006 (2026-10-26).** In each warehouse a release moves back to SELLABLE the net
QUARANTINED quantity of the batch's inspection-hold movements, capped at the unreserved quarantined
balance. Inspection-hold movements are the batch's own `INSPECTION` moves and stock that entered
QUARANTINED to await inspection: an `OPENING_BALANCE` today, PUR-002 receipts later. Everything else
put into QUARANTINED (the LEGACY `BATCH_ASSIGNMENT` carry-over, adjustments such as damage) stays held.
The same rule applies to every release, from PENDING_INSPECTION or QUARANTINED, so it reproduces the
earlier PENDING_INSPECTION behaviour on all stock that exists today, and a batch quarantined before its
first release (pending intake, then QUARANTINED, then RELEASED) gets its intake back instead of
keeping it held for ever. Counting stock entered to await inspection as inspection-held was put to
Ahmed for confirmation on 2026-10-26; the strict reading (INSPECTION moves only) would leave such
intake held until an INV-003 adjustment.

## FIN — inventory costing (ADR-018, Accepted)

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
- **Decided:** 2026-10-22 by Ahmed (owner): he delegated the choice to the project ("decide what is most
  suitable and continue"), then accepted the result ("consider it approved"). ADR-018, ADR-024 and the
  defaults below are **Accepted**, approved by the owner (no accountant review needed under the approval
  rule above).

#### Defaults (in force, 2026-10-22)

Where the simulated answers below leave a point open, the system uses:

1. **Allocation:** weight-priced freight by `weight_grams`; a receipt line without a weight blocks
   weight allocation until the weight is entered, or the user allocates that cost by value and the
   choice is recorded on the document. Volume-priced costs use value until product volume is captured.
   Duties assessed per line are assigned to that line; other shared costs by value.
2. **Taxes:** each charge type carries a per-entity "recoverable" setting maintained by finance staff,
   with no seeded list; recoverable VAT is never capitalised.
3. **Late landed costs:** split by quantity between what remains of the original receipt (inventory)
   and what was already sold (cost of goods sold adjustment).
4. **Foreign currency:** inventory cost uses the exchange rate of the receipt date, with source and date
   stored; payment differences go to exchange gain/loss, never to inventory.
5. **Write-offs:** every write-off needs ADR-019 approval by the accountant or the owner, chosen per
   request (no thresholds until the business sets them);
   one inventory write-off loss account per entity; no automatic near-expiry write-down, a review
   report instead.
6. **Returns and samples:** customer returns re-enter at the original outbound unit cost after
   inspection; supplier returns leave at the receipt's cost. Free samples are separate variants and
   never enter a sellable item's average.
7. **Rounding:** half-up to minor units per journal line; differences to a dedicated rounding account
   (ADR-024).
8. **Opening balances:** entered by holders of `inventory.adjust.approve` (as today); the opening
   valuation is signed off by the accountant or the owner, chosen when it is submitted.
9. **Between entities:** stock never moves between the Saudi and Egyptian entities in the system;
   transfers stay inside one entity. Inter-company sales are a later, separate design.

#### Simulated answer — TEST ONLY, not accountant approval

> Written by Ahmed on 2026-10-22 as a simulated accountant response "created exclusively to test the
> decision-recording workflow. It is not a real accountant's response or approval." It is not evidence
> of approval, does not change ADR-018 (still **Proposed**) and does not unblock FIN-001, FIN-003 or
> RPT-001. The question has still not been sent to a real accountant.

1. **Method:** moving weighted average for both the Saudi and the Egyptian entity; the two entities'
   accounts and costs are kept completely separate.
2. **Cost pool:** one average per item per legal entity, across all of that entity's warehouses;
   quantities and locations stay per warehouse. Saudi and Egyptian costs or balances are never combined.
3. **Capitalised costs:** purchase cost plus qualifying direct costs of bringing goods to their present
   location and condition: freight and transport, non-recoverable customs duties, shipment insurance,
   customs clearance, other qualifying direct costs. Recoverable VAT is excluded. Shared costs are
   allocated on a reasonable basis suited to their nature (weight for weight-driven freight, value for
   value-driven costs, quantity where appropriate); the basis is documented and applied consistently.
4. **Expired, damaged, lost stock:** recognised after verifying the physical state and documenting
   quantities, reasons and required approvals; expensed (expense or loss) at the recorded cost under the
   valuation method, with any impairment treated as required; an audit trail records item, quantity,
   cost, reason, date and responsible user.
5. **Precision:** unit cost stored to 4 decimals, journal amounts to 2 decimals, with one uniform
   rounding rule that keeps entries balanced; rounding differences are documented and checked against
   document and journal totals.

#### Still needs professional confirmation (open even if the answer above were real)

1. **Allocation rule per cost type** — which basis for freight, insurance, clearance and duties; the
   fallback when a variant has no weight (`weight_grams` is optional); whether duties are assigned per
   line (they are usually assessed per tariff line) rather than allocated.
2. **Non-recoverable taxes** — which taxes and fees count as non-recoverable for each entity (e.g.
   import VAT when a deduction is not allowed) and are therefore capitalised.
3. **Late landed costs** — a freight or customs invoice that arrives after part of the stock was sold:
   added to the remaining stock's average, or split between remaining stock and cost of goods sold.
4. **Foreign-currency purchases** — which exchange rate (invoice, receipt or payment date) sets the
   inventory cost, and where exchange differences go (suppliers are SAR/EGP only today).
5. **Write-offs** — the expense or loss account(s), approval levels or thresholds (to be enforced
   through ADR-019 approvals in INV-003), and whether near-expiry stock is written down to net
   realisable value before it expires ("impairment" is mentioned but no rule is given).
6. **Returns and zero-cost receipts** — whether customer returns re-enter at the original cost of the
   sale or the current average, and how free samples received at zero cost affect the average.
7. **Rounding** — which method (half-up or half-even), at which step (unit cost, line, document), and
   which account absorbs differences.
8. **Opening balances** — whether unit costs entered as opening balances (INV-001) are accepted as the
   starting average and who signs them off.
9. **Inter-entity movements** — confirmation that stock never moves between the Saudi and Egyptian
   entities except as a documented sale or purchase between them.

#### Simulated follow-up answers — TEST ONLY, not accountant approval

> Written by Ahmed on 2026-10-22 as "default answers for system testing only"; each must be reviewed
> by the accountant responsible for each legal entity before use. They may not be used to post journals
> or to change ADR-018 to Accepted. "Still open" is what even this simulated answer leaves undecided.

| #   | Simulated answer                                                                                                                                                                                                                                                 | Still open                                                    | System consequence if ever confirmed                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Weight-priced freight by actual weight; volume-priced transport by volume; value-based duties by customs value; other shared costs on a fixed, reasonable basis. No estimated weights                                                                            | The documented fallback basis when weight is missing          | Receipts block weight allocation while a line has no `weight_grams`; product volume is not captured today                                      |
| 2   | Non-recoverable, directly attributable taxes and fees are capitalised; recoverable VAT goes to tax accounts. Lists differ per entity                                                                                                                             | The actual list for each of SA and EG                         | Each charge type carries a per-entity "recoverable" flag, set by the accountant, never defaulted                                               |
| 3   | A late cost is split between the quantity still in stock (inventory) and the quantity already sold (cost of goods sold adjustment); never all on remaining stock                                                                                                 | —                                                             | Landed-cost documents link to the original receipt; the split needs sold vs remaining quantity per receipt                                     |
| 4   | Keep invoice currency and amount, rate with source and date, functional-currency value, actual payment and its difference. FX differences never go into the average automatically                                                                                | Which rate and date per entity                                | Purchase documents store those fields; foreign-currency suppliers stay out until decided                                                       |
| 5   | Write-offs through a documented process; a policy sets requester, approver, value/quantity thresholds, extra approvals and the loss account. No automatic near-expiry write-down                                                                                 | Thresholds, roles and accounts; the net-realisable-value test | INV-003 adjustments need ADR-019 approval with thresholds; stopping sales (INV-002) stays separate from value                                  |
| 6   | Customer returns re-enter only after inspection, at a cost consistent with their original outbound cost; supplier returns linked to the original receipt and invoice. Free samples kept separately by purpose and must not distort the average of sellable items | Cost for samples with a real cost                             | Outbound movements need their cost recorded; samples need their own variant or status; zero-cost receipts into sellable stock are questionable |
| 7   | Unit cost 4 decimals with higher internal precision; journal amounts rounded to 2 decimals by one approved rule; differences go to a documented account, never spread over items                                                                                 | The rule (half-up or half-even) and the account               | Rounding tests across purchases, sales, returns, landed costs and the average                                                                  |
| 8   | Opening balances and their costs are approved by the responsible accountant or a formally authorised person, backed by counts or reconciliations; entry alone is not approval                                                                                    | Who is authorised                                             | INV-001 opening balances need `inventory.adjust.approve` but no accountant sign-off; one would be needed                                       |
| 9   | Each entity's stock stays separate; a movement between the companies needs the right legal, commercial and tax treatment (possibly a sale and purchase with invoices) and a linked record                                                                        | Transfer prices, taxes, documents, related-party rules        | Transfers (INV-003) stay inside one legal entity; inter-company movement is a later, separate design                                           |
