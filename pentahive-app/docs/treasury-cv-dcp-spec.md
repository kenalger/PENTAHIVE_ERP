# Treasury Spec — Check Voucher (CV) + Daily Cash Position (DCP)

> Beru, 2026-06-14, project `zpfkhcnxtiyojodtmepn`. Domain spec for the team. All target tables read 0 rows — reshapes are greenfield-safe; protect the built frontend, not data.

## Live facts
- **APV = the bill** = `supplier_invoices` (`no` BILL-…, supplier_id, grn_id, po_id, gross_amt, ewt_amt, net_payable, status open/paid, due_date, atc). SBILL posts Dr GR/IR(21) / Cr AP-Trade(22) / Cr WHT Payable-EWT(19). EWT withheld at bill time; cash payable = `net_payable`.
- **CV today** = `supplier_payments` (single `supplier_invoice_id` FK, amount, mode, paid_from free-text, check_no, status). PAY posts Dr AP(22) / Cr Cash in Bank(11).
- **BUG found:** `paid_from` is free-text; PAY credit is **hardcoded to Cash in Bank (11)** regardless → paying from Cash on Hand mis-posts. Fix via a real `cash_account_id`.
- COA: AP-Trade(22), Cash in Bank(11), Cash on Hand(12), WHT Payable EWT(19). Only ONE Cash in Bank + ONE Cash on Hand title (no per-bank sub-accounts). `doc_counters` has CV series ready. `supplier_invoices.status` = open/paid only (no `partial`).

---

## DELIVERABLE 1 — Check Voucher (CV) paying one OR many APVs

**Terminology:** APV (Accounts Payable Voucher) = recorded supplier bill (books the liability). CV (Check Voucher) = the disbursement paying 1..N APVs. An APV may be paid across 1..N CVs (partial). Many-to-many → allocation table.

**Data model — CV header + allocation lines:**
- Keep `supplier_payments` as the **CV header** (least frontend churn). Keep `id, no (next_doc_no('CV')), supplier_id, payment_date, mode, check_no, status, created_at`. `amount` → **total check amount** (= Σ allocations). **ADD `cash_account_id int NOT NULL`** FK to cash set {12,11} — **drives the credit side** (fixes the mis-post). **DEPRECATE `supplier_invoice_id`** (allocations replace it). `paid_from` → optional descriptive memo only, never drives GL.
- **NEW `supplier_payment_allocations`:** `id uuid pk, payment_id → supplier_payments, supplier_invoice_id → supplier_invoices, amount_applied numeric >0, line_no int`. Constraint: all allocations on a CV reference bills of the same `supplier_id` as the header.

**Behavior:**
- **One supplier (payee) per CV — enforce** (one check = one payee; AP subsidiary + 2307 are per payee; matches SAP B1 / NetSuite). User picks supplier → screen lists that supplier's **open + partial** APVs → tick one or many.
- **Full or partial per APV:** `amount_applied ≤ remaining`, where `remaining = net_payable − Σ amount_applied across POSTED CVs`. Derive remaining from allocations (no denormalized drift).
- **Status (add `partial` to supplier_invoices.status):** per bill after posting — Σapplied ≥ net_payable → `paid`; 0<Σ<net_payable → `partial`; else `open`.
- **Overpayment/advances:** disallow in v1 (reject amount_applied > remaining). **Early-payment discounts:** defer to v2.

**GL entry (multi-APV CV, supplier S, cash account C):**
- **Dr AP-Trade(22) — ONE line per APV** = amount_applied (memo carries bill no) → AP subsidiary reconciles per bill.
- **Cr Cash account (11 or 12 per `cash_account_id`)** = total check amount.
- **EWT NOT re-applied** (already at bill). `suppliers.ap_balance −= total`.

**Void/reverse (make explicit):** voiding a CV posts a reversing JE (Dr Cash / Cr AP per line), restores ap_balance, recomputes affected bills to partial/open, header → cancelled. Never edit a posted CV.

**BIR:** CV is the cash-disbursement record (feeds DCPR payments side); 2307 already issued at bill time. Retain check copy + CV print with APV allocation breakdown + 2307 link.

**v1 IN:** header+allocations, one-supplier-per-CV, full/partial per APV, cash_account_id-driven credit, per-bill AP debit lines, status open/partial/paid, void/reverse. **Deferred:** overpayment/advances, discounts, multi-supplier checks, per-bank cash accounts.
**DB objects:** Migration (reshape `supplier_payments` +cash_account_id, repurpose amount, deprecate supplier_invoice_id; new `supplier_payment_allocations`; add 'partial' status). Preset migration (PAY cash role resolves from cash_account_id, not constant 11). RPC `rpc_post_cv(header, allocations[])` (validates same-supplier + amount_applied ≤ remaining, posts per-line JE, updates ap_balance + bill statuses, returns CV no). Helper `rpc_open_apvs(p_supplier_id)` → bills with computed `remaining`.

---

## DELIVERABLE 2 — DCP (Daily Cash Position), Treasury "Cash Position" page

**DCP vs DCPR (avoid duplicate):** DCPR = daily register/journal (itemized receipts vs payments per cash account; Cash Receipts + Disbursements Book). DCP = treasury **liquidity/position** view: (a) consolidated cash snapshot as-of a date, (b) closing-balance trend across a range, (c) forward projection. Without (b)+(c) it collapses into DCPR's footer — that's the trap.

**Data source:** GL cash accounts via `v_account_ledger` / DCPR views (NOT source tables). Cash set {12,11}. Reuse `rpc_dcpr`'s opening→in→out→closing engine internally.

**Contents:**
- **Section A — Actual position as-of date D:** per cash account Opening→Inflows→Outflows→Closing + Consolidated row. Intra-treasury transfers netted from consolidated (design rule now; no transfer txn yet).
- **Section B — Closing-balance trend (range):** per-account + consolidated closing per day (the over-time view DCPR lacks).
- **Section C — Forward projection (v1, labeled "indicative/off-GL"):** Expected outflows = open/partial `supplier_invoices` by due_date, amount = computed remaining; buckets Overdue/0–7d/8–30d/30d+. Expected inflows = open `sales_invoices` (AR) by due date (exclude point-of-sale collections). Projected closing = current consolidated cash − expected out + expected in, per bucket.

**Tie-outs:** per account Closing = Opening+In−Out; each Closing = `v_account_ledger.running_balance` end-of-day (green/red badge); consolidated = Σ closings (transfers netted); Section C reconciles to AP(22)/AR control open balances.

**CANNOT support yet:** **no per-bank position** (COA has one Cash in Bank, one Cash on Hand; paid_from text never hits GL) → DCP v1 = two buckets (Cash on Hand, Cash in Bank) + consolidated, NOT per-bank. Deferred pending COA per-bank sub-accounts. Deliverable 1's `cash_account_id` is a prerequisite for correct outflow attribution.

**v1 IN:** Section A (2 buckets + consolidated), B (trend), C (indicative projection), 4 tie-outs, print. **Deferred:** per-bank, bank rec, multi-currency, transfer txns.
**DB objects (read-only, NO migration for DCP):** view `v_dcp_position`, view `v_dcp_forward`, RPC `rpc_dcp(p_as_of, p_from, p_to)` → {snapshot[], consolidated, trend[], forward{}}. Opening scan server-side. Gated SECURITY DEFINER on `treasury` page code (like dcpr/bir RPCs — GL tables RLS-gated on general-ledger, so report-only users would get empty data without the definer+page-gate pattern).

---

## Sequencing
1. CV `cash_account_id` + preset fix (corrects the live mis-post bug). 2. CV header+allocations + `partial` status + rpc_post_cv/rpc_open_apvs + CV UI under Treasury. 3. DCP (reads 1+2; forward projection needs per-APV remaining).
