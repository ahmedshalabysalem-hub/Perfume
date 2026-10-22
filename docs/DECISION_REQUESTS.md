# Decision requests

Business choices the code must not invent. Each request names the task it blocks, the question and the
answer. Ahmed (or whoever he names) decides; the answer is recorded here with its date and carried into
the task's ADR in `docs/DECISIONS.md`. Replace an entry's text when it is decided rather than appending
history; git keeps the history.

| ID     | Topic                              | Blocks           | Status         |
| ------ | ---------------------------------- | ---------------- | -------------- |
| DR-009 | Inventory costing method (ADR-018) | FIN-001, FIN-003 | Accepted (dev) |

DR-001…DR-008 (INV-002) are in PR #5; when merging, keep that header and table and add the DR-009 row.

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
- **Answer:** none from the accountant yet. On 2026-10-22 Ahmed delegated the choice to the project
  ("decide what is most suitable and continue"); ADR-018, ADR-024 and the development defaults below are
  therefore **accepted for development**. This is not accountant approval: the accountant responsible
  for each legal entity must confirm them in writing before production use (go-live gate, REL-001).

#### Development defaults (in force for building and testing, 2026-10-22)

Where the simulated answers below leave a point open, development uses:

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
5. **Write-offs:** every write-off needs ADR-019 approval (no thresholds until the business sets them);
   one inventory write-off loss account per entity; no automatic near-expiry write-down, a review
   report instead.
6. **Returns and samples:** customer returns re-enter at the original outbound unit cost after
   inspection; supplier returns leave at the receipt's cost. Free samples are separate variants and
   never enter a sellable item's average.
7. **Rounding:** half-up to minor units per journal line; differences to a dedicated rounding account
   (ADR-024).
8. **Opening balances:** entered by holders of `inventory.adjust.approve` (as today) for development;
   before go-live the accountant signs off the opening valuation.
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
