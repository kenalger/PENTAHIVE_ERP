---
name: pentahive-accounting-gap
description: PENTAHIVE/JKL ERP has no GL/posting engine — it is an operational capture layer; key accounting gaps and the PH rice-mill VAT treatment
metadata:
  type: project
---

PENTAHIVE_ERP (rice-milling + procurement + sales + vending business, PH/BIR). Verified against live DB `zpfkhcnxtiyojodtmepn` on 2026-06-13:

**It is NOT a set of books — it's a transaction-capture/workflow layer.** No journal/ledger/GL/chart-of-accounts/posting table exists; every trigger is `audit_*` or `*_updated_at` (zero posting triggers). It records documents and runs status workflows but produces no double-entry, maintains no balances, computes no statements.

Critical gaps: (1) no GL/double-entry; (2) COGS impossible — `deliveries` is header-only (no lines/qty/SKU); (3) inventory moved only by a non-atomic manual Adjust (GRN/Delivery/Milling move no stock); `inventory.sku` text doesn't share a key with documents' `item_id` uuid; (4) `customers.ar_balance`/`ytd_sales`/`suppliers.ytd_purchases` are READ for the SO credit-hold check but WRITTEN by nothing → credit gate runs on a fictional balance; (5) EWT captured (`purchase_orders.ewt_amount`, `collections.ewt`) but never posted/remitted; (6) `sales_invoices` + `collections` are schema-only (no UI); (7) milling cost uses a hardcoded "≈20 sacks/MT".

**PH VAT (the load-bearing call):** rice in original state and palay→rice milling are VAT-EXEMPT (NIRC §109(1)(A) and (F)) → output VAT correctly zero for those; unused vat columns are NOT a bug for rice. The real exposure is input-side (input VAT on rice-side purchases is non-creditable → capitalize into inventory cost) and the VATable edges (weighbridge service = 12%, vendo = item-dependent) → JKL is a mixed-VAT entity needing input-VAT allocation. Do NOT build a standard VATable-trader posting model.

Full write-ups: `pentahive-app/docs/erp-transaction-documentation.md` (Jinho) and `pentahive-app/docs/accounting-significance-advisory.md` (Beru, with per-transaction journals + 5-phase remediation roadmap). See [[pentahive-auth-model]] and [[ahjin-guild-agents]].
