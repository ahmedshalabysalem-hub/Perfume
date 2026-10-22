# Decision requests

Open questions that need someone outside engineering (accountant, advisor, the business) before the
dependent work can be built. A request stays **Open** until a written answer is recorded here; silence is
not approval. The answer is then recorded in the ADR named by the request (`docs/DECISIONS.md`).

| ID     | Topic                              | Asked of              | Status              | Blocks                    |
| ------ | ---------------------------------- | --------------------- | ------------------- | ------------------------- |
| DR-001 | Inventory costing method (ADR-018) | Business's accountant | Open — not yet sent | FIN-001, FIN-003, RPT-001 |

## DR-001 — Inventory costing method and landed cost (ADR-018)

- **Raised:** 2026-10-22. **Owner:** Ahmed (Project Director), who sends it to the accountant; no
  accountant channel is set up for the project. **Status:** Open — not yet sent.
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
