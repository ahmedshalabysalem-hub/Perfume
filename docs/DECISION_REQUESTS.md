# Decision requests

Business choices the code must not invent. Each request names the task it blocks, the options, and the
default a session would propose. Ahmed (or whoever he names) decides; the answer moves into the task's
ADR in `docs/DECISIONS.md` and the request is marked **Decided** with the date. Replace answered entries'
"Status" line rather than appending history; git keeps the history.

| ID     | Topic                                          | Blocks           | Status |
| ------ | ---------------------------------------------- | ---------------- | ------ |
| DR-001 | Who owns a batch record                        | INV-002          | Open   |
| DR-002 | Initial inspection state and who decides       | INV-002, PUR-002 | Open   |
| DR-003 | Expired stock and sell-by cut-off              | INV-002, INV-004 | Open   |
| DR-004 | Approval for releasing or rejecting a batch    | INV-002          | Open   |
| DR-005 | Correcting batch details after creation        | INV-002          | Open   |
| DR-006 | Expiry alert thresholds                        | INV-005          | Open   |
| DR-007 | Lot number format, month-only expiry, defaults | INV-002          | Open   |
| DR-008 | Stock that exists before batches               | INV-002          | Open   |

## INV-002 — batches, inspection and expiry (design: ADR-023, Proposed)

### DR-001 — Who owns a batch record

- **Question:** Is a lot one record per legal entity (KSA company, Egypt company), one record for the
  whole organisation, or one record per warehouse?
- **Options:** (a) per legal entity — same owner as suppliers (ADR-021) and transfers stay inside one
  entity; (b) organisation-wide — one record even if the lot is imported into both countries, but a
  quality decision in one country would change stock in the other; (c) per warehouse — simplest scope,
  but a transfer splits one lot into several records.
- **Proposed default:** (a). **Status:** Open.

### DR-002 — Initial inspection state and who decides

- **Question:** Must every new batch be inspected before it can be sold, and who may release,
  quarantine or reject?
- **Proposed default:** batches created from goods receipts (PUR-002) start PENDING with stock in
  QUARANTINED; batches created by an opening balance into SELLABLE start RELEASED (the stock is already
  on sale); into any other status they start PENDING. A new permission `inventory.batches.manage` for
  Super Admin and Inventory Manager. Open point: should Business Manager also hold it?
- **Status:** Open.

### DR-003 — Expired stock and sell-by cut-off

- **Question:** (1) Is stock unsellable from the day after the printed expiry date, or earlier (e.g.
  N days or months before expiry, per market or per category)? (2) Should expired stock stay where it
  is and simply be excluded from sale, or be moved automatically to another status?
- **Proposed default:** (1) unsellable from the day after expiry, in the warehouse's local date; no
  earlier cut-off until the business sets one. (2) excluded by a query rule, no automatic movement;
  physical removal is an adjustment (INV-003).
- **Status:** Open.

### DR-004 — Approval for releasing or rejecting a batch

- **Question:** Should releasing (and/or rejecting) a batch need a second person's approval through the
  approval framework (ADR-019)?
- **Proposed default:** no approval in INV-002; quarantine is always immediate; every change needs the
  permission, a reason for quarantine and rejection, and is audited. Approval can be added later
  without changing the ledger.
- **Status:** Open.

### DR-005 — Correcting batch details after creation

- **Question:** May staff correct a batch's manufacturing date, expiry date, supplier or lot number
  after it has stock?
- **Proposed default:** dates and supplier may be corrected with the batch permission and a reason
  (audited, before/after kept); the lot number only on legacy batches (DR-008), because it is the
  traceability key.
- **Status:** Open.

### DR-006 — Expiry alert thresholds (INV-005)

- **Question:** How far ahead should near-expiry stock be flagged (one value, per market, per
  category), and who is notified?
- **Proposed default:** INV-002 only offers an "expiring within N days" list filter (default 90 days,
  changeable in the page); configurable thresholds and notifications are decided with INV-005.
- **Status:** Open.

### DR-007 — Lot number format, month-only expiry, tracking defaults

- **Question:** (1) Which characters can a lot number contain? (2) Many perfume labels print only a
  month and year of expiry: which day is stored? (3) Variants track batches by default
  (`track_batches = true`) and expiry is off by default: are these the right defaults?
- **Proposed default:** (1) letters, digits, space, `-`, `/`, `.`; up to 64 characters, stored
  upper-case. (2) the last day of that month. (3) keep the current defaults.
- **Status:** Open.

### DR-008 — Stock that exists before batches

- **Question:** How should stock of batch-tracked variants entered before INV-002 be carried over?
- **Facts:** no production deployment exists and the seed creates no stock; only local and test
  databases hold opening balances.
- **Options:** (a) the migration assigns it to one legacy batch per legal entity and variant
  (`LEGACY`, released, no expiry) through compensating ledger movements, and staff later complete the
  lot details; (b) the migration refuses to run while such stock exists, and those databases are
  re-created.
- **Proposed default:** (a), because it keeps the ledger history and works for any database.
- **Status:** Open.
