---
name: pentahive-importation-landed-cost
description: RJL ERP Importation (Shipments) module + landed-cost-to-GL; all importing moved here, SO+PO now local-only
metadata:
  type: project
---

Built the **Importation (Shipments) module + landed costing** in RJL ERP (Supabase `zpfkhcnxtiyojodtmepn`) on 2026-06-15. Owner decision: **ALL importing flows through this module** → `sales_orders` AND `purchase_orders` are now **local-only** (import stream UI removed by Suho; `stream` columns kept defaulted 'local', no data migration). Spec: `docs/importation-landed-cost-spec.md`. Pipeline: Jinho (scope) + Gunhee (landed-cost ops) + Beru (GL) → Bellion (plan) → Jinwoo (backend) + Suho (page) + Cha (UX).

**Backend (Jinwoo, migrations `importation_stage_a/b/c_*` + fixes):** new COA titles AP–Foreign Supplier(45), Import GR/IR Clearing(46), Landed Cost Clearing(47), Inventory–Packaging/Supplies(48), Import Input VAT–Creditable(49). New `items.gl_role` (inv_paddy/inv_packaging/inv_fg/ppe_machinery) drives **per-line debit routing** (the structural novelty vs single-role GRN bridge). Tables `import_shipments`/`import_shipment_lines`/`import_landed_costs`; `IMP` doc series; RLS `can_access(...,'importation',...)`. Txns IMP + IMPLC + presets. RPCs (SECURITY DEFINER, gated, `rpc_post_cv`-style FOR UPDATE + idempotency): `rpc_post_import_receipt` (Dr Inventory/PPE per gl_role / Cr Import GR/IR), `rpc_post_landed_cost` (per-component allocation by value/weight/qty, per-line duty+import-VAT direct, centavo residual to largest line; **import VAT 3-path: rice=NO VAT line, VATable-use=creditable upfront to Input VAT, exempt-use=capitalize**; service bills→EWT; foreign bill→AP-Foreign; **WAC write-back** to inventory for goods / PPE for machinery; clearing accounts net to zero), `rpc_void_import` (refuses once costed). Caller computes import VAT base = 12%×(dutiable+duties+charges).

**Frontend:** `src/app/importation/importation.ts` (Suho — register, create draft, status lifecycle draft→…→received→costed, receive, post-landed-cost with allocation results, void; route swapped from placeholder). Cha polished: per-line **cost waterfall** (goods→allocated shared→duty→non-creditable VAT→final unit cost), aggregate reconciliation strip (Σ allocations = components), inventory-vs-PPE role pills, creditable-VAT-outside-cost made explicit, status stepper, read-only Breakdown modal for costed shipments, guards.

**Verified (Jinwoo):** 2-line slice (rice exempt + machinery VATable) — JEs balance, both clearing accounts net to zero, WAC lands (rice unit_cost 1336.67), machinery→PPE. Build clean.

**Outstanding:** (1) NOT yet Tusk-verified live (money-path gate; hero waterfall unreachable until a fresh draft→receive→post-landed-cost run — the 2 demo shipments IMP-2026-0001/0002 are already costed). (2) Help Center not yet updated (Importation now live; SO/PO local-only). (3) Cha's data-layer ask: persist per-line duty_php/import_vat_php/vat_treatment + per-component allocation on the tables so the costed Breakdown can itemize (today only `final_landed_unit_cost` persisted; costed view shows combined "Duty & non-creditable VAT" residual). (4) v1 settlement single-pass (bill arriving after costing can't post); FX single-rate, no revaluation; deferred per spec. (5) Demo data left: IMP-0001/0002, GJ-2026-0017 + landed-cost JEs (demo-1 is pre-clearing-fix), inventory SKUs INV-IMP-RICE(-2), foreign suppliers SUP-FOR-MACH/RICE, items ITM-MILL-MACH/IMP-RICE.

See [[pentahive-gl-posting-engine]], [[pentahive-chart-of-accounts]].
