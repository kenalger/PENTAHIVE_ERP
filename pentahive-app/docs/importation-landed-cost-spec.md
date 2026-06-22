# Importation Module + Landed Costing — Consolidated Spec (Jinho + Gunhee + Beru, 2026-06-15)

> Build source for Bellion's plan. Project `zpfkhcnxtiyojodtmepn`. RJL rice mill imports packaging, milling machinery/spare parts, and possibly rice.

## RESOLVED OWNER DECISIONS
- **ALL importing flows through the new Importation module.** Both `sales_orders` AND `purchase_orders` lose their `import` stream → both become **local-only**; every import is created in the Importation module. (Keep the `stream` columns defaulted to 'local', remove the import UI; no data migration — no import SO/PO exist.)
- **AP – Foreign Supplier** = NEW control account (separate from AP – Trade, for FX/aging clarity).
- **FX:** single rate per shipment in v1; no revaluation / no realized FX gain-loss (deferred).
- **Item-type routing:** landed cost capitalizes to **Inventory** for goods (packaging/rice) and **PPE/Fixed Asset** (Milling Machinery & Equipment) for machinery/spares — resolved **per line** by item type.
- **Mixed-use VAT:** apportion by primary use in v1 (manual JV for refinement).

## 1. Entity & scope (Jinho)
An **Import Shipment** is an **import purchase**: buy from a foreign supplier → ship → BOC clearance → receive into inventory/PPE at **landed cost**. The module is the dedicated home for import procurement, reusing the live PO→GRN→supplier-bill→Check-Voucher spine and adding shipment tracking + landed-cost capitalization. NOT a sales doc.

**New tables:**
- `import_shipments` (header): `shipment_no` (new `IMP` doc series via `next_doc_no('IMP')`), `date`, `supplier_id` (foreign), `currency`, `fx_rate`, `incoterm` (FOB/CIF/CFR/EXW), `invoice_value_fcy`/`invoice_value_php`, `bl_awb_no`, `expected_arrival`/`actual_arrival`, `status`, optional `po_id`, notes, audit. A shipment may reference **1..N PO/GRN**.
- `import_shipment_lines`: `item_id`, `description`, `uom`, `qty`, `unit_cost_fcy`, `unit_cost_php`, `line_total_fcy`/`line_total_php`, `allocated_landed_cost`, `final_landed_unit_cost`.
- `import_landed_costs` (cost components): `shipment_id`, `cost_type`, `amount_php`, `allocation_basis` (value/weight/qty/per-line), `capitalize` (bool), optional `supplier_id` (broker/forwarder), optional `supplier_bill_id`.
- New `doc_counters` row `IMP`.

**Status lifecycle:** `draft → in_transit → arrived → in_clearance → released → received → costed → closed` (+ `cancelled`). `received` triggers the goods-receipt GL; `costed` once landed cost is posted. (Reuse PO's `boc_clearance` vocabulary concept.)

**Sales Order + Purchase Order change (local-only):** remove the stream selector, Import filter segment, Stream column, and the "Import MTD" KPI card from `sales-orders.ts` (and the equivalent import UI from `purchase-orders.ts`); stop `onCustomerChange`/`onSupplierChange` setting an import stream. Keep `stream` column defaulted 'local'. `customers.stream`/`suppliers` import flags left inert (out of scope).

## 2. Operations — landed costing (Gunhee)
**Component classes:**
- **Per-line, direct (do NOT allocate):** customs **duties** (% per HS line, from BOC SAD/assessment), **import VAT** (per line). Allocating these across lines would corrupt unit costs (e.g. duty-free machinery vs dutiable packaging).
- **Shipment-level, shared (allocate):** international freight, marine insurance, brokerage, arrastre/wharfage, trucking-in.
**Capitalize vs expense (PAS 2):** capitalize goods value, freight, insurance, duties, brokerage, arrastre/wharfage, trucking-in, non-creditable import VAT. **Expense:** demurrage/abnormal storage, bank/LC financing charges.
**Capture ACTUALS** from the broker's Statement of Account + BOC OR/SAD — duty %/12% VAT are PO-stage estimates only.
**Allocation basis is per-component:** default **by value** (CIF line value PHP) for brokerage/arrastre/handling; **by weight/volume** for freight & insurance when line densities differ; **by qty** only if homogeneous. Formula: `allocated_C_to_line_i = C × (B_i / Σ B_all)`. Rounding: 2 dp, push residual centavo to the largest line so Σ allocations = component total exactly.
**Inventory effect (WAC):** landed unit cost raises the SKU's moving-average: `new_unit_cost = (existing_value + landed_value_in)/(existing_qty + qty_in)`. **Item-type routing:** goods → inventory WAC; machinery/spares → PPE asset cost (no WAC).
**FX:** convert foreign goods value at one shipment rate (date of entry/lodgement); duties & import VAT arrive already in PHP (capture actuals, no FX). Single rate, no revaluation in v1.

**Worked example** (3 lines; freight 150k by weight, brokerage 40k by value): L1 packaging CIF 300k/2000kg/duty 21k → landed 363k; L2 spares CIF 600k/1000kg/duty 0 → 639k; L3 cartons CIF 100k/7000kg/duty 7k → 216k. (Duty-free spares correctly carry zero duty.)

## 3. Accounting — GL postings (Beru)
**Two new clearing accounts** (SAP B1/NetSuite pattern): **Import GR/IR Clearing** (goods) + **Landed Cost Clearing** (3rd-party charges accrued vs actual). Plus new COA: **AP – Foreign Supplier**, **Customs Duties** (capitalizes into item, not a standing account — or a clearing), **Import Input VAT (creditable)** (or reuse Input VAT – Clearing id 5), and item targets (Inventory ids 4/2/1, Milling Machinery & Equipment id 16).

**Journal sequence:**
- **A. Goods receipt** (foreign invoice, NO VAT on foreign invoice): `Dr Inventory/PPE (item-type target) = goods value PHP / Cr Import GR/IR Clearing`.
- **B. BOC clearance** (duties + import VAT paid to BOC): duties always capitalize → `Dr Inventory/PPE (duties) / Cr Landed Cost Clearing or Cash-to-BOC`. **Import VAT — three paths:** (i) VATable import for VATable use → `Dr Input VAT (creditable, claimed in full upfront — capital-goods amortization repealed 2022) / Cr Cash-to-BOC`; (ii) VATable import consumed by EXEMPT rice output → **non-creditable → capitalize**: `Dr Inventory/PPE / Cr Cash-to-BOC`; (iii) **imported rice = VAT-EXEMPT importation (NIRC 109(1)(A)) → NO import VAT line at all** (only RA 11203 tariff/duty capitalized). VAT base = 12% × (BOC dutiable value + duties + charges) — **includes duty**, not the invoice value.
- **C. Local landed-cost service bills** (broker/trucker/arrastre, local suppliers — subject to EWT ~2% services): `Dr Landed Cost Clearing / Cr AP – Trade (net of EWT) + Cr Withholding Tax Payable (EWT, id 19)`.
- **Foreign supplier bill:** `Dr Import GR/IR Clearing / Cr AP – Foreign Supplier`.
- **Payment:** existing Check Voucher (PAY) `Dr AP / Cr Cash`.
**Final carrying value** = goods + duties + freight + insurance + brokerage + arrastre + non-creditable VAT (rice/exempt-use only). Creditable VAT sits in Input VAT, not inventory. Clearing accounts net to zero per shipment once fully invoiced (the month-end open-accrual report).

**Presets (slot into the live engine):** new `acc_transactions` codes **IMP** (goods receipt/bill: roles inv_target/fg_target/asset_target DEBIT, import_grir CREDIT, ap_foreign CREDIT, input_vat DEBIT for creditable path) and **IMPLC** (landed cost: lc_target_inv/lc_target_asset DEBIT, lc_clearing CREDIT, lc_clearing_dr DEBIT on service bill, ap CREDIT, ewt_payable CREDIT, cash_boc CREDIT). **Structural novelty:** the debit "target" is item-type-driven per line (RPC picks inv vs asset role) — not a single fixed preset role like the domestic GRN.
**BIR:** import VAT base = BOC landed cost (Sec 107A); creditable import VAT reports on a distinct 2550Q "input tax on importation" line + Summary List of Importations (SLI), not SLP; retain Import Entry/IEIRD/SAD + BOC OR. EWT only on local service providers (issue 2307), none on BOC or foreign supplier.

## 4. The inventory-GL gap (pragmatic v1)
Receipts don't move perpetual stock today (`fn_bridge_grn` posts GL only; `inventory` SKU table separate; `inventory_transactions` has no cost). So: **v1 posts landed cost correctly to the GL at the control-account/aggregate level** (books are correct regardless), AND stores Gunhee's per-line allocation in `import_shipment_lines`/`import_landed_costs` ready to feed unit cost. An explicit **"Post Landed Cost"** action writes the WAC-recomputed `unit_cost`/`total_value` back to the matching `inventory` SKU (or routes to PPE). Full GRN→perpetual automation deferred.

## 5. v1 scope vs deferred
**v1 IN:** import_shipments + lines + landed-cost components; foreign supplier + single FX rate; per-line duty/VAT direct + shared-cost allocation; landed unit cost; "Post Landed Cost" → GL (IMP/IMPLC) + WAC/PPE write-back; SO+PO local-only; replace the `importation` placeholder route/page; new clearing + AP-Foreign accounts + presets; foreign-supplier test data.
**Deferred:** auto GRN→perpetual stock move + cost on inventory_transactions; FX revaluation/gain-loss; multi-currency per line; partial shipments/receipts; full customs-broker workflow & duty computation engine; automated FX feed; mixed-use VAT apportionment automation; full asset-register integration for machinery.

## 6. Open items needing build-time care
- Item-type debit resolution (per-line inv vs PPE) — the one structural difference from existing single-role bridges.
- New COA titles must be created before presets.
- Foreign suppliers must exist (`origin != 'Local'`) — none seeded today; add test data.
- `importation` page/route is a placeholder (`ph('importation',…)`); `pageCode: 'importation'` already wired.
