---
name: pentahive-canvass-award
description: Canvass deterministic (no-AI) award suggestion — lowest-on-favorable-terms (AOQ) + award→PO; turned on the deferred canvass quote-entry
metadata:
  type: project
---

Built the **Canvass award suggestion** (deterministic, NO AI) in RJL ERP (`zpfkhcnxtiyojodtmepn`) on 2026-06-16 — Gunhee spec → Jinwoo backend → Cha UI. Turned on the previously-deferred canvass quote-entry + winner-picking. Spec: `docs/canvass-award-suggestion-spec.md`.

**Rule (per canvass_items line):** responsiveness gate (active supplier + quote + unit_price>0) → VAT-normalize (extract VAT only from `bir_registered` suppliers per canvass `vat_treatment`) → effective price = net_unit or inclusive_unit per **`award_basis`** → rank lowest effective asc → tiebreakers within ε=0.5%: BIR-registered → more payment net-days → lower ewt_rate → lowest supplier code. **EWT is NOT in the effective price** (display/tiebreaker only). Advisory suggestion; buyer overrides with required `winner_reason`.

**award_basis default = 'landed'** (`gl_settings.award_basis`, settable net/landed) — SETTLED: RJL rice-side input VAT non-creditable → true cash cost is VAT-inclusive. 'net' flips the winner (extracts BIR VAT) — verified.

**Backend (Jinwoo):** schema adds `canvass_items.suggested_supplier_id`/`winner_reason`, `gl_settings.award_basis`. `rpc_canvass_suggestions(canvass_id)` (returns per item: quotes with unit_price/net_unit/inclusive_unit/effective/responsive/is_suggested + rationale; persists suggested_supplier_id). `rpc_award_canvass(canvass_id)` (requires all items have winner; groups by winner_supplier_id → one PO per supplier, po_lines.unit_price = ORIGINAL quote price not normalized, copies bir_registered/ewt_rate, ewt_amount per existing PO rule, links canvass_id/pr_id, status pending_approval, stream local; idempotent on purchase_orders.canvass_id; canvass→'awarded'). Both SECURITY DEFINER gated on canvasses view/edit; anon revoked.

**UI (Cha, `src/app/canvasses/canvasses.ts`):** replaced the deferred header-only screen. Register → detail/AOQ grid (rows=items, cols=suppliers that quoted, cells=unit_price + net/landed subtext + BIR/EWT/terms badge; header shows award_basis + vat_treatment); quote entry (read-then-write canvass_quotes — NO unique constraint on (canvass_item_id,supplier_id) so no upsert); "★ Suggested" chip + rationale; override-with-reason modal + soft-confirm on Δline-total when picking costlier; "Accept all suggestions"; Award→PO(s) with View-in-POs link (`/milling/purchase-orders`); awarded read-only summary; print-friendly. Build clean.

**Notes:** "invited suppliers" is UI-only (a supplier is "in" once it has a quote row). award RPC returns PO `{po_id,po_no,supplier_id,total}` (Cha enriches supplier name client-side). NOT yet Tusk-verified live (gate needs a real JWT — MCP SQL role can't pass can_access). Deferred: weighted multi-criteria scoring, per-quote lead-time/delivery ranking, attachments, approval workflow, per-quote mixed-VAT-basis flag.

See [[pentahive-gl-posting-engine]]. NOTE: the **branching/multi-branch build is PARKED** (design+plan in `docs/branching-isolation-design.md`) awaiting owner go-ahead on the live-data mutation.
