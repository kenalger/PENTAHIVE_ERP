# Canvass Award Suggestion — Deterministic (NO AI) — Spec (Gunhee, 2026-06-16)

> Award-to-lowest-on-favorable-terms (Abstract of Quotation). Rule-based + explainable only. Also turns ON the deferred canvass quote-entry + winner-picking UI. Project `zpfkhcnxtiyojodtmepn`.

## Decisions
- **Line-level award:** each `canvass_items` row awarded independently (different items → different suppliers). Suggestion is advisory; the buyer awards (override-with-reason).
- **`award_basis` = `'landed'`** by default (SETTLED via Beru's advisory: RJL rice-side input VAT is non-creditable → capitalized, so true cash cost = VAT-inclusive). Expose as a setting (`gl_settings.award_basis` text default 'landed', or per-canvass) so it can flip to `'net'` if input VAT becomes recoverable.

## The deterministic rule (per canvass_items row)
**Step 0 — responsiveness gate (filter, not rank):** drop a quote if supplier `status<>'active'`, no quote row, or `unit_price` null/≤0. Empty survivors → "no responsive quote".
**Step 1 — VAT normalization** (VAT_RATE=0.12; VAT extracted ONLY from `bir_registered` suppliers):
| header `vat_treatment` | bir_registered | net_unit | inclusive_unit |
|---|---|---|---|
| vat-inclusive | true | unit/1.12 | unit |
| vat-inclusive | false | unit | unit |
| vat-exclusive | true | unit | unit*1.12 |
| vat-exclusive | false | unit | unit |
| vat-exempt | any | unit | unit |
**Step 2 — effective price** = `net_unit` if award_basis='net' else `inclusive_unit` (='landed'). Rank ascending.
**Step 3 — EWT stays OUT of the price** (it reduces cash to supplier, not expense; double-counts otherwise). Display only / tiebreaker.
**Step 4 — tiebreakers** (within ε = 0.5% of lowest effective on the line): (1) lower effective price [primary, decides outside ε]; (2) bir_registered preferred; (3) better payment_terms (parse to net days: COD/blank=0, '30d net'=30, '60d net'=60; more wins); (4) lower ewt_rate; (5) final deterministic key = lowest supplier code (zero randomness).

## Rationale string (deterministic, built from computed values)
e.g. "Suggested: Reyes Farm Supply — lowest effective price ₱108.00 (landed basis, non-VAT). Next: Santos ₱112.00. Terms: COD." / on a net tie: "Santos — ₱100.00 net of 12% VAT, BIR-registered, 30d net; within 0.5% of Cordero, won on BIR + terms."

## Schema adds (minimal, v1)
- `canvass_items.suggested_supplier_id uuid null` (what the system suggested) + `canvass_items.winner_reason text null` (override reason). [`winner_supplier_id` already exists.] Required so accepted-suggestion vs override is distinguishable + reason storable.
- `award_basis` setting (gl_settings column default 'landed', or per-canvass) — must be stored, not implicit.
- v1 ASSUMES all quotes on a canvass follow the header `vat_treatment` basis (document on the entry screen). Add per-quote `vat_inclusive bool` only if real data shows mixed bases. NO lead-time ranking in v1 (would need `canvass_quotes.lead_time_days`) — state explicitly.

## Backend objects to build
- **`rpc_canvass_suggestions(p_canvass_id)`** (SECURITY DEFINER, gated canvasses/view) → per item: the quotes with `unit_price`, `net_unit`, `inclusive_unit`, `effective` (per award_basis), `responsive` (bool), `is_suggested` (bool), and a per-item `rationale` string + `suggested_supplier_id`. Persists `suggested_supplier_id` onto `canvass_items` (or returns for the UI to persist on accept).
- **`rpc_award_canvass(p_canvass_id)`** (gated canvasses/edit/create-PO) → group `canvass_items` by `winner_supplier_id` → create one `purchase_orders` per winning supplier (link `canvass_id`+`pr_id`, copy supplier `bir_registered`/`ewt_rate`, status default pending_approval) + `po_lines` (desc/uom/qty from items; **unit_price = the winning quote's ORIGINAL `unit_price` on the canvass basis — NOT the normalized net**; line_total=qty*unit_price). `ewt_amount`/`total` per the existing accounting rule. Move canvass to `awarded`/`closed`. Idempotent.

## UX (Cha)
AOQ comparison grid: rows=canvass_items, cols=suppliers that quoted, cells=unit_price (+ hover net/landed + VAT/EWT/terms badge). Quote entry per item×supplier (writes canvass_quotes; blank=did not quote). Header shows active award_basis. Per-item **suggested** chip on the winning cell + rationale. Buyer override → set winner_supplier_id + winner_reason (required); soft-confirm if overriding away from a clearly cheaper quote. Award button → rpc_award_canvass → PO(s). Loading/empty(→quote-entry)/error/populated states.

## v1 vs deferred
v1: quote entry + AOQ grid + deterministic suggestion + rationale + override-with-reason + award→PO. Deferred: weighted multi-criteria scoring, per-quote lead-time/delivery ranking, attachments, approval workflow, per-quote mixed-basis flag.
