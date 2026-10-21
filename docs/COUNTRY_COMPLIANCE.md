# Country compliance register — Saudi Arabia and Egypt

> **Not legal or tax advice.** This is the engineering register of regulatory requirements that shape
> the system. Every entry must be confirmed against the current official text, and by a qualified
> advisor in each country, before the related feature goes live. Nothing in this system is certified,
> integrated with, or approved by any authority.

## How this register was compiled

- **Date checked:** 2026-10-21 for every entry.
- **Method:** web searches restricted to official domains (`zatca.gov.sa`, `eta.gov.eg`,
  `sdk.invoicing.eta.gov.eg`, `mof.gov.eg`, `sfda.gov.sa`, `edaegypt.gov.eg`, `sdaia.gov.sa`,
  `dgp.sdaia.gov.sa`, `mc.gov.sa`, `cpa.gov.eg`, `pdpc.gov.eg`, `mcit.gov.eg`) and `gs1.org`. The build
  sandbox could not open these documents directly, so the summaries below come from search extracts of
  the official documents. **Re-read each source before implementing the related task.**
- Several sources are dated 2019–2023; newer versions may exist (noted per entry).
- **Status legend:** _Not implemented_ · _Data captured only_ (fields exist, no rule enforced) ·
  _Partially implemented_ · _Implemented (tested)_ — the latter means our rule is coded and tested, not
  that the business is compliant.

## Summary

| ID          | Country | Area                                    | Status                    | Owning task        |
| ----------- | ------- | --------------------------------------- | ------------------------- | ------------------ |
| KSA-TAX-01  | SA      | VAT standard rate 15 %                  | Not implemented           | PRC-001            |
| KSA-TAX-02  | SA      | VAT-inclusive price display             | Partially implemented     | PRC-001            |
| KSA-ID-01   | SA      | VAT registration number format          | Implemented (tested)      | ORG-001            |
| KSA-EINV-01 | SA      | E-invoicing phase 1 (generation)        | Not implemented           | EINV-001           |
| KSA-EINV-02 | SA      | E-invoicing phase 2 (integration)       | Not implemented — blocked | EINV-001           |
| KSA-COS-01  | SA      | SFDA cosmetics notification (listing)   | Data captured only        | CAT-001 / decision |
| KSA-COM-01  | SA      | E-commerce disclosures, consumer rights | Not implemented           | STORE-002, ORD-002 |
| KSA-PDP-01  | SA      | Personal Data Protection Law (PDPL)     | Partially implemented     | CUST-001, OPS-003  |
| EG-TAX-01   | EG      | VAT standard rate 14 %, table tax       | Not implemented           | PRC-001            |
| EG-ID-01    | EG      | Tax registration number (RIN) format    | Implemented (untested)    | ORG-001            |
| EG-EINV-01  | EG      | ETA e-invoice (B2B)                     | Not implemented — blocked | EINV-002           |
| EG-EINV-02  | EG      | ETA e-receipt (B2C / POS)               | Not implemented — blocked | EINV-002, POS-001  |
| EG-COS-01   | EG      | EDA cosmetics notification              | Data captured only        | CAT-001 / decision |
| EG-COM-01   | EG      | Consumer protection (Law 181/2018)      | Not implemented           | STORE-002, ORD-002 |
| EG-PDP-01   | EG      | Personal Data Protection (Law 151/2020) | Not implemented           | CUST-001, OPS-003  |
| GS1-01      | Both    | GTIN and barcode integrity              | Implemented (tested)      | CAT-001, CAT-002   |

---

## Saudi Arabia

### KSA-TAX-01 — VAT standard rate 15 %

- **Sources:** ZATCA,
  [Guideline — Business promotions](https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Business%20promotions.pdf);
  [Amendments to the VAT Implementing Regulation](<https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Amendments-to-the-Implementing-Regulation-of-(VAT).PDF>);
  [Guideline for tax invoicing and records](https://zatca.gov.sa/en/HelpCenter/guidelines/Documents/Guideline-for-Tax-Invoicing-and-Records-under-VAT-Provisions.pdf).
- **Requirement:** Standard rate 15 % since 1 July 2020. For a tax-inclusive price, VAT = total
  consideration × 15/115. VAT applies to the discounted consideration actually paid; "we pay the VAT"
  promotions do not remove the tax.
- **Implementation:** Not implemented — no tax calculation exists yet. PRC-001 will store rates with
  effective dates per country and compute tax per line (half-up at the minor unit, ADR-005).
- **Open questions:** Confirm perfumes are standard-rated with no special treatment.

### KSA-TAX-02 — VAT-inclusive price display

- **Sources:** ZATCA business promotions guideline (above);
  [Large businesses — VAT](https://zatca.gov.sa/en/RulesRegulations/VAT/Pages/Business_Large.aspx).
- **Requirement:** Prices published or displayed to the public must include VAT; a price without a VAT
  statement is presumed to include it. Display VAT-inclusive prices at the point of sale.
- **Implementation:** Partially implemented — each country has `prices_include_tax` (true for SA); the
  storefront states that Saudi prices include VAT. Tax breakdowns on invoices arrive with PRC-001/ORD-001.

### KSA-ID-01 — VAT registration number format

- **Sources:** ZATCA,
  [E-invoice specifications](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/E-Invoice-specifications.aspx)
  (XML implementation standard and security features standard, May 2023);
  [Developer portal manual](https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Documents/Developer%20Portal%20User%20Manual.pdf).
- **Requirement:** 15 digits, beginning and ending with 3. It is also tag 2 of the e-invoice QR code.
- **Implementation:** Implemented (tested) as a format check on legal entities
  (`taxNumberLooksValid`, `tests/integration/access-and-organization.test.ts`). Not verified against
  ZATCA records.

### KSA-EINV-01 — E-invoicing phase 1 (generation)

- **Sources:** ZATCA,
  [E-invoicing FAQ](https://zatca.gov.sa/en/E-Invoicing/Introduction/FAQ/Documents/E-Invoicing%20FAQ%20En.pdf);
  [Phase one requirements](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing_Simplified%20GL.pdf);
  [E-invoicing resolution (controls and technical specifications)](https://zatca.gov.sa/en/E-Invoicing/Introduction/LawsAndRegulations/Documents/20210602_ZATCA_Electronic_Invoice_Resolution_English_Vshared.pdf);
  [What is e-invoicing](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/What-is-e-invoicing.aspx).
- **Requirement (verify at source):** VAT-registered resident taxpayers issue tax invoices and notes
  electronically through a compliant solution (phase 1, in force since 4 December 2021); simplified
  (B2C) invoices carry a QR code; tampering-prone functions are prohibited.
- **Implementation:** Not implemented — there are no orders or invoices yet. **Release-critical:** any
  live sale in KSA needs compliant invoices (see `docs/IMPLEMENTATION_PLAN.md`, release readiness).

### KSA-EINV-02 — E-invoicing phase 2 (integration with FATOORA)

- **Sources:** ZATCA,
  [Detailed guidelines (May 2023)](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf);
  [Detailed technical guidelines (Nov 2022)](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf);
  [How to get ready / integrate with FATOORA](https://zatca.gov.sa/en/E-Invoicing/PreparingYourBusiness/Phase2/Documents/How%20to%20get%20ready.pdf);
  [QR code guide](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/QRCodeCreation.pdf);
  [Phase 2 start](https://zatca.gov.sa/en/MediaCenter/News/Pages/E-Invoicing-Phase-2-ntegration.aspx),
  [wave 2 criteria](https://zatca.gov.sa/en/MediaCenter/News/Pages/News_987.aspx),
  [wave 5 criteria](https://zatca.gov.sa/en/MediaCenter/News/Pages/news_1051.aspx).
- **Requirement:**
  - Applies in waves from 1 January 2023; ZATCA notifies each taxpayer group at least six months ahead.
  - Invoices are XML (UBL-based) or PDF/A-3 with embedded XML; submissions to FATOORA are plain XML.
  - Each e-invoice generation solution (EGS) unit is onboarded and receives a cryptographic stamp
    identifier (CSID); invoices are stamped and carry a phase 2 QR code (9 TLV tags, base64).
  - Tax invoices (B2B) follow **clearance** before issue; simplified invoices (B2C) follow **reporting**
    within 24 hours of generation, via APIs.
  - The simplified invoice is given to the buyer immediately (printed, or electronically if agreed).
  - Simplified invoices may be used for B2B supplies under SAR 1,000; B2C has no cap.
  - ZATCA provides an integration sandbox for onboarding and test submissions.
- **Implementation:** Not implemented. **Blocked** on taxpayer onboarding and credentials (EINV-001).
  No submission will ever be simulated as successful.
- **Open questions:** Which wave covers our legal entity and when; EGS topology (online store and each
  POS terminal); invoice/credit-note numbering; whether the latest XML standard supersedes May 2023.

### KSA-COS-01 — SFDA cosmetics notification (product listing)

- **Sources:** SFDA,
  [Guidance on cosmetic products notification](https://www.sfda.gov.sa/en/regulations/62871);
  [Ghad system user guide — cosmetics](https://www.sfda.gov.sa/sites/default/files/2025-01/Cosmetic%20Licensing%20and%20Products%20Service%20%20in%20Ghad%20System.pdf);
  [Notified (listed) cosmetic products](https://www.sfda.gov.sa/en/cosmetics-list);
  [Products classification guidance](https://www.sfda.gov.sa/sites/default/files/2024-02/SFDA-ProductsClassificationGuidanceV7E.pdf).
- **Requirement:** Importers or manufacturers notify cosmetic products to SFDA before marketing and are
  responsible for them. Perfumes (hydroalcoholic and non-hydroalcoholic) are cosmetics and must meet
  SFDA.CO/GSO 1943 safety requirements and SFDA circulars; no medicinal or therapeutic claims.
- **Implementation:** Data captured only — `product_compliance` stores authority, reference type and
  number, status and dates per product and country. Publishing does not require an active SFDA entry.
- **Open questions:** Should publishing in the SA market require an ACTIVE SFDA listing (recommended)?
  Arabic labelling rules for perfumes and which label data (batch, expiry, period after opening) the
  system must capture.

### KSA-COM-01 — E-commerce disclosures and consumer rights

- **Sources:** Ministry of Commerce,
  [Guide to consumer rights and responsibilities (2023)](https://mc.gov.sa/en/guides/Documents/CustomerGuide.pdf);
  [Online services are covered by the E-Commerce System](https://mc.gov.sa/en/mediacenter/news/pages/10-07-19-01.aspx);
  [Returning defective goods](https://mc.gov.sa/en/mediacenter/News/Pages/15-08-19-01.aspx);
  [Commercial Register Law](https://mc.gov.sa/en/mediacenter/News/Pages/17-09-24-01.aspx).
- **Requirement:** The online store shows its name, address, contact details, tax number and commercial
  registration number (with a verification link); the consumer receives the contract terms including
  the total price with taxes, payment, delivery and warranty conditions; 7-day right to return unused
  goods; cancellation if delivery is more than 15 days late; no marketing use of consumer data without
  permission; no misleading advertising. The CR number appears on correspondence and printed material.
- **Implementation:** Not implemented. Legal-entity fields (CR, VAT number, address) exist; the
  storefront footer shows only a demonstration notice. STORE-002 (seller identification and legal pages)
  and ORD-002 (returns) own this.
- **Open questions:** Current text of the E-Commerce Law implementing regulations; any e-commerce
  authentication/registration required for the store.

### KSA-PDP-01 — Personal Data Protection Law (PDPL)

- **Sources:** SDAIA,
  [Personal Data Protection Law (English)](https://sdaia.gov.sa/en/SDAIA/about/Documents/Personal%20Data%20English%20V2-23April2023-%20Reviewed-.pdf);
  [Implementing regulation](https://sdaia.gov.sa/en/SDAIA/about/Documents/ImplementingRegulation.pdf);
  [Regulation on personal data transfer outside the Kingdom](https://dgp.sdaia.gov.sa/wps/wcm/connect/e5bbede0-1119-4f70-b4ef-f043ce58d780/Regulation+on+Personal+Data+Transfer+Outside+the+Kingdom..pdf?MOD=AJPERES&CONVERT_TO=url&CACHEID=ROOTWORKSPACE-e5bbede0-1119-4f70-b4ef-f043ce58d780-p6OMj1M);
  [Guide for controllers and processors](https://dgp.sdaia.gov.sa/wps/wcm/connect/f579bc32-fda8-47bd-bc6f-66b8cb77985c/ENG-Guide+to+the+saudi+PDP+law+for+controllersprocessors.pdf?MOD=AJPERES).
- **Requirement:** The law covers processing of data about people in the Kingdom even when stored abroad.
  Transfers abroad only with an adequacy decision, approved safeguards (binding common rules, standard
  contractual clauses, certification) or a listed exemption, limited to the minimum data, with risk
  assessments; transfers stop if risks become high or safeguards lapse.
- **Implementation:** Partially — today only staff data is processed (name, e-mail, session IP and user
  agent, audit entries); passwords are hashed and secrets redacted from logs. Customer data, consent,
  privacy notice, data-subject requests and retention arrive with CUST-001; hosting location with OPS-003.
- **Open questions:** Hosting in-Kingdom or abroad with safeguards; registration obligations; retention
  periods for sessions and audit logs; DPO requirement.

## Egypt

### EG-TAX-01 — VAT standard rate 14 % and table tax

- **Sources:** ETA,
  [VAT Law No. 67 of 2016 (English, updated Jan 2023)](https://www.eta.gov.eg/sites/default/files/2024-02/Law-english-no.67-2016.pdf.pdf);
  [VAT executive regulations](https://www.eta.gov.eg/sites/default/files/2024-02/VAT-Executive-Regulations-English.pdf);
  [eInvoicing tax type codes](https://sdk.invoicing.eta.gov.eg/codes/tax-types/).
- **Requirement:** Standard rate 14 % from 1 July 2017. Goods in the law's table carry table tax in
  addition to VAT.
- **Implementation:** Not implemented (PRC-001). EG currently has `prices_include_tax = true` as a display
  assumption that needs confirmation.
- **Open questions:** Does any table tax apply to perfumes or cosmetics? Must consumer prices be shown
  VAT-inclusive in Egypt?

### EG-ID-01 — Tax registration number (RIN)

- **Sources:** ETA SDK, [Main calculations / validation rules](https://sdk.invoicing.eta.gov.eg/main-calculations/);
  [Invoice v1.0](https://sdk.invoicing.eta.gov.eg/documents/invoice-v1-0/).
- **Requirement:** The issuer identifier for an Egyptian business is its registration number; validation
  rules state 9 digits for the seller RIN and business buyers.
- **Implementation:** Implemented as a 9-digit format check on Egyptian legal entities; no automated test
  yet (add with the next organisation change).

### EG-EINV-01 — ETA e-invoice (B2B)

- **Sources:** [ETA home](https://eta.gov.eg/en/home);
  [eInvoicing portal](https://invoicing.eta.gov.eg/content?lng=en);
  [eInvoicing & eReceipt SDK](https://sdk.invoicing.eta.gov.eg/), [getting started](https://sdk.invoicing.eta.gov.eg/start/).
- **Requirement:** All taxpayers are obliged to issue electronic tax invoices (Ministerial Decision
  188/2020); since 1 April 2023 customs dealings are limited to entities issuing e-invoices. Taxpayers
  register a digital profile, register their ERP systems, and submit signed documents through the APIs.
- **Implementation:** Not implemented. **Blocked** on ETA registration and credentials (EINV-002).

### EG-EINV-02 — ETA e-receipt (B2C / POS)

- **Sources:** ETA SDK, [eReceipt API](https://sdk.invoicing.eta.gov.eg/ereceiptapi/);
  [Authenticate POS](https://sdk.invoicing.eta.gov.eg/ereceiptapi/01-authenticate-pos/);
  [Receipt v1.2](https://sdk.invoicing.eta.gov.eg/documents/receipt-v1-2/);
  [Receipt issuance FAQ](https://sdk.invoicing.eta.gov.eg/receiptissuancefaq/);
  [Integration toolkit](https://sdk.invoicing.eta.gov.eg/toolkit/home/).
- **Requirement:**
  - The issuer needs the B2C tag; each POS device is registered and linked to the issuer's RIN before it
    issues receipts; retired devices' submissions are rejected.
  - POS systems authenticate per device through the ETA identity service (tokens expire; re-authenticate
    on unauthorised responses); documents are signed.
  - Each receipt has a UUID, a SHA-256 hash and the previous receipt's UUID (empty only for a POS's first
    receipt); receipt numbers are unique per branch; seller data includes branch code, POS serial and
    activity code.
  - Buyer ID and name are optional except for business buyers and for individuals at or above a
    configured threshold (EGP 150,000 per the SDK).
  - Late submission is allowed only within a profile-defined window and requires a reason.
  - ETA's toolkit (Docker, NuGet or CLI) supports offline issuance, QR codes and signing; one POS per
    installation.
- **Implementation:** Not implemented. **Blocked** on registration, POS credentials and signing
  certificate (EINV-002, POS-001). The receipt chain (previous UUID) constrains POS offline design.

### EG-COS-01 — EDA cosmetics notification

- **Sources:** Egyptian Drug Authority,
  [Regulatory guide for cosmetics notification](https://edaegypt.gov.eg/media/1zjbwa1w/regulatory-guide-for-cosmetics-notification.pdf);
  [Claims guide](https://edaegypt.gov.eg/media/ujnj22c2/claims-guide-for-cosmetics-notification.pdf);
  [Guidelines for cosmetic advertising materials (2026)](https://edaegypt.gov.eg/media/zctpsbnb/guidelines-for-cosmetic-advertising-materials-en-2026.pdf);
  [Cosmetics companies portal manual](https://www.edaegypt.gov.eg/media/1xoc4o0i/final-user-manual1_.pdf).
- **Requirement:** Cosmetics (local or imported) may circulate only after notification in EDA's
  electronic database. Notification numbers issue within 10 working days (normal) or 3 (fast track) and
  are valid for ten years. The dossier includes trade name, company, full composition (scientific names,
  concentrations, functions), artwork, fee payment and shelf life; imports add a legalised free-sale
  certificate and agent authorisation. Labels show product name, applicant and manufacturer, country of
  origin, notification number or barcode and net quantity, with an English ingredients list. Prohibited
  substances apply (e.g. methanol). Advertising materials are filed at least three working days before
  publication.
- **Implementation:** Data captured only (`product_compliance`). No advertising-approval workflow.
- **Open questions:** Who holds notifications (importer or local agent)? Do storefront product pages and
  promotions count as advertising materials requiring EDA filing (affects MKT-001)? Should publishing in
  the EG market require an ACTIVE EDA notification?

### EG-COM-01 — Consumer protection (Law 181/2018)

- **Sources:** Consumer Protection Agency, [About](https://cpa.gov.eg/en-us/About-CPA),
  [FAQ](https://cpa.gov.eg/en-us/FAQ), [legislation](https://cpa.gov.eg/ar-eg/%D8%AA%D8%B4%D8%B1%D9%8A%D8%B9%D8%A7%D8%AA).
- **Requirement:** An invoice is mandatory and shows the advertised price; for defective products the
  supplier replaces, repairs or refunds at no extra cost; the Agency issues binding decisions in
  disputes.
- **Implementation:** Not implemented (STORE-002, ORD-002).
- **Open questions:** The withdrawal period for distance (online) sales under the law and its executive
  regulations was not confirmed from official sources.

### EG-PDP-01 — Personal Data Protection Law (No. 151 of 2020)

- **Sources:** [Personal Data Protection Center](https://pdpc.gov.eg/);
  [privacy notice guidelines](https://www.pdpc.gov.eg/assets/pdf-data/Guidelines/Privacy%20Notice.pdf);
  [consent guidelines](https://pdpc.gov.eg/assets/pdf-data/Guidelines/DSConsent.pdf);
  [DPO guidelines](https://pdpc.gov.eg/assets/pdf-data/Guidelines/DPO.pdf).
- **Requirement:** The PDPC portal states that executive regulations are in force (it cites No. 816 of
  2025 — verify). Cross-border transfers generally need a PDPC licence or permit unless an exception
  applies; electronic direct marketing requires licences; PDPC publishes guidance on privacy notices,
  consent and data protection officers.
- **Implementation:** Not implemented — no customer data is processed yet (CUST-001, MKT-001, OPS-003).
- **Open questions:** Which licences or permits apply to us as controller, for hosting abroad, and for
  marketing messages.

## Cross-cutting

### GS1-01 — GTIN and barcode integrity

- **Sources:** GS1, [GS1 Company Prefix](https://www.gs1.org/standards/id-keys/company-prefix);
  [GS1 style guide](https://www.gs1.org/standards/gs1-style-guide/54);
  [Digital Link URI syntax](https://ref.gs1.org/standards/digital-link/uri-syntax/1.7.0/).
- **Requirement:** GTINs are allocated under a licensed GS1 Company Prefix. Prefix 952 is reserved for
  demonstrations and examples and must never identify real items, not even internally.
- **Implementation:** Implemented (tested) — GTIN check-digit validation and DB uniqueness
  (`tests/unit/barcode.test.ts`, `tests/integration/catalog.test.ts`); internal codes are Code 128 values
  beginning with letters (`PF…`), never presented as GTINs; 952 numbers appear only in seed and tests;
  storefront structured data declares `gtin` only for manufacturer barcodes. CAT-002 will refuse 952
  numbers in production.

## Consolidated open questions for advisors

1. ZATCA phase 2 wave and date for our legal entity; EGS unit topology (online store, each POS).
2. Must an ACTIVE SFDA listing (SA) or EDA notification (EG) exist before a product is published online?
3. Egypt: VAT-inclusive consumer price display? Table tax on perfumes or cosmetics?
4. Egypt: withdrawal period for online sales under Law 181/2018.
5. KSA PDPL: hosting location, registration, retention periods, DPO.
6. Egypt PDPL: licences/permits for processing, cross-border transfer and electronic marketing.
7. Perfume labelling in each country (Arabic text, batch, expiry, period after opening) — fields to
   capture in the catalogue and inventory.
8. Online-store registration or authentication requirements in each country.
9. Statutory retention periods for invoices and accounting records (drives audit-log purge policy).
