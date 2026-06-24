# DCPR + BIR Compliance — Spec Pack (Beru, 2026-06-14)

> Domain spec for two new read-only reporting modules. Source for Bellion's build plan + the builders. Anchored to the live GL (project `zpfkhcnxtiyojodtmepn`) and `docs/accounting-significance-advisory.md`.

## Flagged assumptions — RESOLVED from build history (orchestrator, 2026-06-14)
- **A1 — RESOLVED:** Collection (COLL) debits **Cash in Bank (acc_titles id 11)**, NOT Undeposited Funds. DCPR cash set = **Cash on Hand (12) + Cash in Bank (11)**. Undeposited Funds (10) is unused by any current posting (no Deposit Slip transaction exists). 
- **A2 — RESOLVED:** Weighbridge `price` is **VAT-INCLUSIVE** → Taxable Sales = `price ÷ 1.12`, Output VAT = `price − price÷1.12` (verified live: 1120 → 1000 + 120). **Vendo currently posts NO output VAT** (gross → Vendo Sales; vendo VAT treatment is an OPEN business decision — report vendo sales with zero output VAT until decided).
- **A3 — RESOLVED:** SBILL posts **no creditable Input VAT** (rice-side input VAT non-creditable, capitalized). Input VAT schedule = ₱0-with-note. `Input VAT – Clearing (Transitional)` (id 5) is dormant.
- **A4 — RESOLVED:** `journal_entries.source_table` holds literal table names (`sales_invoices`, `collections`, `supplier_invoices`, `supplier_payments`, `weighbridge_tickets`, `toll_milling`, `vendo_entries`, `goods_receipts`, `milling_batches`).

## Live posting transactions (recap)
SINV (Dr AR / Cr Sales-Rice[exempt] or Sales-VATable + Output VAT 20), COLL (Dr Cash in Bank 11 + CWT 6 / Cr AR 22-ish), SBILL (Dr GR/IR 21 / Cr AP + Withholding Tax Payable 19), PAY (Dr AP / Cr Cash in Bank 11), WB (Cr Weighing Rev 28 + Output VAT 20, VAT-inclusive), TOLL (Cr Toll Rev 29, exempt), VENDO (Cr Vendo Sales 27, no VAT), GRN (Dr Inventory-Paddy / Cr GR-IR 21), MILL.

---

# DELIVERABLE 1 — DCPR (Daily Collection & Payment Report)

**Purpose/audience:** daily cash-accountability report — per cash account, opening → receipts → payments → closing, so owner/cashier can answer "do we have the cash the books say?" Doubles as Cash Receipts Book + Cash Disbursements Book (RR 9-2009).

**Data source — GL (decisive):** build from `journal_lines` on the cash accounts via `v_account_ledger`/`v_journal_register`, NOT source tables. Reasons: single source of truth & self-consistency; opening/closing free from `v_account_ledger.running_balance` (window `Σ(debit−credit)` partitioned by account, ordered date/entry/line) — opening = last running_balance before period start, closing = last on/before end-of-day; coverage now complete (all cash posts); reversals already modeled. Cash set = ids {12, 11} (configurable list in gl_settings, +10 UF if ever used).

**Layout — one panel per cash account:**
- (a) Opening Balance (running_balance immediately before period start).
- (b) RECEIPTS = journal lines on the cash account with `debit>0`, itemized & grouped by type from `source_table`: Customer Collection (collections→or_no, customers.name), Weighbridge Cash (weighbridge_tickets→or_no, .customer), Toll Milling (toll_milling→or_no, .customer), Vendo Income (vendo_entries, "Vendo – {category}"), Other (JV/manual). Columns: Date(entry_date) · Type · Ref No(doc no + entry_no) · Payor · Particulars(memo) · Account · Amount(debit). Subtotal by type → Total Receipts.
- (c) PAYMENTS = lines with `credit>0`: Supplier Payment (supplier_payments→no/check_no, suppliers.name), Vendo Expense, Other. Columns mirror (b) with Payee + Amount(credit). Subtotal → Total Payments.
- (d) Net Movement = Receipts − Payments. (e) Closing = Opening + Receipts − Payments.
- Consolidated footer across accounts.

**Reconciliation checks (render visibly pass/fail):** (1) Closing = Opening + Receipts − Payments per account & consolidated. (2) GL tie-out: panel Closing = `v_account_ledger.running_balance` at end-of-day — green "ties to GL" / red variance badge. (3) Intra-treasury transfer exclusion: a line whose contra account is also in the cash set is a transfer — separate "Transfers between cash accounts" sub-section, netted out of consolidated operating totals (per-account panels still show it). [No transfer txn exists yet; design the rule now.] (4) Reversals: badge REVERSED/REVERSAL in the itemized list (totals self-correct).

**v1 scope:** single date + range mode; cash set {12,11}; itemized by type; the 3 checks; print/PDF as dual receipts/disbursements book.
**Deferred:** Undeposited Funds/deposit-in-transit (needs Deposit Slip txn); bank reconciliation; multi-currency; transfer txns themselves.
**Build:** server-side `v_dcpr_lines` (cash-account journal lines enriched with mapped Type/Ref/Payor-Payee via source_table joins) + `rpc_dcpr(p_date_from, p_date_to)` returning `{per_account:[{opening, receipts[], payments[], transfers[], totals, closing, ties_to_gl}], consolidated}`. Opening-balance (full-history scan) MUST be server-side.

---

# DELIVERABLE 2 — BIR Compliance (v1)

**Assumption:** RJL is **VAT-registered** (advisory default). Drive the module off a `gl_settings.vat_registered` flag; if non-VAT, VAT Summary → Percentage Tax 3% (2551Q) on VATable-type receipts, output VAT disappears.

**v1 IN:** (1) VAT Summary [2550Q], (2) Sales Register/Book, (3) Purchase Register/Book, (4) CWT Receivable register [2307 received]. **v1 IN but DATA-LIMITED:** (5) EWT summary [1601-EQ + 2307 issued]. **DEFERRED:** printable Form 2307 (no ATC codes), creditable input-VAT schedule (none by design — ₱0+note), 1601-C/1701Q/1702Q/e-filing exports.

**Report 1 — VAT Summary (2550Q):** GL lines by revenue account over period. VATable → Weighing Rev (28), Sales-VATable Goods (30), Vendo Sales (27, no VAT posted yet). Output VAT = credits to Output VAT Payable (20). Exempt → Sales-Rice (31), Toll (29). Sections: Output Tax (per VATable acct: Taxable net · Output VAT), Exempt Sales (amount only), Zero-rated (₱0), Input Tax (₱0 + capitalization note), Net VAT Payable = Output − 0. Check: Σ output VAT = period movement of acct 20. A2 resolved (VAT-inclusive: net = price÷1.12).

**Report 2 — Sales Register/Book (SLSP-style):** GL-sourced, every revenue-account credit, joined to source docs for TIN. Columns: Date · DocType(SINV/WB/TOLL/VENDO) · Ref · Customer · Customer TIN · Taxable · Output VAT · Exempt · Zero-rated · Gross. **GAP:** collections/sales_invoices→customers.tin ✔; weighbridge_tickets.customer & toll_milling.customer are free-text (no TIN) → flag "TIN missing"; vendo = anonymous retail, aggregate as daily "Various" line (no TIN, OK for cash retail). Defer making WB/toll customer a FK.

**Report 3 — Purchase Register/Book:** `supplier_invoices`(+lines) ⋈ `suppliers`(tin, bir_registered); cross-check GR/IR(21)→AP(22). Columns: Date · Supplier · TIN · Supplier Inv No · Gross · Input VAT(₱0/non-creditable) · Net · EWT. GAP: header-level only, flag missing TINs.

**Report 4 — CWT Receivable register (2307 received):** `collections` where ewt>0 ⋈ customers; tie to CWT Receivable (6). Columns: Date · OR No · Customer · TIN · Gross · CWT Withheld(ewt) · Net · **2307 Received? flag · 2307 Date/No**. **GAP — field missing:** add `collections.cwt_2307_received boolean` + `collections.cwt_2307_ref text` (v1 small addition; report incomplete without it). Check: Σ CWT = movement of acct 6.

**Report 5 — EWT summary (1601-EQ; 2307 issued) — DATA-LIMITED:** `supplier_invoices.ewt_amt` (and PO ewt) ⋈ suppliers(tin, bir_registered, ewt_rate); tie to Withholding Tax Payable (19). Columns: Date · Supplier · TIN · **ATC/Rate** · Tax Base · EWT Amount → 1601-EQ totals. **GAPS:** no ATC code field anywhere (need `supplier_invoices.atc` + optional `suppliers.default_atc` before a compliant 2307 — defer the printable form, ship the schedule, add the column now so data accrues); partial-receipt EWT over-withholds (reconcile EWT to booked bill base, not PO; flag mismatches); TIN completeness. Check: Σ EWT = movement of acct 19.

**Build:** server-side views/RPCs for all 5: `rpc_vat_summary(from,to)`, `rpc_sales_register(from,to)`/`v_sales_register`, `v_purchase_register`, `v_cwt_received`, `v_ewt_withheld` (reconciled to acct 19 with partial-receipt + missing-ATC flags).

**v1 small schema additions (justified):** (1) `collections.cwt_2307_received boolean` + `cwt_2307_ref text`; (2) `supplier_invoices.atc text` (+ optional `suppliers.default_atc`); (3) optional follow-up: WB/toll customer → FK to customers.

**v1 CANNOT yet produce correctly:** filed 2550Q if vendo VAT undecided; printable 2307 (no ATC); creditable input VAT (none by design); DCPR UF/deposit-in-transit; bank rec; income-tax returns.
