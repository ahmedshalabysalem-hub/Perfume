# Decision requests

Business choices the code must not invent. Each request names the task it blocks, the question and the
answer. Ahmed (or whoever he names) decides; the answer is recorded here with its date and carried into
the task's ADR in `docs/DECISIONS.md`. Replace an entry's text when it is decided rather than appending
history; git keeps the history.

| ID     | Topic                              | Blocks           | Status                            |
| ------ | ---------------------------------- | ---------------- | --------------------------------- |
| DR-009 | Inventory costing method (ADR-018) | FIN-001, FIN-003 | Open — simulated test answer only |

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
- **Answer:** none from the accountant. A **simulated** answer (below) exists for testing only.

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
