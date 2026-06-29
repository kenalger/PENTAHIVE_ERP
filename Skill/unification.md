---
name: unification
description: Plan and execute hosting two separate Angular+Supabase ERPs (WVW/PENTAHIVE and xavi/ActiveOne) on a single Supabase project (`iblrotkczdrztenchnzx`) with ONE shared authentication layer and ONE shared roles TABLE, while each app keeps its OWN role values and its OWN access control (the two apps are functionally different). Use this skill when merging the two projects, deciding what is shared vs `xavi_`-prefixed, sharing the roles table without merging role vocabularies, or repointing either app's Supabase config. Hard constraint: do NOT change the layout, concept, or structure of either app — this is a DB/auth plumbing change only.
---

# Unification — Two ERPs, One Project

**Goal.** Run both apps off the single Supabase project `iblrotkczdrztenchnzx` with:

1. **Same auth** — one Supabase Auth user (`auth.users`); one email/password signs into both apps.
2. **Same roles *table*** — a single `public.roles` table shared by both apps, but with rows **scoped per app**. WVW's roles and xavi's roles live in the same table; each app only sees its own.
3. **Different roles + access per app** — each app has its own role *values* and maps them to its own pages/features through its own access tables. WVW (rice-milling) and xavi (multi-branch POS/accounting) stay functionally distinct.

Everything app-private is isolated by a `xavi_` table-name prefix in the shared `public` schema (WVW already uses `milling_` on its business tables). **No business data is shared.**

> ⛔ **Hard constraint (owner):** do not change the layout, concept, or structure of either app. This is a **plumbing change only** — table prefixing, env repoint, and one shared roles table. No UI / nav / module / workflow / RPC-logic changes. xavi's 168 RPCs are preserved by keeping its `role_t` enum and `caller_*` helper indirection intact.

---

## The model

```
  SHARED (one copy, both apps)        ┌───────────────────────────────────────┐
                                      │ auth.users               (Supabase Auth)│
                                      │ public.roles  (app, name, …)  ← app-scoped
                                      │   rows: ('wvw','admin'),('wvw','manager'),
                                      │         ('wvw','user'),                  │
                                      │         ('xavi','Owner'),('xavi','Manager'),
                                      │         ('xavi','Cashier'), …            │
                                      └───────────────────────────────────────┘
              app='wvw'  ▲                                   ▲  app='xavi'
                         │                                   │
        ┌────────────────┴───────────────┐  ┌───────────────┴────────────────────┐
 WVW    │ public.users     (profile)     │  │ xavi_app_users  (profile+branch)    │ xavi
 access │ public.user_roles (id→role_id) │  │ xavi_user_roles (id→role_t enum)    │ access
 layer  │ public.pages                   │  │ xavi_role_permissions               │ layer
        │ public.access_definitions      │  │   (role × resource_key × 6 caps)    │
        │ public.access_definition_perms │  │ xavi_user_branch_access             │
        │ public.user_access             │  │ helpers: caller_has_role(),         │
        │ view v_user_effective_access   │  │   caller_can_manage_users(),        │
        │ helpers: has_role/can_access/  │  │   caller_in_branch()                │
        │   can_enter_page               │  │ role_t enum kept internally;        │
        │ 3 roles: admin/manager/user    │  │   mirrored into public.roles        │
        │ bundle-based access            │  │ 7 roles; matrix + branch access     │
        └────────────────────────────────┘  └─────────────────────────────────────┘
   milling_* business tables                  xavi_* business tables
```

- **Shared = the login + one roles table** (app-scoped rows). That's the only thing both apps touch.
- **Role *assignments* and *access mappings* stay per-app.** They are NOT merged: WVW keeps `public.user_roles` + bundles; xavi keeps `xavi_user_roles` (enum) + `xavi_role_permissions` + branch scoping.
- xavi's runtime keeps using its `role_t` enum; its 7 roles are **mirrored** as rows into `public.roles` (app='xavi') so the shared table is a complete registry. The enum is the source of truth for xavi's RPCs; the table row is for the shared catalogue/visibility.

---

## xavi role & access reference (from the codebase scan)

**7 roles** — enum `role_t` (`supabase/migrations/20260605000100_extensions_enums.sql:10`), mirrored in `src/app/core/enums/index.ts`:
`Owner`, `Manager`, `Accounting`, `Stockman`, `Dispatcher`, `Cashier`, `Salesman`.

**Two flags separate from role:** `app_users.is_admin` (manage users/roles; **Owner is implicitly admin**), `app_users.all_locations` (see all branches).

**Resource catalogue** — 57 resources across 9 sections, defined client-side in `src/app/shell/services/nav.service.ts` (mirrors the sidebar): Frontline (dashboard, pos, cashier, salesorders, estimates, creditmemos), Procurement (prs, canvasses, purchasing, purchasing-received, apbills, billcredits, ewtcerts), Stock (mrp, fulfillment, inventory, stockcard, branchstock, transferfulfil, transfers, invadjust, invcount), HR/Payroll (employees, timeclock, dtr, schedules, leaves, loans, payroll), Finance (invoices, receivables, banking, writecheck, makedeposit, bankrec, interbranch, birewt, ledger, subledgers), Master Data (items, itemcategories, branches, departments, posterminals, customers, suppliers, users, rolesperms, coa, acctpresets, unittemplates, paymentterms, taxsettings), Analytics (kpi, posprooflist, reports).

**6 capabilities** per role×resource: `view · create · edit · print · approve · delete` (`features/master-data/services/permissions.service.ts:7`).

**Defaults:** Owner/Manager = full access (`FULL_ACCESS_ROLES`); other roles get defaults derived from the role→menu map in `nav.service.ts:167-195`; **multi-role = union**. Explicit overrides live in `role_permissions` (DB); client defaults are the fallback.

**Loading & checks:** roles loaded in `core/auth/auth.service.ts` (primary `app_users.role` ∪ `user_roles`), exposed via `shell/services/session.service.ts → roles()`, checked through `permissions.service.ts → can(roles, resource, cap)`. `view` gates the menu live in `app-shell.component.ts`; the other 5 caps are enforced per-screen. Branch scoping via `caller_in_branch` + `user_branch_access` + `all_locations`, driven by a global scope picker.

**WVW contrast:** 3 roles (`admin`/`manager`/`user`) in a *table* + bundle access (`pages`/`access_definitions`/`user_access`), helpers `has_role`/`can_access`/`can_enter_page`.

---

## Decisions (locked with the owner)

- **D1 — Roles table:** one `public.roles` table, rows **scoped per app** via an `app` column. Not a merged/shared vocabulary; each app sees only its own roles.
- **D2 — xavi enum:** **keep `role_t` internally** (no rewrite of the ~168 RPCs that gate through `caller_*` helpers); **mirror** xavi's 7 roles as rows into `public.roles` (app='xavi'). The enum stays the runtime source of truth for xavi.
- **D3 — Assignments & access stay per-app:** `public.user_roles` (WVW) and `xavi_user_roles` (xavi) are NOT merged. This resolves the current `public.user_roles` name collision by prefixing xavi's copy.
- **D4 — Profiles per-app, provisioning per-app:** WVW keeps `public.users` (created by `on_auth_user_created`); xavi keeps `xavi_app_users` (created via its own `save_user` flow). A login in one app is not auto-created in the other.
- **D5 — `set_updated_at()`:** treat as a single shared utility *function* (identical body in both); define once, don't prefix. (It's a function, not a table — it doesn't "mix" any data.) xavi's enums otherwise don't collide with WVW (which uses text+CHECK) and stay unprefixed.
- **D6 — Shared set is EXACTLY `{ auth.users, roles }`; WVW is left as-is.** Nothing else is shared — no shared `user_roles`, no shared infra. WVW's currently-unprefixed RBAC/infra tables (`users`, `user_roles`, `pages`, `access_definitions`, `access_definition_permissions`, `user_access`, `workspaces`, `doc_counters`, `activity_log`, `alerts`) are **NOT renamed** — they remain WVW-owned by convention and never collide because xavi is fully `xavi_`. The owner explicitly chose not to touch WVW. So the work is entirely on the xavi side (+ the one shared `roles` table getting an `app` column).

---

## Table disposition

**Shared (NOT prefixed — one copy, both apps):**
- `auth.users` (Supabase Auth)
- `public.roles` — gains an `app` column (PK becomes `(app, name)` or keep `id` + unique `(app,name)`); seeded with WVW's 3 rows (app='wvw') and xavi's 7 rows (app='xavi')
- `public.set_updated_at()` — shared utility

**WVW-private (existing, untouched):** `public.users`, `public.user_roles`, `public.pages`, `public.access_definitions`, `public.access_definition_permissions`, `public.user_access`, `v_user_effective_access`, `has_role`/`can_access`/`can_enter_page`, all `milling_*`.

**xavi-private (gets `xavi_` prefix on the way in):** all ~80 xavi tables → `xavi_*` (`app_users`→`xavi_app_users`, `user_roles`→`xavi_user_roles`, `role_permissions`→`xavi_role_permissions`, `user_branch_access`→`xavi_user_branch_access`, `locations`→`xavi_locations`, `employees`→`xavi_employees`, plus inventory/sales/procurement/finance/HR/payroll), their views, sequences, indexes, FKs, RLS targets, RPC bodies, grants, seeds. The `role_t` enum and the `caller_*` helpers stay (just sit beside WVW's objects). xavi's frontend role/access logic is **unchanged**.

---

## Execution stages

**Stage 0 — Identifier inventory.** Authoritative list of xavi identifiers to prefix (tables + views + sequences + any colliding function/trigger names). EXCLUDE the shared names (`roles`, `set_updated_at`, the enum types). Note: xavi's own `user_roles` IS prefixed (→ `xavi_user_roles`); only `public.roles` is shared.

**Stage 1 — Shared roles table migration (new, on the WVW project).** Add `app` column to `public.roles` (default 'wvw' for existing rows), adjust uniqueness, and seed xavi's 7 role rows (app='xavi'). WVW's `user_roles.role_id` FK is preserved. Document that xavi mirrors its enum here.

**Stage 2 — Transform xavi migrations (scripted, token-boundary-aware).** Apply the `xavi_` prefix across all 100+ migration files for inventoried identifiers only (create table, FKs, indexes, RLS, view JOINs, RPC bodies, grants, seeds). Column names like `customer_id` untouched. Drop xavi's own `create table public.roles`? — xavi has no `roles` table (it uses the enum), so nothing to reconcile there; only ensure xavi seeds/mirrors into the shared `public.roles`. Keep `role_t` and `caller_*` helpers as-is (their bodies now reference `xavi_user_roles`/`xavi_app_users`).

**Stage 3 — Apply to `iblrotkczdrztenchnzx` + re-seed.** Run the shared-roles migration, then the prefixed xavi migrations in order, then xavi's demo seed (prefixed). WVW's existing 37 tables untouched. Old project `ufdknyscrmywqfmxjyfx` abandoned afterward.

**Stage 4 — Frontend repoint + call-site prefix.** xavi `environment.ts` + `environment.production.ts` → `supabaseUrl: https://iblrotkczdrztenchnzx.supabase.co`, `supabaseAnonKey: sb_publishable_ZBch-XW4yEiY9QTkDb2Izw_MA9dFmrd`. Prefix the 238 `.from('x')`/`.rpc('y')` call sites across 61 files **only** where `x`/`y` is an inventoried xavi identifier. The role/access UI and logic do not change.

**Stage 5 — Verify (money-critical).** Object-count diff; confirm no shared name was prefixed and `public.roles` holds both apps' rows. One login signs into both; each app shows its own roles + its own access. Smoke-test xavi's financial RPCs (`post_pos_sale` DR=CR balances, `save_sales_order`, `save_purchase_order`, payroll) and confirm `caller_has_role`/`caller_in_branch` still gate correctly. Confirm WVW `can_enter_page`/`can_access` still pass for `admin@gmail.com`.

---

## Open decision to confirm
- **Execution method:** manual staged sequence vs an orchestrated multi-agent workflow (parallel SQL transform + adversarial RPC verification; higher token cost) for the ~80-table / 100+-file / 238-call-site sweep.

## Risks
- A stray prefix replace inside an accounting RPC corrupts money math silently → Stage 2 must be token-boundary-aware; Stage 5 must smoke-test the financial RPCs.
- The shared `public.roles` must be admin-write-only; keep writes behind each app's existing admin-gated path. The `app` column must always be set so neither app sees the other's roles.
- Mirror drift: if xavi adds an enum value later, it must also be inserted into `public.roles` (app='xavi'). Document this in the role-management screen / migration notes.
