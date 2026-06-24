# Branch Isolation / RLS / Auth Design (Jinchul, 2026-06-16)

> Build source for Bellion's plan. Project `zpfkhcnxtiyojodtmepn`. Owner decisions FIXED: branch = physical RJL site (below workspace, above warehouse); **RLS-enforced isolation** (users see/transact only assigned branches; admin/HQ sees all); branch on **all transactions + journal_entries** (per-branch financials); **masters stay shared**.

## Pattern to extend (live model)
Per-command RLS keyed on `can_access(auth.uid(),'<page>','<action>')`; `can_access` is STABLE SECURITY DEFINER and **already short-circuits admin** via `has_role(uid,'admin')`. Admin double-tracked (`users.is_admin` col AND `has_role`) — **anchor branch logic to `has_role('admin')`** to match `can_access`. `journal_entries`/`journal_lines` have only a SELECT policy — written ONLY by `fn_post_je` (SECURITY DEFINER) via `fn_bridge_*`; GL branch stamping is server-side, not client WITH CHECK.

## 1. Schema
- **`branches`**: `id uuid pk`, `code text unique`, `name text`, `workspace text null`, `is_hq bool default false` (informational only), `is_active bool default true`, timestamps. "Admin/HQ sees all" is NOT a magic branch row — it rides on `has_role('admin')`.
- **`user_branches`** (isolation root of truth): `user_id→users`, `branch_id→branches`, `is_default bool`, PK `(user_id,branch_id)`, partial unique `(user_id) where is_default`. RLS: user SELECTs own rows; only admin writes.
- **Per-table `branch_id uuid NOT NULL → branches`** on each parent transaction table + `warehouses` + `inventory` + `inventory_transactions` + `journal_entries`. `inventory` gets branch_id DIRECTLY (not via nullable warehouse_id).

## 2. Isolation helpers + exact policy shape
Helpers (STABLE SECURITY DEFINER, search_path=public, EXECUTE to authenticated NOT anon):
- `user_in_branch(p_user_id, p_branch_id) bool` = `has_role(uid,'admin') OR EXISTS(user_branches match)`. **Admin short-circuit MUST be inside this helper** (policies are `can_access(...) AND user_in_branch(...)` — without it admins get locked out).
- `current_user_branches(p_user_id) setof uuid` = admin → all active branch ids; else the user's branch_ids. (For report-RPC IN-filters.)

**Parent transaction tables — replace the can_access-only policy (drop+recreate, no permissive duplicate):**
- SELECT USING `can_access(uid,page,'view') AND user_in_branch(uid, branch_id)`
- DELETE USING `... 'delete' AND user_in_branch(uid, branch_id)`
- INSERT WITH CHECK `... 'create' AND user_in_branch(uid, branch_id)`  ← blocks stamping another branch (active-branch-spoof defense)
- UPDATE USING **and** WITH CHECK both with `... 'edit' AND user_in_branch(uid, branch_id)`  ← WITH CHECK blocks re-stamping into another branch

**Child/line tables (po_lines, pr_lines, so_lines, grn_lines, sales_invoice_lines, supplier_invoice_lines, supplier_payment_allocations, journal_lines, import_*_lines, canvass_*):** derive via parent EXISTS (no denormalized branch col): `... AND EXISTS(select 1 from <parent> p where p.id=<child>.<fk> AND user_in_branch(uid, p.branch_id))`, same action verb, UPDATE in both clauses. Denormalize onto a child only if it profiles badly.

**Stay SHARED (do NOT branch, keep current policies):** customers, suppliers, items, vendos, roles, pages, acc_* (COA), access_definitions/_permissions/user_access, gl_settings, doc_counters. (`warehouses` is the exception — it gets branch_id.)

## 3. Active-branch context vs isolation
**Client-supplied branch_id validated by RLS WITH CHECK. NO session GUC / set_config, NO JWT claim.** The active branch (a picker like the workspace picker) is UX only — chooses which branch_id to stamp + filter; carries ZERO security weight. Isolation = `user_branches` membership in RLS, never the client selection. Spoofed branch_id → INSERT WITH CHECK rejects; cross-branch read → SELECT USING returns nothing.

## 4. Auth/JWT lifecycle
Branches looked up server-side per query → **no switch staleness, no token change, login flow unchanged.** Assignment change takes effect on next query. On login the client fetches its `user_branches` to populate the picker + pick `is_default`.

## 5. GL + the report-RPC leak (CRITICAL)
- `journal_entries.branch_id` stamped by `fn_post_je` (add `p_branch_id` or read from source doc); every `fn_bridge_*` passes the source document's branch_id; `fn_reverse_entry` copies branch from the reversed entry. journal_lines inherit via parent EXISTS.
- **THE LEAK:** report RPCs (`rpc_dcpr`, `rpc_dcp`, `rpc_sales_register`, `rpc_purchase_register`, `rpc_vat_summary`, `rpc_cwt_received`, `rpc_ewt_withheld`, `rpc_open_apvs`, `fn_bir_acct_movement`) are SECURITY DEFINER and read base tables/views with NO branch filter → they BYPASS table RLS. **Every one must: keep its can_access gate + add `AND branch_id IN (select current_user_branches(auth.uid()))` + accept an optional `p_branch_id` (validated via user_in_branch, default = all caller's branches).** The underlying views (v_account_ledger, v_dcpr_lines, v_bir_sales_register, v_dcp_*) must expose `branch_id` so the RPC can filter. Miss this and the books leak through reports even with perfect table RLS.
- **Hygiene (fix alongside):** REVOKE EXECUTE FROM anon on all posting/void/report/bridge RPCs (several are currently granted to anon).

## 6. Migration sequence (per-table, NEVER big-bang)
1. Foundation: create `branches` + `user_branches` (+RLS); seed branch `MAIN` (is_hq); assign ALL existing users to MAIN (is_default); create helpers.
2. Add `branch_id uuid NULL` to each branched table (app keeps running).
3. Backfill all existing rows → MAIN (the seeded full-cycle + import dataset, never orphaned).
4. **Update write paths BEFORE NOT NULL:** fn_post_je + every fn_bridge_* + fn_reverse_entry + fn_inventory_adjust + rpc_post_*/rpc_void_* stamp branch from source doc; report RPCs add branch filter + p_branch_id. (Must land before NOT NULL or posting breaks.)
5. SET NOT NULL per column (after backfill + write paths confirmed).
6. Branch RLS per table (drop can_access-only, create can_access AND user_in_branch); table-by-table; `get_advisors(security)` after each.
7. REVOKE EXECUTE FROM anon on the RPCs.

## 7. Threat model — Tusk's 7 tests (must-pass core = 1,2,6)
1. Cross-branch READ: branch-A user sees no branch-B rows (incl. direct `?branch_id=eq.B` → []).
2. Cross-branch WRITE (active-branch spoof): insert stamped branch-B by branch-A user → rejected by WITH CHECK.
3. Re-stamp via UPDATE: PATCH own row to branch-B → rejected.
4. Report-RPC leak: rpc_dcpr/rpc_sales_register as branch-A user → only branch-A figures; p_branch_id=B rejected/empty.
5. Assignment-change staleness: revoke mid-session → next query denied, no re-login.
6. Admin/HQ no-lockout: admin sees all branches + all report RPCs (proves admin short-circuit).
7. anon surface: unauth RPC calls fail closed; after REVOKE → permission denied.
Seed two users (branch-A-only + admin) and a 2nd branch with ≥1 row before testing.
