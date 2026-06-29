# PENTAHIVE_ERP — Build Hand-off

Date: 2026-06-03 (original) · 2026-06-28 (last updated)
Source skills: `Skill/auth.md` (`ErpPentaHive`), `Skill/RJL-ERP-BUILD-TODO.md` (overall roadmap)
Generated under: `pentahive-app/`

> The full ERP roadmap and what's still open lives in `Skill/RJL-ERP-BUILD-TODO.md`. That file now marks the project-setup, Supabase wiring, and auth phases as **DONE**, and tracks remaining modules (suppliers, customers, items, procurement flow, sales flow, etc.). This hand-off documents the *implementation* — what's on disk, how to run it, what's deployed where.

---

## ⚡ Update — 2026-06-28 — Per-app branding: WVW (platform) vs RJL (milling) vs Xavi logos

Branding was split so each layer shows its own identity. **Where this conflicts with the 2026-06-25/26 "WVW everywhere" notes, this section wins for the items listed.**

### A. WVW logo is now platform-only (landing page)
The blue-cloud **WVW** mark (`pentahive-app/public/wvw-logo.png`) is the *platform* identity and now appears **only** on the landing page — the workspace-picker header (`workspace-picker.ts`) — plus the platform-level login page, browser `<title>`, and favicon (`index.html`). It no longer brands any workspace interior.

### B. Milling workspace rebranded **WVW → RJL**
The milling workspace is its own company brand, **RJL**:
- New asset `pentahive-app/public/rjl-logo.png` (the green/gold "RJL" rice mark, from the owner's `Downloads/milling.png`).
- `shell/shell.ts` sidebar: logo `wvw-logo.png` → `rjl-logo.png`, name "WVW ERP" → "**RJL**", page-title fallback `'WVW ERP'` → `'RJL'`.
- `milling/milling.ts` data labels: "WVW Byproduct" / "Jobs where WVW keeps bran/husk" / "WVW retains" → **RJL** (the toll-milling option value stays `rjl`).

### C. Workspace-picker cards now support per-workspace logos + external links
`workspace-picker.ts` gained a `logos` map + `logoFor(code)` helper. When a workspace code has a logo it renders `<img class="ws-logo">` instead of the emoji `w.icon`. Mapped: `milling → rjl-logo.png`, `hardware → xavi-logo.jpg` (`public/xavi-logo.jpg`, copied from `Downloads/xavi.jpg`). Other cards fall back to the DB emoji.

Also added an `externalLinks` map + `externalFor(code)` helper. A workspace with an external link renders a clickable `<a [href]>` card (styled `active`, "Open →") **regardless of its DB `status`** — so the **hardware** card, even though it's `coming_soon` in the DB, is now a live link to **`https://www.wvwcloud.com/login`** (the separately-deployed xavi/hardware app). The template branch order is: external link → active (in-app `routerLink`) → disabled placeholder.

### D. Xavi app — real logo applied
`C:\Users\Ken\Documents\My Projects\xavi` previously used an AI-generated square `public/xavi-logo.png`. The owner's real **xavi HARDWARE** wordmark (`Downloads/xavi.jpg`) was added as `public/xavi-logo.jpg` and wired in: `shell/.../app-shell.component.ts` (sidebar mark; CSS changed to `height:22px; width:auto` so the landscape wordmark isn't squished), `features/auth/.../login-page.component.html`, and `index.html` favicon (`type="image/jpeg"`). The old `xavi-logo.png` remains on disk but is no longer referenced.

> No ImageMagick on this machine (`convert` is the Windows NTFS tool, not IM), so the JPEG is used as-is rather than transcoded to PNG — references point at `.jpg`.

### E. Verification (2026-06-28) — both apps on the same project, refs aligned
- **Shared Supabase project confirmed.** Both apps point at `https://iblrotkczdrztenchnzx.supabase.co` with key `sb_publishable_ZBch-XW4yEiY9QTkDb2Izw_MA9dFmrd`: milling/WVW in `pentahive-app/src/environments/environment.ts` + `environment.development.ts`; xavi in `xavi/src/environments/environment.ts` + `environment.production.ts`. (Old xavi project `ufdknyscrmywqfmxjyfx` no longer referenced anywhere in xavi `src/`.)
- **Logo references grep-verified, no stale paths.** Milling/WVW: `wvw-logo.png` only on platform surfaces (picker header, login, favicon); `rjl-logo.png` in the milling shell; picker `logos`/`externalLinks` maps as described above. Xavi: `xavi-logo.jpg` in sidebar/login/favicon with zero remaining `xavi-logo.png` references.
- **Assets on disk:** `pentahive-app/public/` = `wvw-logo.png`, `rjl-logo.png`, `xavi-logo.jpg`; `xavi/public/` = `xavi-logo.jpg` (old `xavi-logo.png` left unreferenced).
- **Open choices (not blockers):** hardware external link opens same-tab (no `target="_blank"`); xavi favicon served as JPEG (browsers sniff, renders fine).

---

## ⚡ Update — 2026-06-26 — Two apps, one project (`xavi` co-tenant) + key fix

### A. Publishable key fixed (login was broken)
The anon/publishable key in both `environment.ts` / `environment.development.ts` was wrong for project `iblrotkczdrztenchnzx` → every login failed with **"Invalid API key"** (GoTrue rejected the key at the gate, before checking credentials). Replaced with the project's real publishable key `sb_publishable_ZBch-XW4yEiY9QTkDb2Izw_MA9dFmrd` (verified against `/auth/v1/settings`). Outstanding item #1 below is now **DONE**. Also applied the new **WVW** app logo (`public/wvw-logo.png`) to the sidebar, login, workspace-picker, and favicon.

### B. Decision: the `xavi` ERP becomes a co-tenant of this same project
`C:\Users\Ken\Documents\My Projects\xavi` (the **ActiveOne** multi-branch POS/accounting ERP — Angular, ~80 tables, ~168 RPCs, 100+ migrations, 238 `.from()/.rpc()` call sites) currently targets its **own** Supabase project `ufdknyscrmywqfmxjyfx` (legacy `eyJ…` anon key). It is being moved onto **this** project (`iblrotkczdrztenchnzx`) so both apps share one Supabase project.

**Locked decisions (from the owner):**
1. **One project, `public` schema, full isolation by `xavi_` name-prefix.** Every xavi table (and any colliding function/trigger/sequence/view) is renamed with a `xavi_` prefix so it sits beside WVW's `milling_*` + shared infra tables without clobbering. (A dedicated `xavi` *schema* would have been far less invasive — ~1 frontend line, near-zero RPC rewrites — but the owner chose the literal name-prefix.)
2. **No shared business data.** "Shared" means one DB / one bill only. Each app owns its own data; nothing is queried by both.
3. **Shared auth + shared roles *table*; per-app role values & access.** *(Refined 2026-06-26 — see `Skill/unification.md` for the full design, which supersedes this bullet.)* One Supabase Auth user signs into both. **One shared `public.roles` table** holds both apps' roles, **scoped by an `app` column** (WVW: admin/manager/user; xavi: the 7 `role_t` values) — same table, different rows, each app sees only its own. **Role assignments and access control stay per-app and are NOT merged:** WVW keeps `public.user_roles` + bundles; xavi keeps `xavi_user_roles` (enum-based) + `xavi_role_permissions` + branch scoping. xavi keeps its `role_t` enum internally (no RPC rewrite) and just **mirrors** its 7 roles into `public.roles`. Hard constraint: no layout/concept/structure changes to either app — plumbing only.
4. **Fresh re-apply + re-seed.** xavi's current project holds dev/demo data only → re-apply its 100+ migrations onto this project with the prefix baked in, re-seed, repoint xavi's env to this project + the publishable key above. **Old project `ufdknyscrmywqfmxjyfx` is abandoned** afterward.

**Collision surface the prefix must cover (WVW `public` ↔ xavi `public`):**
- **Tables** — all ~80 xavi tables → `xavi_*` (FKs, indexes, RLS targets, view JOINs, RPC bodies, grants, seeds all follow).
- **Functions** — only generically-named ones clash. `public.set_updated_at()` is defined by **both** (bodies identical; `create or replace` means last-writer-wins — harmless, but cleanest to give xavi `xavi_set_updated_at`). xavi's business RPCs (`save_sales_order`, `post_pos_sale`, …) and `caller_has_role(role_t)` are uniquely named — no clash with WVW's `has_role`/`can_access`/`can_enter_page`/`admin_create_user`/`next_doc_no`/`log_activity`.
- **`auth.users` triggers** — WVW owns `on_auth_user_created → handle_new_auth_user()` (creates `public.users`). xavi's `core_identity` has **no** auth trigger (its `app_users` rows are created via its own flow), so no trigger-name clash; any xavi auth trigger added later must use a non-`on_auth_user_created` name.
- **Enums** — xavi defines ~14 enum types in `public` (`role_t`, `account_type_t`, `priority_t`, `gender_t`, …). WVW uses `text + CHECK` and defines **no** enums, so there is **no** current collision; prefixing enums is optional (open decision below).

### ⛔ Open decisions before execution (low-risk, owner to confirm)
1. **Enums + shared `set_updated_at`:** prefix them too (`xavi_role_t`, `xavi_set_updated_at`) for strict consistency, or leave unprefixed since they don't currently collide? (Leaving them is less churn; prefixing is future-proof.)
2. **Execution method:** this is ~80 table renames across 100+ SQL files + 238 frontend call sites. Recommend a **scripted, token-boundary-aware transform** over a fixed list of xavi identifiers (not freehand edits) + a verification pass (apply to the DB, diff object counts, smoke-test the financial RPCs), because a stray replace inside an accounting RPC corrupts money math silently.

### Progress (2026-06-26) — full plan in `Skill/unification.md`
- **Stage 0 (inventory):** DONE — `xavi/docs/xavi-prefix-inventory.md` (87 tables + 9 views to prefix; excludes roles/auth.users/set_updated_at/enums/functions).
- **Stage 1 (shared roles):** DONE & applied — `public.roles` gained an `app` column; WVW rows tagged `wvw`, xavi's 7 roles seeded as `xavi`; WVW admin query guarded with `.eq('app','wvw')`. Migration `pentahive-app/supabase/migrations/20260626000001_shared_roles_app_scope.sql`.
- **Stage 2 (transform):** DONE — scripted token-aware rename in the **xavi repo** (`xavi/scripts/prefix-xavi.mjs` + `verify-xavi.mjs` + `fix-next-doc-no.mjs` + `fix-constraints.mjs`): 1,998 SQL refs / 107 files, 186 frontend `.from()` / 49 files. Functions NOT prefixed (so `.rpc()` unchanged) EXCEPT `next_doc_no`→`xavi_next_doc_no` (collided with WVW's overload). Fixed `rls.sql` dynamic `unnest(array[...])` table lists and 4 auto-named check constraints.
- **Stage 3 (apply):** DONE — all 108 xavi migrations applied to `iblrotkczdrztenchnzx` in ONE transaction (`pentahive-app/scripts/apply-xavi.mjs`). Verified: 86 `xavi_` tables + 9 views live; WVW's 25 `milling_` tables + users + shared roles intact.
- **Stage 4 (frontend repoint):** MOSTLY DONE.
  - ✅ xavi `environment.ts` + `environment.production.ts` repointed to `https://iblrotkczdrztenchnzx.supabase.co` + publishable key `sb_publishable_ZBch-XW4yEiY9QTkDb2Izw_MA9dFmrd` (was `ufdknyscrmywqfmxjyfx` + legacy `eyJ` JWT).
  - ✅ `xavi/src/app/core/supabase/database.types.ts` regenerated by **DB introspection** (`pentahive-app/scripts/gen-types.mjs` over DATABASE_URL — the supabase CLI's `gen types --db-url` needs Docker, and `--linked`/`--project-id` needs a Supabase access token; xavi also had no `node_modules`, so `npm install` was run). Output: 123 tables (incl. WVW's), 14 views, 100 functions, 15 enums. Functions are typed permissively (`Args: Record<string,unknown>`, `Returns: unknown`) so all `.rpc()` compile; tables/views/enums are accurate. **Regenerate properly with `npm run db:types` once Docker or a Supabase access token is available.**
  - ✅ Fixed 5 TS type-index refs the `.from()` transform missed (`Database['public']['Tables']['<old>']` → `['xavi_<old>']`) via `xavi/scripts/fix-type-index.mjs`.
  - ⏳ `npm run build` (xavi) running to verify compilation — **confirm result before declaring Stage 4 done.**
  - TODO after build passes: retire old project `ufdknyscrmywqfmxjyfx`.

### Admin login on the shared project (2026-06-26)
`admin@gmail.com` already existed on `iblrotkczdrztenchnzx` (from the re-applied `20260525000002_seed_admin_user.sql`, originally password `123456`). Password was **updated to `12345678`** via direct SQL (`extensions.crypt(...,gen_salt('bf'))`), `email_confirmed_at` set, `must_change_password=false`, `is_admin=true`, and the `admin` role (app=`wvw`) assignment ensured. Verified end-to-end: a direct `POST /auth/v1/token?grant_type=password` returns a valid session. (If the app shows "Invalid login credentials", it's a typed-password mismatch — the value is 8 chars: `12345678`.)

---

## ⚡ Update — 2026-06-25

Three significant changes since the original hand-off. **Where this section conflicts with details below, this section wins** (older sections describe the original Supabase project and pre-rename table names).

### 1. Rebrand → **"WVW ERP"**
The UI brand name is now **WVW ERP**. History: `PentaHive` → `JKL` (a mistaken interim name) → `RJL` → **`WVW`**. Updated across all display titles/labels: `index.html` `<title>`, `shell.ts` (sidebar mark/name + page-title fallback), `login.ts`, `workspace-picker.ts`, `hardware.ts`, `shared/app-shell.ts`, `styles.css` header. The npm/package name is still `pentahive-app`, and the repo dir is still `PENTAHIVE_ERP`.

### 2. New Supabase project → `iblrotkczdrztenchnzx`
The old project (`zpfkhcnxtiyojodtmepn`) was abandoned (DNS no longer resolves). The app now targets a **new project**:

| | Value |
|---|---|
| Project ref | `iblrotkczdrztenchnzx` |
| URL | `https://iblrotkczdrztenchnzx.supabase.co` |
| Pooler host | `aws-1-ap-southeast-1.pooler.supabase.com` (Singapore) |
| Pooler port | `5432` (session pooler) |
| Pooler user | `postgres.iblrotkczdrztenchnzx` |

`supabaseUrl` was updated in both `environment.ts` and `environment.development.ts`, and `pentahive-app/.env`'s `DATABASE_URL` points at the new pooler. **All 16 migrations were applied** to the new DB → **37 tables + 5 views** live. Apply helper: `node --env-file=.env scripts/apply-with-retry.mjs` (retries the pooler connection, which lags ~1–2 min after a DB-password reset; pass a start-filename to apply only from that migration onward).

### 3. Milling-domain tables prefixed with `milling_`
The 24 milling-workspace business tables were renamed with a `milling_` prefix (e.g. `sales_orders` → `milling_sales_orders`, `customers` → `milling_customers`, `inventory` → `milling_inventory`, `purchase_orders` → `milling_purchase_orders`). Updated everywhere: migration DDL (FKs, indexes, RLS targets, view JOINs, the audit-trigger table list) **and** the Angular code (50 `.from()` calls + 6 embedded-join `.select()` refs).

- **Unchanged (no prefix):** the already-milling-named `milling_batches` and `toll_milling`; and the shared RBAC/infra tables `users`, `roles`, `user_roles`, `pages`, `access_definitions`, `access_definition_permissions`, `user_access`, `workspaces`, `doc_counters`, `activity_log`, `alerts`.
- **Page codes are NOT table names** — the quoted page codes (`'suppliers'`, `'inventory'`, …) in `pages`/access-bundle seeds were deliberately left untouched; route guards still reference them via `data: { pageCode }`.

### ⛔ Outstanding before the app runs against the new project
1. **Anon/publishable key** — `environment.ts` / `environment.development.ts` still hold the *old* project's key. Paste the new project's `sb_publishable_…` (Dashboard → Settings → API) into both.
2. **Admin auth user** — the `seed_admin_user` migration only seeded the `public.users` profile row. On this fresh project the **Supabase Auth** user `admin@gmail.com` does not exist yet — create it (Dashboard → Authentication → Users → Add user, Auto-Confirm) or via the in-app admin flow. All `admin@gmail.com` / `123456` references below are historical (from the old project).

---

## End-to-end verification checklist

A repeatable walkthrough of everything that's been built. Each step is concrete (specific clicks → specific expected result). Steps are ordered so later ones consume data created by earlier ones — work top-to-bottom and tick each box as it passes.

> **Prereqs:** dev server running (`ng serve` from `pentahive-app/`), real Supabase URL + anon key in `environment.ts`, signed-in admin (`admin@gmail.com` / `123456`).

### 1. Auth, workspace picker, shell, theme

- [ ] Visit `/` → redirected to `/login` if signed out, or to the **WorkspacePicker** at `/` if signed in
- [ ] Sign in with `admin@gmail.com` / `123456` → lands on `/` (WorkspacePicker)
- [ ] Picker shows two cards: **Milling** (active) and **Hardware** (coming soon, disabled card)
- [ ] Admin also sees an "Admin Console" tile/link below the cards
- [ ] Click **Milling** → URL becomes `/milling/dashboard`, shell renders with Milling sidebar
- [ ] Sidebar logo shows the Milling icon + name; sidebar footer has "⇆ Switch workspace" link
- [ ] User menu (avatar in topbar) shows: Settings, Admin Console (admin-only), Switch workspace, Logout
- [ ] Sidebar shows 8 groups (Overview, Operations, Sales, Procurement, Importation, Accounting, Treasury, HR & Reports) — **no Admin group** in the sidebar (it moved to the user menu)
- [ ] Topbar breadcrumb format: `Milling · <Group>` (e.g. "Milling · Sales")
- [ ] Click "⇆ Switch workspace" in the sidebar footer OR in the user menu → returns to `/` picker
- [ ] Theme toggle in topbar flips light ↔ dark; preference persists across reloads
- [ ] User menu → **Logout** → bounces to `/login`

### 1a. Workspace access enforcement

- [ ] Sign out → sign in as a non-admin without any milling-page bundle → Picker shows **no workspaces** + "ask an administrator" message
- [ ] As that non-admin, navigate directly to `/milling/dashboard` → `workspaceGuard` redirects back to `/`
- [ ] Sign back in as admin → use Admin Console → assign that user a bundle with at least one milling page → sign in as that user again → Milling card now visible in picker, `/milling/*` accessible

### 2. Master data (Sidebar → Procurement / Sales groups)

- [ ] **Suppliers** → ＋ Add Supplier → BIR-registered local paddy supplier → row appears, KPI "Total" + "BIR" both increment
- [ ] Add a **non-BIR** supplier → bottom EWT-compliance banner appears, "EWT Flagged" KPI = 1
- [ ] Add a **foreign** supplier (origin = `Thailand`) → "Foreign" KPI increments
- [ ] **Customers** → ＋ New Customer → normal active customer → KPI "Total Customers" = 1, "Credit Hold" = 0
- [ ] Add a customer with `status = credit_hold` → "Credit Hold" KPI = 1, row shows the 🔒 badge
- [ ] **Items** → ＋ New Item → milled rice, MT, with a last price → "Rice" KPI = 1
- [ ] **Warehouses** → ＋ New Warehouse → e.g. `WH-A` / capacity 1000 MT → "Total Capacity" = 1,000 MT

### 3. Procurement chain (PR → PO → GRN)

- [ ] **Purchase Requests** → ＋ New PR → add 2 line items → click **Submit for canvass** → row appears with status pill "For Canvass"
- [ ] **Canvasses** → ＋ New Canvass → the PR appears in the dropdown → save → row shows status "Open"
- [ ] **Purchase Orders** → ＋ New PO → pick the non-BIR supplier from step 2 → add lines → save
  - Stream auto-set based on supplier origin
  - EWT amount computed in modal subtotal
  - EWT compliance banner appears at bottom listing this PO
- [ ] On that PO row click **Approve** → status pill flips "Pending Approval" → "Approved"
- [ ] **Goods Receipts** → ＋ New GRN → pick the approved PO → received qty defaults to PO qty, change one to be less than ordered
  - **Variance** column updates live in the modal
  - Click **Post GRN** → PO status flips to "Received" on the PO page

### 4. Sales chain (SO → Delivery)

- [ ] **Sales Orders** → ＋ New SO → pick the normal customer from step 2 → add lines → **Confirm SO** → row appears, "Revenue MTD" KPI updates
- [ ] Open a new SO modal and pick the **credit-hold** customer → red banner appears, **Confirm** button is disabled, **Save Draft** still works
- [ ] Stream filter pills (All / 🌾 Local / 🚢 Import) swap the visible rows
- [ ] **Deliveries** → ＋ New DO → pick the confirmed SO → save → row appears with status "Scheduled"
- [ ] Click **Dispatch** → status "In Transit", tracker view stepper advances
- [ ] Click **Mark Delivered** → status "Delivered"

### 5. Inventory & operations

- [ ] **Inventory** → ＋ New SKU → assign to `WH-A` → on_hand 100 MT, unit cost ₱40,000 → row appears in 🌾 Local Stock, total_value = ₱4,000,000
- [ ] Warehouse utilization bar shows the new stock (100/1000 = 10%)
- [ ] Stream filter pills work (All / Local / Import)
- [ ] Click **Adjust** → choose Dispatch, qty 30 → on_hand drops to 70, status pill recomputes
- [ ] Adjust again → Receipt 50 → on_hand 120
- [ ] **Weighbridge** → ＋ New Ticket → two-way, gross 12,000 kg, tare 5,000 kg → modal shows net 7,000 → save → KPI "Tickets Today" = 1
- [ ] **Milling → Internal Batches** → ＋ New Batch → sacks 200, kg/sack 50, rice out 7 MT → modal shows recovery ~70% → save → Start → Mark Completed
- [ ] **Milling → Toll Milling** → ＋ New Toll Job → customer name, sacks 100, price/sack ₱50 → modal shows total ₱5,000 → save
- [ ] **Quality Inspection** → ＋ New Inspection → pick a GRN, moisture 15.5%, impurity 1.2% → row turns red on moisture + impurity (limits 14% / 1%)
- [ ] Add another with moisture 13% → row stays green; pass-rate KPI updates accordingly

### 6. Side modules (Vendos)

- [ ] **Vendos → Machines tab** → ＋ New Vendo → e.g. `VND-001 / Office water` → row appears, KPI "Total Machines" = 1
- [ ] Switch to **Cash Movements tab** → empty state shows
- [ ] ＋ New Entry → income, ₱500, category "Coin drop" → row appears
- [ ] ＋ New Entry → expense, ₱200, category "Refill" → row appears
- [ ] KPIs: Income MTD = ₱500, Expenses MTD = ₱200, Net MTD = ₱300
- [ ] Filter dropdown → pick that machine → KPIs unchanged (filtered = total here)
- [ ] Switch back to **Machines tab** → that vendo's per-row columns now show +₱500 / -₱200 / +₱300

### 7. Computed views (verify via DB)

From `pentahive-app/`:

```bash
node --env-file=.env --input-type=module -e "import sql from './db.js'; \
  console.log('v_customer_ar:',  await sql\`select * from public.v_customer_ar order by ar_balance desc limit 5\`); \
  console.log('v_customer_ytd:', await sql\`select * from public.v_customer_ytd where ytd_sales > 0 limit 5\`); \
  console.log('v_inventory_value_by_stream:', await sql\`select * from public.v_inventory_value_by_stream\`); \
  console.log('v_revenue_daily_by_stream:',   await sql\`select * from public.v_revenue_daily_by_stream limit 10\`); \
  await sql.end({timeout:5});"
```

- [ ] `v_customer_ar` returns one row per customer; `ar_balance` is 0 for any without invoices (expected — invoice UI not built yet)
- [ ] `v_customer_ytd` shows your SO totals for the customer used in step 4 (`ytd_sales` > 0, `ytd_order_count` ≥ 1)
- [ ] `v_inventory_value_by_stream` shows `local` row with `total_value` ≈ ₱4.8M (120 MT × ₱40k)
- [ ] `v_revenue_daily_by_stream` shows today's date with your SO total

### 8. Audit trail (activity_log)

The trigger captured all of the above as it happened. From `pentahive-app/`:

```bash
node --env-file=.env --input-type=module -e "import sql from './db.js'; \
  const c = await sql\`select count(*)::int as n from public.activity_log\`; \
  console.log('total entries:', c[0].n); \
  const recent = await sql\`select entity, action, ts from public.activity_log order by ts desc limit 10\`; \
  console.log('recent:', recent); \
  await sql.end({timeout:5});"
```

- [ ] `total entries > 0` — should be at least ~25-40 by this point
- [ ] Recent list shows your last operations: `goods_receipts insert`, `inventory update`, `vendo_entries insert`, etc.
- [ ] Each row has a user_id matching `admin@gmail.com`'s UUID

### 9. Access-control enforcement (smoke test)

To prove RLS is actually enforced (not just configured):

```bash
node --env-file=.env --input-type=module -e "import sql from './db.js'; \
  const uid = (await sql\`select id from auth.users where email='admin@gmail.com'\`)[0].id; \
  console.log('admin can view suppliers:', (await sql\`select public.can_access(\${uid}, 'suppliers', 'view') as ok\`)[0].ok); \
  console.log('admin can approve POs:',    (await sql\`select public.can_access(\${uid}, 'purchase-orders', 'approve') as ok\`)[0].ok); \
  console.log('admin can enter admin-users page:', (await sql\`select public.can_enter_page(\${uid}, 'admin-users') as ok\`)[0].ok); \
  console.log('admin can enter nonexistent page:', (await sql\`select public.can_enter_page(\${uid}, 'no-such-page') as ok\`)[0].ok); \
  await sql.end({timeout:5});"
```

- [ ] Admin returns `true` on every access call (role bypass works)
- [ ] Nonexistent page returns `false` (defensive)

### 10. Admin page (`/admin/users`, `/admin/roles`, `/admin/access`)

Sidebar Admin group → three links to the same tabbed page.

- [ ] Sign in as `admin@gmail.com` → Admin group visible in sidebar with 3 items
- [ ] Sign out → sign in as a non-admin user (create one first with the Create User form, then assign them only `user` role) → Admin group **hidden** from sidebar
- [ ] As that non-admin, try navigating directly to `/admin/users` → redirected back to `/dashboard` by `pageAccessGuard`
- [ ] Sign back in as admin → /admin/users → 3 KPIs at top, Create User form, full users table
- [ ] **Users tab:** click **＋ Create User** in the User list card header → modal opens with email field → enter `test@example.com` → click **Create user** → success panel inside the modal shows the email + 14-char temp password (copy it once); click **Done** to dismiss → table refreshes with new row showing "no role" + 0 bundles
- [ ] **Roles tab:** click × on a non-admin user's role chip → it disappears; click dropdown + Assign → role added back. KPI cards on Users tab update.
- [ ] Roles tab → try to × your own admin role → blocked with a warning banner (last-admin protection)
- [ ] **Access tab:** Catalog shows `all_access` bundle; click Show permissions → 28-row matrix expands; Hide collapses it
- [ ] Access tab → assign a bundle to the test user → chip appears; click × → chip disappears
- [ ] Open DevTools → Network → confirm writes hit `user_roles` / `user_access` tables directly (not the Edge Function)
- [ ] **DB-side enforcement check:** in Supabase SQL editor as a non-admin, run `select * from public.users` → only your own row visible (RLS still blocks)

### 11. Settings page (`/settings`)

Click the user icon in the topbar → Settings.

- [ ] Left-nav shows 4 sections: Profile · Security · Appearance · Notifications
- [ ] **Profile** → email is read-only; change Display Name and click Save → green confirmation toast; refresh page → name persists
- [ ] Profile → "My Access" sub-card lists `all_access` (or whatever bundle the admin has assigned to you); admin sees "Full access (role bypass)"
- [ ] **Security** → enter a new password + confirm → submit button disables until both green ticks → click Update → success message; sign out and back in with the new password
- [ ] **Appearance** → click Light/Dark → flips theme immediately and matches the topbar toggle state; reload preserves the choice
- [ ] Appearance → toggle Table density → `<html>` element gets `data-density="compact"` attribute (verify in DevTools)
- [ ] Appearance → change Currency → success toast appears; `localStorage.getItem('pentahive-currency')` returns the picked code
- [ ] **Notifications** → flip any switch → success toast → reload → switch state persists (stored in Supabase `user_metadata`)

### 12. Build & deploy gate

- [ ] `ng build --configuration=development` — passes clean (no TS errors)
- [ ] Each module loads as its own lazy chunk (~30–70 kB each)
- [ ] Page reloads with a session active land back inside the shell (no flash of unauthenticated UI)

If every box ticks across all 12 sections, the system is functioning end-to-end across every module that's been built.

## What was implemented

A fresh Angular 21 app with Supabase admin-managed authentication, following all ten phases of `Skill/auth.md`. The build (`ng build --configuration=development`) currently compiles with no errors.

### Phase-by-phase

| # | Phase | Status | Result |
|---|---|---|---|
| 1 | Scaffold Angular app | Done | `pentahive-app/` — Angular 21.2 (standalone-by-default, routing, css, no SSR, npm) |
| 2 | Install dependencies | Done | `@supabase/supabase-js` added to `pentahive-app/package.json` |
| 3 | Environment config | Done | `src/environments/environment.ts` + `environment.development.ts` with placeholders for `supabaseUrl` / `supabaseAnonKey` and `adminEmails: ['kadimaymay.mhi@gmail.com']` |
| 4 | Supabase client wrapper | Done | `src/app/supabase.client.ts` (persistSession, autoRefreshToken, detectSessionInUrl: false) |
| 5 | AuthService | Done | `src/app/auth.service.ts` — signals: `session`, `user`, `isLoggedIn`, `isAdmin`, `mustChangePassword`; methods: `signIn`, `signOut`, `changePassword` |
| 6 | Route guards | Done | `auth.guard.ts`, `admin.guard.ts`, `change-password.guard.ts` — all call `getSession()` to avoid the constructor-hydration race |
| 7 | UI components | Done | `login/`, `home/`, `change-password/`, `admin/users/` — inline templates, FormsModule, signals |
| 8 | Routes | Done | `app.routes.ts` wired with guards; no `/signup`; wildcard → `/login`. `app.html` reduced to a `<router-outlet/>` |
| 9 | Edge Function source | Done (not deployed) | `supabase/functions/create-user/index.ts` — JWT verify → admin allowlist check → `admin.auth.admin.createUser` with `must_change_password: true` |
| 10 | Build verification + hand-off | Done | `ng build --configuration=development` passes; this file |

### Naming note (Angular 21 vs the skill text)

Angular 21's `ng generate` no longer emits the `.component` / `.service` filename suffix or the `Component` / `Service` class suffix. The skill's code blocks reference e.g. `LoginComponent` in `login.component.ts`. The actual files generated and edited are:

| Skill spec | Actual (Angular 21) |
|---|---|
| `login/login.component.ts` → `LoginComponent` | `login/login.ts` → `Login` |
| `home/home.component.ts` → `HomeComponent` | `home/home.ts` → `Home` |
| `change-password/change-password.component.ts` → `ChangePasswordComponent` | `change-password/change-password.ts` → `ChangePassword` |
| `admin/users/users.component.ts` → `UsersComponent` | `admin/users/users.ts` → `Users` |
| `auth.service.ts` → `AuthService` | kept as `auth.service.ts` → `AuthService` (hand-written, not generated) |
| Guards | kept as `*.guard.ts` (hand-written, not generated) |

Behavior matches the skill exactly. Only the symbols differ.

## What you still need to do

These items in the skill require credentials, dashboard access, or interactive CLI flows that I couldn't run from here. **Do these in order:**

### 1. Fill in Supabase credentials

Open `pentahive-app/src/environments/environment.ts` and `environment.development.ts`. Replace:

- `supabaseUrl: 'https://YOUR-PROJECT.supabase.co'` → your project URL
- `supabaseAnonKey: 'YOUR-ANON-PUBLIC-KEY'` → the **anon / public** key (not service_role)
- `adminEmails: [...]` is currently `['kadimaymay.mhi@gmail.com']`. Add/replace as needed.

Both files have identical placeholders. Keep them in sync.

Find the values in Supabase Dashboard → Project Settings → API.

### 2. Disable public signup in the Supabase dashboard

Authentication → Providers → Email → uncheck **Enable email signup**. This is the belt-and-suspenders that closes the direct-API bypass.

While you're there, also uncheck **Confirm email** on the same screen. The code already passes `email_confirm: true` to `admin.createUser()` (in `supabase/functions/create-user/index.ts`) and the seed sets `email_confirmed_at = now()`, so there is no email-verification step in this flow regardless of the dashboard setting. Turning it off in the UI just makes the dashboard reflect what the code is doing — there's never a confirmation email or "click the link" prompt for admin-created employees.

### 3. Create the first admin user (chicken-and-egg) — DONE

Already seeded via migration `20260525000002_seed_admin_user.sql`: `admin@gmail.com` / `123456`. The allowlists in Angular + the Edge Function were updated to recognise it. See "Seed admin user" below for details and a security caveat about the placeholder password.

### 4. Deploy the Edge Function

From `pentahive-app/`:

```bash
supabase login                              # opens browser
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy create-user
```

Project ref is the `xxxxx` in `https://xxxxx.supabase.co`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase into Edge Functions — no manual env config needed.

### 5. Keep the admin allowlist in sync

The allowlist exists in **two places**:

- `pentahive-app/src/environments/environment.ts` + `environment.development.ts` — UI gating (`adminEmails`)
- `pentahive-app/supabase/functions/create-user/index.ts` — server-side authorization (`ADMIN_EMAILS`)

If you change one, change the other. The function's list is the real security boundary; the Angular list is just for hiding nav/redirecting non-admins. See the skill's "If the user asks for more" section for the database-backed alternative.

### 6. Run and test

```bash
cd pentahive-app
ng serve
```

Walk through the manual checklist in `Skill/auth.md` § Phase 10:

1. Visit `http://localhost:4200` → redirects to `/login`.
2. `/home` and `/admin/users` direct URLs bounce to `/login` when signed out.
3. Sign in as admin → land on `/home` with "Manage users" link visible.
4. Sign in as a non-admin (create one via dashboard) → `/home` works, `/admin/users` redirects to `/home`.
5. As admin, create a user at `/admin/users` → temp password shown once.
6. Sign in as the new user → forced to `/change-password`, can't escape.
7. Submit new password → `/home`. Sign out, sign back in → straight to `/home`, no prompt.

## File map

```
PENTAHIVE_ERP/
├── HANDOFF.md                                       <- this file
├── README.md
├── .mcp.json                                        <- Supabase MCP server (project scope)
├── Skill/auth.md                                    <- source skill
└── pentahive-app/                                   <- new Angular app
    ├── angular.json
    ├── package.json                                 <- + @supabase/supabase-js, + postgres
    ├── db.js                                        <- Node-only direct-pg client
    ├── .env                                         <- DATABASE_URL (gitignored)
    ├── .env.example                                 <- sanitized template
    ├── src/
    │   ├── environments/
    │   │   ├── environment.ts                       <- TODO: fill creds
    │   │   └── environment.development.ts           <- TODO: fill creds
    │   └── app/
    │       ├── app.html                             <- <router-outlet/>
    │       ├── app.routes.ts                        <- routes + guards
    │       ├── supabase.client.ts                   <- shared client
    │       ├── auth.service.ts                      <- signals-based
    │       ├── auth.guard.ts                        <- must be signed in
    │       ├── admin.guard.ts                       <- must be admin
    │       ├── change-password.guard.ts             <- only when flagged
    │       ├── shell/shell.ts                       <- layout: sidebar + topbar + outlet
    │       ├── placeholder/placeholder.ts            <- "Coming soon" for unbuilt modules
    │       ├── theme.service.ts                     <- signal-backed dark/light toggle
    │       ├── login/login.ts                       <- routes to /dashboard (inside shell)
    │       ├── home/home.ts                          <- unused, kept on disk
    │       ├── dashboard/dashboard.ts                <- now renders inside shell; KPI grid + access card
    │       ├── change-password/change-password.ts
    │       ├── page-access.guard.ts                  <- uses can_enter_page RPC
    │       └── admin/users/users.ts
    ├── scripts/
    │   ├── apply-migration.mjs                      <- runs a .sql file via db.js
    │   └── describe-users.mjs                       <- introspects public.users
    └── supabase/
        ├── config.toml
        ├── migrations/
        │   ├── 20260525000001_init_users.sql           <- applied; public.users + triggers + RLS
        │   ├── 20260525000002_seed_admin_user.sql      <- applied; admin@gmail.com seeded
        │   ├── 20260525000003_init_roles.sql           <- applied; roles + user_roles + has_role()
        │   ├── 20260526000001_init_access_control.sql        <- applied; pages + can_access/can_enter_page (initial — see below for shape change)
        │   ├── 20260526000002_refactor_to_access_definitions.sql  <- applied; dropped access_grants, added access_definitions / *_permissions / user_access + view
        │   └── 20260526000003_grant_all_access_to_admin.sql       <- applied; 'all_access' bundle + assignment to admin@gmail.com
        └── functions/
            ├── create-user/
            │   ├── deno.json
            │   └── index.ts                          <- not yet deployed
            └── manage-access/
                ├── deno.json
                └── index.ts                          <- not yet deployed (admin-only, has_role-gated)
```

## Architecture recap (why the design is what it is)

1. **Why the Edge Function exists.** User creation needs the `service_role` key, which bypasses Row-Level Security. That key cannot ship in the browser, so the Edge Function holds it server-side. Angular only ever sees the `anon` key.
2. **Why admin checks happen twice.** Angular's check is for UX (hide nav, redirect non-admins). The Edge Function's check is the real security boundary — a motivated attacker can always call the function URL directly. Removing either is wrong.
3. **Why guards re-call `getSession()` instead of reading the signal.** On hard reload, guards can fire before `AuthService`'s constructor finishes hydrating. `getSession()` reads localStorage and resolves immediately, sidestepping the race.

## Common pitfalls (preview — full list in `Skill/auth.md`)

- Never paste a `service_role` key into `environment.ts`. If it starts with `eyJ...` and is labeled service_role, it's the wrong key.
- If the function returns 401, the JWT isn't being sent — confirm the admin is signed in at call time. `supabase.functions.invoke` attaches the token automatically.
- Admin list drift between Angular and the function silently produces "I see the UI but creation fails" or vice versa. Update both.
- Forgetting to apply `authGuard` to a new protected route lets users in must-change state browse there.

## Direct Postgres connection (added after initial scaffold)

The Supabase "Connect" snippet was wired into the project as well:

- `npm install postgres` — added the `postgres` (postgres.js) driver
- `pentahive-app/db.js` — exports a configured `sql` client
- `pentahive-app/.env` — holds the `DATABASE_URL` (added to `.gitignore`, will not be committed)
- `pentahive-app/.env.example` — sanitized template, safe to commit

### Important: this is Node-only, not for the browser

`postgres` is a TCP-based Node.js library. `process.env` and TCP sockets don't exist in the browser. **You cannot import `db.js` from Angular components.** It will compile but fail at runtime with cryptic bundler/polyfill errors.

Use it for:
- Node scripts (migrations, seed data, admin tasks) — run with `node --env-file=.env script.js`
- A future Node backend if you add one (Express, Fastify, etc.)
- It will **not** work inside the existing Supabase Edge Function — those run on Deno, not Node, and the function already uses `supabase-js` which is the right choice there.

For DB access from Angular, keep going through `supabase-js` (which talks to PostgREST and respects Row-Level Security), not direct Postgres.

### Connection details used

- Host: `aws-1-ap-southeast-1.pooler.supabase.com` (Singapore region pooler) *(was `ap-southeast-2` on the old project — see 2026-06-25 update)*
- Port: `5432` — **session pooler**
- User: `postgres.iblrotkczdrztenchnzx`
- DB: `postgres`

`db.js` passes `{ prepare: false }` to `postgres()` — required for the transaction pooler (port 6543) and harmless on the session pooler (5432). The direct connection (`db.<ref>.supabase.co:5432`) is IPv6-only on this project and won't resolve on an IPv4 network, so the pooler is the only viable path here.

### Quick sanity test

From `pentahive-app/`:

```bash
node --env-file=.env -e "import('./db.js').then(async m => { const r = await m.default\`select now()\`; console.log(r); process.exit(0); })"
```

Should print a single row with the current Postgres time, then exit.

## Schema — `public.users` (applied to the live DB)

The first ERP migration was written **and applied** to your Supabase project (originally `zpfkhcnxtiyojodtmepn`; re-applied to the current project `iblrotkczdrztenchnzx` on 2026-06-25) via the `db.js` Postgres client. Migration file: `pentahive-app/supabase/migrations/20260525000001_init_users.sql`.

### Shape

```
public.users
├── id                    uuid PK, FK → auth.users(id) ON DELETE CASCADE
├── email                 text NOT NULL
├── full_name             text
├── is_admin              boolean NOT NULL DEFAULT false
├── must_change_password  boolean NOT NULL DEFAULT false
├── created_at            timestamptz NOT NULL DEFAULT now()
└── updated_at            timestamptz NOT NULL DEFAULT now()

index: users_email_idx on lower(email)
```

### Triggers

- `auth.on_auth_user_created` — `AFTER INSERT on auth.users` → automatically creates a matching `public.users` row, copying `id`, `email`, and `must_change_password` (from `raw_user_meta_data`). Runs `SECURITY DEFINER` so it can write across schemas. `ON CONFLICT (id) DO NOTHING` makes it idempotent.
- `public.users_updated_at` — `BEFORE UPDATE on public.users` → touches `updated_at`.

This means: every time the Edge Function or the dashboard creates a Supabase auth user, a profile row appears automatically. You don't need to manually `INSERT INTO public.users`.

### Row-Level Security

RLS is enabled on `public.users`. Two policies:

- `users_select_self` — `SELECT` where `auth.uid() = id`. Each signed-in user sees only their own row.
- `users_update_self` — `UPDATE` where `auth.uid() = id`, plus a column-level grant restricting writes to `full_name` only. This prevents users from elevating themselves to admin by setting `is_admin = true` over the REST API — the column-level GRANT (not the policy) is what blocks it.

Admin operations bypass RLS entirely because the Edge Function uses the `service_role` key. Don't try to write to `public.users` from Angular with the anon key for anything but updating your own full_name; it'll be rejected.

### Seed admin user (live in the DB)

Migration `20260525000002_seed_admin_user.sql` inserts the first admin account directly:

| Field | Value |
|---|---|
| Email | `admin@gmail.com` |
| Password | `123456` |
| `auth.users.email_confirmed_at` | now() — no verification email needed |
| `auth.identities` | one row, provider `email` |
| `public.users.is_admin` | `true` (set after the trigger ran) |
| `public.users.must_change_password` | `false` (the seed user picks the password) |

Verified by querying back from the DB:

```
auth.users:     [ { email: 'admin@gmail.com', role: 'authenticated', confirmed: true } ]
public.users:   [ { email: '...', is_admin: true, must_change_password: false } ]
identities:     [ { provider: 'email' } ]
password ok:    [ { ok: true } ]   ← bcrypt verifies '123456'
```

**You can now sign in to the Angular app at `/login` with `admin@gmail.com` / `123456`** once you've also filled in the real Supabase URL + anon key in `environment.ts` (still required — see the top of this document). The user is fully usable for sign-in immediately; the placeholder credentials are the only thing blocking the app right now.

The admin allowlist in both Angular env files and the Edge Function were updated to include `admin@gmail.com` (alongside the original `kadimaymay.mhi@gmail.com`). Remove either entry whenever you don't want it admin-capable anymore.

> **Security note**: `123456` is a fine demo password but obviously not real-world safe. The Supabase Auth API enforces a minimum length of 6, so this is exactly at the floor. The seed inserted directly into the DB bypasses that check entirely. Rotate it before anything goes near production — sign in with this account, then use either the Angular `/change-password` page or `auth.admin.updateUserById()` from a server context.

## Schema — `public.roles` and `public.user_roles` (applied to the live DB)

Migration `20260525000003_init_roles.sql`. Adds a flexible many-to-many role system on top of the existing users table — one user can hold several roles (e.g. `manager` + `sales`).

### Shape

```
public.roles                       public.user_roles  (M:M)
├── id          smallserial PK    ├── user_roles PK (user_id, role_id)
├── name        text UNIQUE       ├── user_id     uuid → public.users.id ON DELETE CASCADE
├── description text              ├── role_id     smallint → public.roles.id ON DELETE RESTRICT
└── created_at  timestamptz       └── assigned_at timestamptz
                                   (+ indexes on user_id and role_id)
```

### Seeded roles

| id | name | description |
|---|---|---|
| 1 | `admin` | Full system access — can manage users and all data |
| 2 | `manager` | Department or team leader with elevated permissions |
| 3 | `employee` | Standard employee account |

The migration also assigns the `admin` role to `admin@gmail.com` so the seed account is wired up. Verified:

```
user_roles for admin@gmail.com: [ { email: 'admin@gmail.com', role: 'admin' } ]
has_role(admin@gmail.com, 'admin'):   true
has_role(admin@gmail.com, 'manager'): false
```

### Helper function

`public.has_role(uid uuid, role_name text) returns boolean` — `SECURITY DEFINER`, schema-pinned. Use it inside RLS policies on other tables:

```sql
create policy invoices_select_managers on public.invoices
  for select to authenticated
  using (public.has_role(auth.uid(), 'manager'));
```

### RLS

- `public.roles` — every signed-in user can `SELECT` (so the admin UI can populate dropdowns). No insert/update/delete policies → those are blocked client-side. Server-side writes go through `service_role`.
- `public.user_roles` — each user can `SELECT` their own assignments only. No client-side writes. Admin operations (assigning/revoking roles) must go through an Edge Function with `service_role`.

### Not wired into the app yet

Same caveat as `is_admin`: the column/tables exist, but the Angular app and Edge Function still check the hardcoded `adminEmails` allowlist for authorization. Migrating is two changes:

1. In the Edge Function, replace the `ADMIN_EMAILS.includes(...)` check with a query: `select public.has_role(<caller_id>, 'admin')`.
2. In Angular's `AuthService`, fetch the user's roles after sign-in and expose them as a signal (replace the email-allowlist `isAdmin` computed).

Until then, having an `admin` row in `user_roles` is informational only.

### Note: `is_admin` column is not wired into the app code yet

The column exists, but neither Angular nor the Edge Function reads it. The admin check still goes through the hardcoded email allowlist in `environment.adminEmails` / `ADMIN_EMAILS`. When you're ready to migrate to a DB-backed admin list (the "If the user asks for more" item in the skill), swap those reads for `select is_admin from public.users where id = $caller_id` and drop the hardcoded arrays.

### Running migrations

Helper scripts live in `pentahive-app/scripts/`:

```bash
# Apply any .sql file:
cd pentahive-app
node --env-file=.env scripts/apply-migration.mjs supabase/migrations/<file>.sql

# Inspect the users table state:
node --env-file=.env scripts/describe-users.mjs
```

The Node ESM warning (`MODULE_TYPELESS_PACKAGE_JSON`) is cosmetic — Angular's package.json doesn't set `"type": "module"` and I left it alone to avoid surprising the Angular build. The scripts work; the warning is just chatter.

For "production" migrations you should still run `supabase db push` after `supabase link`, so the supabase CLI tracks them in its migration history. The `apply-migration.mjs` helper is the quick-iteration alternative I used to apply this one directly.

## Supabase MCP server (added after Postgres setup)

Registered the hosted Supabase MCP server at project scope:

```json
// .mcp.json (at workspace root)
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=iblrotkczdrztenchnzx"
    }
  }
}
```

This lets Claude Code (and other MCP-aware clients) call Supabase tools against your project directly.

### You still need to authenticate

I can't run the OAuth flow for you. In **a regular terminal** (not the IDE extension), from this workspace root:

```bash
claude
/mcp
```

Then select `supabase` and choose Authenticate. The CLI will pop a browser for OAuth. Once it returns "authenticated", the tools become available in your next Claude Code session.

If you see the server listed but in "needs auth" state inside the IDE, that's expected until you complete the flow.

### Where the file lives

`claude mcp add --scope project` writes to `.mcp.json` in the **current working directory**. The first run landed in `pentahive-app/` because my shell session's cwd had drifted there — I moved it to the workspace root (next to `.claude/`) so it applies to the whole project, not just the Angular subdir. If you re-run the command yourself, do it from `PENTAHIVE_ERP/`, not `pentahive-app/`.

### Skipped: Agent Skills

Step 3 from your message (`npx skills add supabase/agent-skills`) was marked optional and is editor tooling, not app code. Skipped — run it yourself if you want it.

## Schema — access control (applied to the live DB)

Two migrations stack here. **The second one materially changed the model** — the schema described below is the *current* state.

- `20260526000001_init_access_control.sql` — initial: created `pages` + `access_grants` (per-user, per-page checkbox grants) + helper functions
- `20260526000002_refactor_to_access_definitions.sql` — **current model**: dropped `access_grants`, replaced it with a developer-authored catalog of *named access bundles* that admins assign to users. `access_grants` is gone; the migration is preserved in history only.

### Current model (decisions baked in)

- **Developer authors access bundles in migrations.** Each bundle is a named permission set across a chosen set of pages. Example: `procurement_officer` = view+create+edit on `purchase-requests` / `canvasses` / `purchase-orders`. The catalog lives in `access_definitions` + `access_definition_permissions` and is seeded via SQL migrations, not the UI.
- **Admin assigns bundles to users.** One row in `user_access` per assignment. A user can hold multiple bundles; effective permissions are the OR-union across all assigned bundles.
- **Role defaults still stack on top**:
  - `admin` role → implicit full access on everything. No assignments needed.
  - `manager` role → implicit `approve` on everything. Other actions per assigned bundles.
  - `user` role → starts with nothing. Earns access only via `user_access` assignments.
- **Pages can also declare their own role gate** (`pages.requires_role`). Set to `'admin'` or `'manager'` to restrict regardless of any assignments.

The role formerly known as `employee` was renamed to `user` in `public.roles` to match this terminology.

### Tables

```
public.pages
├── id            smallserial PK
├── code          text UNIQUE          -- 'purchase-orders', 'dashboard'
├── label         text
├── description   text
├── requires_role text                  -- null | 'manager' | 'admin'
└── created_at    timestamptz

public.access_definitions                -- developer-authored catalog
├── id            smallserial PK
├── code          text UNIQUE          -- 'procurement_officer'
├── name          text                  -- 'Procurement Officer'
├── description   text
└── created_at    timestamptz

public.access_definition_permissions     -- the page × permission matrix per bundle
PK (access_id, page_id)
├── access_id     smallint → access_definitions.id ON DELETE CASCADE
├── page_id       smallint → pages.id              ON DELETE CASCADE
├── can_view      boolean
├── can_create    boolean
├── can_edit      boolean
├── can_delete    boolean
└── can_approve   boolean

public.user_access                       -- admin-assigned in the running app
PK (user_id, access_id)
├── user_id       uuid → public.users.id          ON DELETE CASCADE
├── access_id     smallint → access_definitions.id ON DELETE CASCADE
├── assigned_by   uuid → public.users.id          ON DELETE SET NULL
└── assigned_at   timestamptz

public.v_user_effective_access           -- view: OR-union of all bundles per user × page
(user_id, page_id, page_code, page_label, can_view, can_create, can_edit, can_delete, can_approve)
```

### How you (as developer) author access bundles

Add a new migration like `20260527000001_add_access_procurement_officer.sql`:

```sql
insert into public.access_definitions (code, name, description) values
  ('procurement_officer', 'Procurement Officer', 'Can create PRs, canvasses, POs')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit)
select (select id from public.access_definitions where code = 'procurement_officer'),
       (select id from public.pages where code = p.code),
       true, true, true
from (values ('purchase-requests'), ('canvasses'), ('purchase-orders'), ('goods-receipts')) as p(code)
on conflict (access_id, page_id) do nothing;
```

### Seeded bundles

The catalog now ships with **8 bundles** covering admin + the main ERP job functions. Admins assigning a new employee can pick the closest match instead of being forced to grant full access.

| # | Code | Pages | Notes |
|---|---|---:|---|
| 1 | `all_access`          | 29 | Full permissions on every page. Assigned to `admin@gmail.com` (redundant — admin already bypasses, but makes grants visible). |
| 2 | `procurement_officer` |  9 | View/create/edit PRs, canvasses, POs, GRNs, suppliers, items. View-only: dashboard, warehouses, inventory. |
| 3 | `sales_officer`       |  8 | View/create/edit customers, SOs, deliveries. View-only: dashboard, items, inventory, AR, DCPR. |
| 4 | `warehouse_keeper`    |  7 | View/create/edit inventory, warehouses, weighbridge. View-only: dashboard, items, GRNs, deliveries. |
| 5 | `mill_operator`       |  6 | View/create/edit milling, quality-inspection, weighbridge. View-only: dashboard, items, inventory. |
| 6 | `accountant`          | 12 | View/create/edit AR, AP, GL, BIR, treasury, DCPR. View-only across source docs (SOs/POs/GRNs/deliveries) + reports. |
| 7 | `hr_officer`          |  3 | View/create/edit HR, payroll. View-only: dashboard. |
| 8 | `read_only_viewer`    | 24 | View on every milling-workspace page except HR and payroll. For executives/auditors. |

**No bundle grants `approve`** — that action is owned by the `manager` role (which has implicit approve everywhere via the `can_access()` short-circuit). To make someone an approver, give them the `manager` role + the relevant operational bundle.

Migrations:
- `20260526000003_grant_all_access_to_admin.sql` — original `all_access` bundle + assignment to admin.
- `20260603000002_seed_role_access_bundles.sql` — added the 7 role bundles above. Idempotent via `on conflict do nothing` — safe to re-run.

> **Authoring more bundles:** follow the pattern in `20260603000002_…` — `insert into access_definitions (code, name, description)` then `insert into access_definition_permissions (access_id, page_id, can_view, …)` for each page. The admin UI's catalog + dropdown pick them up automatically on next page load; no Angular change needed.

### Seeded pages (28 total)

dashboard, suppliers, customers, items, warehouses, vendos, purchase-requests, canvasses, purchase-orders, goods-receipts, sales-orders, deliveries, accounts-receivable, dcpr, inventory, weighbridge, milling, quality-inspection, accounts-payable, general-ledger, bir-compliance, treasury, importation, hr, payroll, reports, **admin-users** *(requires_role=admin)*, **admin-access** *(requires_role=admin)*.

When a new module page comes online, just add a row to `public.pages` — no schema change required.

### Helper functions

**`public.can_access(uid, page_code, action) → boolean`** — action-level check, for button gating and RLS on other tables.

```sql
-- inside an RLS policy on, say, milling_sales_orders:
create policy sales_orders_approve on public.milling_sales_orders
  for update to authenticated
  using (public.can_access(auth.uid(), 'sales-orders', 'approve'));
```

The function short-circuits:
1. If user has `admin` role → returns `true` immediately
2. If user has `manager` role AND `action = 'approve'` → returns `true`
3. Otherwise → checks `access_grants` for an explicit `true` on the matching column

**`public.can_enter_page(uid, page_code) → boolean`** — page-level entry check, for route guards. Combines `pages.requires_role` with `can_access(view)`. Returns `false` for unknown page codes (defensive).

```ts
// Angular pseudocode for a route guard
async function canEnter(pageCode: string): Promise<boolean> {
  const { data } = await supabase.rpc('can_enter_page', {
    p_user_id: currentUserId,
    p_page_code: pageCode,
  });
  return data === true;
}
```

### RLS

- `public.pages` — readable by all authenticated users (so the admin UI can list them).
- `public.access_grants` — each user sees only their own grants (so they can know what they can do). Admin writes happen via `service_role` (next: Edge Function `manage-access`).

### Verified

```
roles after rename:                          admin | manager | user
pages count:                                 28
admin-gated pages:                           admin-users, admin-access
can_access(admin@gmail.com, 'dashboard', 'view'):       true   (admin bypass)
can_access(admin@gmail.com, 'sales-orders', 'approve'): true   (admin bypass)
can_enter_page(admin@gmail.com, 'admin-users'):         true
can_enter_page(admin@gmail.com, 'nonexistent-page'):    false  (defensive)
```

### Wired into the app (now)

The app-side pieces are now in place:

1. **`manage-access` Edge Function** (`supabase/functions/manage-access/index.ts`) — admin-only, JWT-verified, with admin check via `has_role(uid, 'admin')` (not the env allowlist — this is the migration point for the create-user function too, eventually). Dispatches on `body.action`:
   - `assign_access` — assign an access bundle to a user (`user_id`, `access_id`)
   - `unassign_access` — revoke a bundle from a user
   - `list_user_assignments` — what bundles a user has (admin-only read; bypasses RLS)
   - `list_access_definitions` — the full catalog + page×permission matrix per bundle (for the admin UI to render)
   - `list_users` — every user with their roles flattened (for the admin picker)
   - `list_pages` — every page (also publicly readable via `public.pages`)

2. **AuthService** loads roles + the OR-unioned effective permissions automatically on session changes (sign in, token refresh, hard reload). It queries the `v_user_effective_access` view, which collapses all assigned bundles into one flat permission row per page. Signals:
   - `roles: string[]` — names from `user_roles`
   - `grants: AccessGrant[]` — effective view rows (one per accessible page)
   - `accessLoaded: boolean` — true once the first fetch completes
   - `isAdmin` — now backed by `roles().includes('admin')` (falls back to env allowlist before first load to avoid first-paint flicker)
   - `isManager` — `roles().includes('manager')`
   - `canDo(pageCode, action)` — mirrors the DB's `can_access()` semantics: admin → true; manager + `'approve'` → true; otherwise looks up the unioned row

3. **`pageAccessGuard`** — generic per-route guard that reads `route.data.pageCode` and calls the DB's `can_enter_page` RPC. Routes attach the page code as data:
   ```ts
   { path: 'admin/users', canActivate: [authGuard, pageAccessGuard], data: { pageCode: 'admin-users' } }
   ```
   Failed checks redirect to `/dashboard`. The old `adminGuard` (env-allowlist-based) is no longer referenced by any route; the file remains on disk for reference but should be deleted in a follow-up.

4. **Login → Dashboard with verification.** After `signIn` succeeds (and `must_change_password` is false), `Login` awaits `auth.loadAccess()` then navigates to `/dashboard`. This guarantees the dashboard renders with populated signals on first paint instead of empty-then-filled.

5. **Dashboard component** at `/dashboard` shows the signed-in email, the user's roles as a pill, and either:
   - "Admin role — full access" (+ link to manage users) for admins
   - "Manager role" + grant list for managers
   - "No role assigned — contact admin" for users with no role yet
   - The list of explicit grants for everyone else

### Still required to use it end-to-end

1. **Deploy the Edge Function**: `supabase functions deploy manage-access` (after `supabase link`)
2. **Build the admin/access UI** — picks a user → grid of pages × permissions → calls `manage-access` with `action: 'upsert_grant'`. A route is reserved (`/admin/access`) but no component yet.
3. **Add `pageAccessGuard` to remaining protected routes** — currently only `/admin/users` uses it. Every new module page should attach `data: { pageCode: '<seeded-code>' }` and add both guards.
4. **Migrate `create-user`'s allowlist → `has_role`** — minor cleanup; mirror the pattern from `manage-access`.

## Create-user button — now functional without the Edge Function (2026-05-27)

The **＋ Create user** button on the Admin Console (now `/milling/admin`) creates an `auth.users` row + matching `auth.identities` row directly via a `SECURITY DEFINER` Postgres function. The `create-user` Edge Function is **no longer required** for user provisioning.

### Migration

`pentahive-app/supabase/migrations/20260527000005_admin_create_user_rpc.sql` — applied.

```sql
public.admin_create_user(p_email text) returns table(user_id uuid, email text, temp_password text)
  SECURITY DEFINER, granted to authenticated.
```

Behavior:
1. **Authorize** — raises `forbidden` if caller is not in the `admin` role (via `has_role(auth.uid(), 'admin')`).
2. **Validate** — normalizes email (lowercase + trim), regex-validates basic shape, raises if blank or invalid.
3. **Duplicate check** — raises if an `auth.users` row already exists with that email.
4. **Temp password** — 14 chars drawn from a readable alphabet (no ambiguous `0OIl/1`).
5. **Insert into `auth.users`** — sets `email_confirmed_at = now()` (no verification email), bcrypt hashes the temp password via `extensions.crypt(...)`, stamps `raw_user_meta_data.must_change_password = true`.
6. **Insert into `auth.identities`** — required by some Supabase Auth versions for email/password sign-in to work.
7. **Returns** the new user_id, normalized email, and temp_password — admin UI displays the temp password ONCE.

The new user is forced through `/change-password` on first login because of the `must_change_password` flag (existing `authGuard` honors this).

### Admin UI change

`src/app/admin/admin.ts createUser()` now calls:

```ts
const { data, error } = await supabase.rpc('admin_create_user', { p_email: email });
// data is a one-row table: { user_id, email, temp_password }
```

Replaced the previous `supabase.functions.invoke('create-user', …)` call. Error handling strips the Postgres `forbidden:` / `invalid email address:` prefix so the alert reads cleanly.

**UI follow-up (2026-06-03):** the inline "Create user" form card was replaced by a **＋ Create User** button in the User list card header. Clicking it opens an `app-modal` (the shared `src/app/ui/modal.ts`) with the email field, error region, and post-submit success panel (email + temp password) all inside the modal. The submit button hides after a successful create; the secondary button label flips from **Cancel** → **Done**. State (`newUserEmail`, `createError`, `createdUser`) is reset every time the modal opens via `openCreateUser()`. This matches the `＋ Add / ＋ New` button → modal pattern used by every other module (suppliers, customers, items, etc.) and removes the always-visible form from the page. No backend change — the RPC call is unchanged.

**RPC fix (2026-06-03):** during testing, the modal surfaced `column reference "email" is ambiguous` from the `admin_create_user` RPC. Cause: the function's `RETURNS TABLE(user_id uuid, email text, temp_password text)` declares an OUT column named `email`, which Postgres treats as a visible variable inside the function body — and the duplicate-check query `select 1 from auth.users where lower(email) = v_clean` had a bare `email` reference that matched both the OUT column and `auth.users.email`. Fixed in migration `20260603000001_fix_admin_create_user_ambiguous_email.sql` (applied) by aliasing the table (`from auth.users u`) and qualifying the column (`lower(u.email)`). The fix is a `create or replace function` — no schema change, no data migration. If you ever extend this RPC, qualify every bare column that overlaps an OUT-table name.

**Embed disambiguation fix (2026-06-03):** after the RPC was fixed and the first non-admin user was created, the Admin Console showed "No users found" with `0 Users / 0 Admins` even though `public.users` had two rows and RLS allowed the admin to see both. Root cause: `public.user_access` has **two foreign keys back to `public.users`** — `user_id_fkey` AND `assigned_by_fkey`. PostgREST can't pick one for the embed and returns `PGRST201` (ambiguous relationship). The `Admin.load()` code was using `(u.data ?? []) as any[]`, which silently coerced the error response to an empty array — hence "0 users" with no visible error.

Two changes in `src/app/admin/admin.ts`:
1. **Disambiguated the embed** with the column-hint syntax: `user_access!user_id(...)` (also applied to `user_roles!user_id(...)` for consistency and future-proofing). This tells PostgREST to use the `user_id` column for the join, ignoring `assigned_by`.
2. **Added a `loadError` signal** and a red `ph-alert-error` banner at the top of the Admin Console so future PostgREST errors aren't silently swallowed. Errors from any of the three parallel queries (`users`, `roles`, `access_definitions`) are surfaced + logged to console.

If you ever add a third FK from another table back to `public.users`, the same disambiguation trick applies — `!fk_column_name` after the embed table.

### What this changes for deployment

- **Edge Function `create-user` is no longer on the critical path.** It still works (the source is in `supabase/functions/create-user/`), but the admin UI doesn't depend on it being deployed. You can defer `supabase functions deploy create-user` indefinitely now.
- **All `auth.users` provisioning is in-database.** The `seed_admin_user` migration uses the same pattern (direct `auth.users` insert), so this is consistent with how the seed admin was created.

### Verify it works

In the admin UI:
1. Sign in as `admin@gmail.com` → open **Milling** workspace → user menu → **Admin Console** (or directly `/milling/admin`)
2. Users tab → Create user form → enter `test1@example.com` → click Create
3. Green success panel shows the email + a 14-char temp password. **Copy it now** — it won't be shown again.
4. The "All Users" table refreshes with the new row (no role, no bundles)
5. Sign out → sign in as `test1@example.com` with the temp password → forced to `/change-password` → set a real password → lands on `/` workspace picker
6. Picker shows **no workspaces** (no bundles assigned yet) — sign back in as admin and assign a bundle from the Access tab; refresh; Milling card appears.

### Edge Function status

The original Edge Function `supabase/functions/create-user/index.ts` is still on disk and still functional if deployed. It does the same work via the Supabase Auth Admin API. Pick whichever path you prefer for future user provisioning — they don't conflict.

## Workspaces architecture — DONE (2026-05-27)

The app is now multi-workspace. After sign-in, users land on a **workspace picker** at `/` and choose between **Milling** (the rice/grain ERP we built) and **Hardware** (placeholder for the next workspace). Each workspace has its own URL prefix and module set.

### URL shape

```
/login, /change-password         Auth (outside any workspace)
/                                WorkspacePicker (post-auth landing)
/milling/<module>                Milling workspace — shell + all ERP modules
/hardware                        Hardware workspace (stub — "Coming soon")
/admin/{users,roles,access}      Cross-workspace, admin-only
/settings                        Cross-workspace user settings
```

### Migration

`pentahive-app/supabase/migrations/20260527000004_init_workspaces.sql` — applied.

- **`public.workspaces`** catalog table: `code`, `name`, `icon`, `description`, `status` (active / coming_soon / disabled), `sort_order`. Seeded with `milling` (active) and `hardware` (coming_soon).
- **`pages.workspace`** column (FK → `workspaces.code`, `on delete set null`). All 26 existing module pages tagged `'milling'`. Admin pages (`admin-users`, `admin-roles`, `admin-access`) stay `null` (cross-workspace).
- **`public.user_has_workspace(uid, code)`** function — `true` if admin OR if user has any bundle granting view on at least one page in that workspace.
- **`public.user_workspaces(uid)`** function — returns workspaces the user can access, ordered by `sort_order`.
- RLS on `workspaces` — any signed-in user can SELECT (so the picker can list them).

### Access model

| Who | Milling | Hardware | Admin Console |
|---|---|---|---|
| Admin role | ✓ (role bypass) | ✓ (role bypass) | ✓ (role bypass) |
| User with any milling-page bundle | ✓ | ✗ | ✗ |
| User with no bundles | ✗ | ✗ | ✗ |

Enforcement:
- DB layer — `user_has_workspace()` returns false → guard blocks
- Route layer — new `workspaceGuard` reads `route.data.workspace`, calls `user_has_workspace`, redirects unauthorized to `/`
- UI layer — WorkspacePicker only renders workspaces the user can see (calls `user_workspaces`)

### Files added

```
supabase/migrations/20260527000004_init_workspaces.sql  (new)
src/app/workspace-picker/workspace-picker.ts            (new — post-auth landing)
src/app/hardware/hardware.ts                            (new — coming-soon stub)
src/app/workspace.guard.ts                              (new — gates /milling/* and /hardware)
```

### Files restructured

- **`src/app/app.routes.ts`** — module routes now nested under `/milling`. Three new top-level entries (`/`, `/hardware`, `/milling`) replace the previous single shell at `/`. Admin and Settings stay top-level (cross-workspace).
- **`src/app/shell/shell.ts`** — workspace-aware. Reads workspace code from the URL's first segment, fetches `workspaces.name/icon` for the sidebar logo + topbar breadcrumb. NAV items use relative paths (`'dashboard'` not `'/dashboard'`); the template prefixes `/<workspace>/`. The Admin link moved out of the sidebar into the user-menu dropdown (cross-workspace, admin-only). New "Switch workspace" footer link at the bottom of the sidebar + in the user menu.
- **`src/app/login/login.ts`** — redirects to `/` (picker) after sign-in instead of `/dashboard`.
- **`src/app/dashboard/dashboard.ts`** — internal admin links now point at `/admin/users` / `/admin/access` (cross-workspace paths).

### Verified DB state

```
workspaces:
  milling  · 🌾 · Rice mill operations …   · active
  hardware · 🔧 · Hardware store …          · coming_soon

pages by workspace:
  milling           26
  (cross-workspace)  3   (admin-users, admin-roles, admin-access)

user_workspaces(admin@gmail.com): both workspaces returned (admin role)
```

### What's still to do

- **Hardware workspace** is just a static "Coming Soon" page. Schemas + modules ship in a future turn.
- **`workspaces.status='coming_soon'`** is enforced only in the picker UI (the card renders disabled). The `/hardware` route itself is reachable for admins because admin bypass returns true from `user_has_workspace`. To fully block, add a status check inside `workspaceGuard`.
- **Existing modules' internal links** all use absolute paths starting with `/`. If you discover any old-style `/dashboard` / `/suppliers` deep-links inside modules, prefix them with `/milling/`. Audit done on Shell + Dashboard + WorkspacePicker — others should be clean since modules tend not to deep-link laterally.

## Admin page (Users · Roles · Access) — DONE (2026-05-27)

Replaces the old single-purpose admin/users component with a unified tabbed admin page. **Three-layer admin gating** (DB requires_role + Angular pageAccessGuard + in-component check) means non-admins cannot reach or render this page.

### File

`src/app/admin/admin.ts` — single component, three tabs, lazy-loaded.

### Migration

`pentahive-app/supabase/migrations/20260527000003_admin_management.sql` — applied:

- **Relaxed `public.users` SELECT** — admins can now read every user row (previously self-only). Self-read still works for non-admins.
- **Relaxed `public.user_roles` SELECT** — admins read all assignments. Self-read preserved.
- **Added `public.user_roles` admin write policy** — `for all` gated by `has_role(auth.uid(), 'admin')`. Admin UI can insert/delete role rows directly via supabase-js.
- **Relaxed `public.user_access` SELECT** + admin write policy — same shape as user_roles.
- **Seeded `admin-roles` page** with `requires_role='admin'`. The `all_access` bundle was extended to cover it (admin keeps it on the explicit-assignment list).

### Three-layer admin gating

| Layer | What it does | Where |
|---|---|---|
| 1. DB — `pages.requires_role` | `admin-users`, `admin-access`, `admin-roles` all have `requires_role='admin'`. `can_enter_page()` returns `false` for non-admins. | `public.pages` rows |
| 2. Angular — `pageAccessGuard` | On every navigation, calls `supabase.rpc('can_enter_page', …)`. Non-admin → redirect to `/dashboard`. | `src/app/page-access.guard.ts` + `data: { pageCode, tab }` on each admin route |
| 3. Component — defensive `auth.isAdmin()` check | If the guard somehow allowed a non-admin through, the template renders an "Admin access required" error instead of the controls. | Wrapper `@if (!auth.isAdmin()) { … } @else { …rest… }` in `admin.ts` |

Plus a fourth layer in effect for *writes* — RLS on `user_roles`, `user_access`, and target tables all check `has_role(auth.uid(), 'admin')`. Even if a non-admin somehow loaded the component and triggered a write, the DB rejects it.

### Routes

Three paths, one component, default tab via `route.data.tab`:

```ts
{ path: 'admin/users',  loadComponent: …Admin, data: { pageCode: 'admin-users',  tab: 'users' }  }
{ path: 'admin/roles',  loadComponent: …Admin, data: { pageCode: 'admin-roles',  tab: 'roles' }  }
{ path: 'admin/access', loadComponent: …Admin, data: { pageCode: 'admin-access', tab: 'access' } }
```

Sidebar Admin group now has three links (Users / Roles / Access), still only visible to `auth.isAdmin()`.

### Tab: Users

- 3-KPI row: Total Users / Admins / With Bundles
- **＋ Create User** button in the User list card header — opens a centered modal (`app-modal`) containing the email field. On submit, calls the `admin_create_user(p_email)` Postgres RPC and displays the generated temp password in a one-time success panel **inside the modal** so the admin can copy it before dismissing. Submit button hides after success; Cancel changes to **Done**. Modal state resets on every open. (Edge Function no longer required — see "Create-user button" section below.)
- **All Users** table — every user with email, full_name, roles (colored pills), and assigned bundles (chips). Read-only view; mutations happen in Roles / Access tabs.

### Tab: Roles

- **Available Roles** — 3 cards (admin/manager/user) with description + count of users holding each.
- **Role Assignments** table — every user, current role pills with × to remove, dropdown + Assign button to add.
- **Self-protection** — refuses to let the last admin remove their own admin role (warning banner instead). Always-on guard: even if the user is one of many admins, removing self-admin reloads access immediately so the UI updates.

### Tab: Access Bundles

- Info banner reminding that bundles are developer-authored via migrations — UI only views catalog + manages assignments.
- **Catalog** — each bundle as a card with description, page count, code chip. Expandable to show the full page × permission matrix.
- **Bundle Assignments** table — same UX as Roles: chips with × to remove, dropdown + Assign per row. Admin role users show "role bypass — full access" instead of a chip list (their assignments are informational).

### How writes work

All mutations now go directly through `supabase.from('user_roles' | 'user_access').insert/delete(…)` from the browser, gated by the admin-write RLS policies added in the migration. The `manage-access` Edge Function still exists and is functional — it's the right path for server-to-server automation, but the admin UI doesn't need it anymore.

After each mutation, `auth.loadAccess()` is called when the affected user is the current user, so their roles/grants signals refresh immediately.

### Build

`admin` lazy chunk weighs ~33 kB. All three sidebar links route to the same chunk (no duplicate code).

## Settings page — DONE (2026-05-27)

The `/settings` route (linked from the topbar user menu) is now a real component with four sections, navigated via a left vertical nav. Per the user's spec: Profile + Security + Appearance + Notifications (placeholder). Org-level settings deferred to a future `/admin/organization` route.

### File

`src/app/settings/settings.ts` — single standalone component, lazy-loaded. Replaces the previous Placeholder wired to `/settings`.

### Section: Profile

- **Email** — read-only (login identifier; changing requires admin)
- **Display Name** — editable input bound to `public.users.full_name`. Save button enables only when dirty. Uses the existing column-level grant (`grant update (full_name) on public.users to authenticated`) and self-RLS policy.
- **User ID** — truncated mono display
- **Roles** — pills colored by role (admin gold / manager sky / user jade / none rose). Read-only.
- **My Access** sub-card below — admins see "Full access (role bypass)"; everyone else sees their list of assigned access bundles via `select * from user_access join access_definitions …` (RLS allows self-read).

### Section: Security

- **Change Password** form — same UX as the existing `/change-password` forced flow, but voluntary and doesn't write `must_change_password = false`.
- Two ph-fields (password + confirm) + live rule list ("min 8 chars" / "passwords match") with green tick animations.
- Submit button disabled until both rules pass. Calls `supabase.auth.updateUser({ password })`.
- Success message auto-hides after 3.5s.

### Section: Appearance

- **Theme** — segmented Light/Dark picker. Calls `ThemeService.set(…)` directly (the topbar toggle still works; this is just the in-page mirror).
- **Table density** — Comfortable / Compact. Writes `localStorage['pentahive-density']` and sets `data-density` on `<html>` so modules can react via `[data-density="compact"]` CSS selectors (no module currently subscribes — wire selectors when needed).
- **Currency display** — PHP / USD / THB / VND. Writes `localStorage['pentahive-currency']`. Hook into your money formatter when you want it to drive actual display.

### Section: Notifications (placeholder)

- Six toggle switches (purchase orders overdue, inventory low, credit hold, GRN dispute, weekly digest, in-app dot).
- Banner at top explicitly states: producer rules aren't wired yet, your preferences are saved, no emails/alerts fire until those triggers ship.
- Storage: writes to `auth.users.user_metadata.notification_prefs` via `supabase.auth.updateUser({ data: {…} })`. Survives reload and is server-side persisted (not just localStorage).

### How it loads

The component reacts to the `auth.user()` signal via `effect()` — when the user is known (post-hydration), it loads:
1. `public.users.full_name` for the profile section
2. `public.user_access` joined with `access_definitions` for the "My Access" sub-card
3. `user_metadata.notification_prefs` from the cached auth user for the notifications section

All three load in parallel-ish (one effect runs each). Persisting writes go to the corresponding store: `public.users` for profile, Supabase Auth for password, localStorage for appearance, `user_metadata` for notifications.

### Build

Lazy chunk `settings` weighs in around 25 kB.

## Side modules + computed views — DONE (2026-05-27)

Three new tables, four reporting views, and an audit-trail trigger now in place. Vendos page upgraded with a Cash Movements tab.

### Migration

`pentahive-app/supabase/migrations/20260527000002_init_side_modules_and_views.sql` — applied.

**New tables:**

| Table | Notes |
|---|---|
| `vendo_entries` | Income / expense per vending machine. FK to `vendos` with cascade. RLS via `can_access('vendos', …)`. |
| `activity_log` | Generic audit trail. `entity` = table name, `entity_id` = row PK, `payload` = jsonb `{before, after}` for UPDATE / `{after}` for INSERT / `{before}` for DELETE. Admin-only SELECT. |
| `alerts` | Workflow notifications. `target_role` null = visible to everyone; otherwise role-gated via `has_role`. Admin-only writes for now. |

**Audit trail trigger:**

`public.log_activity()` (SECURITY DEFINER, swallows its own errors so audit failures never break the originating operation) is attached as `AFTER INSERT OR UPDATE OR DELETE` to **22 high-value tables**: PR/canvasses/PO/GRN + their lines, SO + lines, deliveries, sales_invoices, collections, inventory + transactions, milling_batches, toll_milling, weighbridge_tickets, quality_inspections, suppliers, customers, items, warehouses, vendos, vendo_entries, user_access, access_definitions.

Every state-changing action now writes a row to `activity_log` with the calling user's UID and a structured before/after payload. Admin viewer page can be built later; the data is being captured starting now.

**Computed views (all `security_invoker = true`, no manual refresh needed):**

| View | What it returns |
|---|---|
| `v_customer_ar` | per customer: `ar_balance` (sum of unpaid `sales_invoices.amount_due`), `overdue_count`, `overdue_amount` |
| `v_customer_ytd` | per customer: `ytd_sales`, `ytd_order_count` (filtered to current calendar year, excludes cancelled/credit_hold) |
| `v_inventory_value_by_stream` | per stream (local/import): `sku_count`, `total_on_hand_mt`, `total_reserved_mt`, `total_available_mt`, `total_value` |
| `v_revenue_daily_by_stream` | per (date, stream): `order_count`, `revenue`. Used by the Dashboard trend chart when that lands. |

These are **regular views** (not materialized) — they evaluate live, so AR and YTD are always current. If the SO/invoice volume gets heavy later, swap individual ones to materialized + scheduled refresh.

### Vendos page enhancement

`/vendos` now has two tabs:

1. **Machines** tab (existing list, slightly upgraded)
   - KPI grid bumped to 4 cards: Total / Active / Needs Attention / **Net Income MTD**
   - Table now shows per-vendo Income MTD / Expense MTD / Net MTD columns (computed from the joined `vendo_entries` data)
2. **Cash Movements** tab (new)
   - KPIs: Income MTD / Expenses MTD / Net MTD / Entries Shown (4-card row)
   - **Filter by machine** dropdown — KPIs and table re-aggregate live
   - New Entry modal: pick machine + date + type (income/expense) + category + amount + notes
   - Pre-fills the machine in the modal when a filter is already active

### Files added/modified

```
supabase/migrations/20260527000002_init_side_modules_and_views.sql  (new)
src/app/vendos/vendos.ts                                            (rewritten with tabs)
```

No new route entries needed — Vendos was already wired; the entries data flows through the same page.

### What's intentionally deferred

- **Activity log viewer UI.** Schema + trigger are live (data is being captured right now). A read-only timeline page at `/admin/activity` is a small follow-up — just query `activity_log order by ts desc limit 200` with optional entity filter.
- **Alerts producer rules.** No alerts are being generated yet — the table is ready, and rules like "PO overdue → insert alert" or "inventory < reorder_pt → insert alert" can be added as triggers on the source tables. Same for the in-app notification badge in the topbar (`notif-dot` from the mockup).
- **Views consumption.** The four views are queryable now; Dashboard will pull from them in Phase H.

## Phase E Inventory + Operations — DONE (2026-05-27)

Four more modules wired end-to-end: **Inventory, Weighbridge, Milling (Internal + Toll tabs), Quality Inspection**. That covers every Operations item in the sidebar.

### Migration

`pentahive-app/supabase/migrations/20260527000001_init_inventory_and_operations.sql` — applied. Tables created:

| Table | Notes |
|---|---|
| `inventory` | Per-SKU stock per warehouse + stream. `available_mt` = `on_hand_mt - reserved_mt` (generated). `total_value` = `on_hand_mt * unit_cost` (generated). `reorder_pt` for low/critical computation in app. |
| `inventory_transactions` | Append-only log: receipt / dispatch / adjust / transfer-in / transfer-out. Linked to `sku` (no FK so historical rows survive item deletes). |
| `weighbridge_tickets` | `net` = `gross - tare` (generated). Modes: single / two-way. Payment: cash / credit. |
| `milling_batches` | Internal milling. Planned → in_progress → completed. Tracks recovery %, cost per rice sack, total cost. |
| `toll_milling` | Customer milling (RJL provides the mill, customer keeps the rice). `byproduct_disposition` = customer or rjl. |
| `quality_inspections` | Linked to GRN (optional). Moisture / impurity / chalkiness / broken percentages. Result: passed / partial_reject / rejected. |

All RLS delegates to `public.can_access(uid, page_code, action)` — same enforcement boundary. The two milling tables (`milling_batches` + `toll_milling`) **share the `'milling'` page code** because the UI is a single tabbed page.

### Angular modules

| Route | Page code | What it does |
|---|---|---|
| `/inventory` | `inventory` | Stream-split layout (🌾 Local Stock + 🚢 Import Stock, each with subtotal row), warehouse utilization bars at the top, Adjust modal that writes a row to `inventory_transactions` and updates `on_hand_mt` atomically (best-effort sequential). |
| `/weighbridge` | `weighbridge` | KPIs (today/MTD/revenue/pending two-way), full ticket register, new-ticket modal with single/two-way modes and live net preview. |
| `/milling` | `milling` | **Tabbed page**: Internal Batches + Toll Milling. Internal has KPIs (total/in-progress/avg recovery/cost MTD) + status workflow (Start → Mark Completed). Toll has KPIs (jobs MTD/revenue MTD/avg recovery/byproduct disposition). Both modals auto-compute recovery % from `(rice_out / (sacks_in × kg_per_sack))`. |
| `/quality-inspection` | `quality-inspection` | KPIs (pass rate/rejections/avg moisture), table with red highlighting on moisture > 14% and impurity > 1%, modal linked to GRN picker. |

### Document number series added

`next_doc_no()` now serves: `WT-YYYY-NNNN` (weighbridge), `MB-YYYY-NNNN` (milling batch), `TM-YYYY-NNNN` (toll milling), `QC-YYYY-NNNN` (quality inspection). Series counters auto-create on first use.

### Files added this turn

```
supabase/migrations/20260527000001_init_inventory_and_operations.sql
src/app/inventory/inventory.ts
src/app/weighbridge/weighbridge.ts
src/app/milling/milling.ts
src/app/quality-inspection/quality-inspection.ts
```

Routes updated: 4 placeholder entries swapped for real lazy-loaded modules.

### Build verified

```
Lazy chunks added this turn:
  milling             69 kB  (largest — two tabbed sub-pages)
  inventory           60 kB
  weighbridge         37 kB
  quality-inspection  37 kB
```

### What's intentionally deferred

- **GRN posting → inventory_transactions auto-write.** Schema is ready; the GRN module currently just flips the PO to received without creating inventory rows. This is a small follow-up: in `goods-receipts.ts saveLines()`, after the GRN lines insert, write matching `inventory_transactions` rows with `type='receipt'` and update `inventory.on_hand_mt` per matched SKU.
- **Stock Transfer modal.** Adjust handles single-warehouse changes; transferring between warehouses needs a 2-row transaction (transfer-out from source + transfer-in to destination). Trivial when needed.
- **Weighbridge → SO/PO/Toll linkage.** Right now WT is a standalone register. The mockup has weight tickets that link back to a customer/SO or a paddy purchase. Doable when sales-side flows generate more cross-references.
- **Detailed two-way weigh workflow.** Current modal asks for gross + tare at once. The mockup has gross-then-return-for-tare flow with a "pending tare" state. The schema already has the flag (`mode='two-way' && tare=0` is "pending"); only the UI needs an update step.

## Phase C Procurement + Sales (partial) — DONE (2026-05-27)

Six more modules wired end-to-end: **Purchase Requests, Canvasses, Purchase Orders, Goods Receipts, Sales Orders, Deliveries**. AR and DCPR have schemas (sales_invoices, collections) but UI is deferred to next turn — they need the SO-flow data to render anything useful.

### Migration

`pentahive-app/supabase/migrations/20260526000005_init_procurement_and_sales.sql` — applied. Tables created:

| Table | Header / lines | Notes |
|---|---|---|
| `doc_counters` | counter | Backing table for `next_doc_no(series)` — auto-resets per year |
| `purchase_requests` + `pr_lines` | 1:N | Status: draft → for_canvass → canvassed → approved → converted_to_po → cancelled. `pr_lines.line_total` is a generated column (`qty * est_unit_price`). |
| `canvasses` + `canvass_items` + `canvass_quotes` | 1:N:N | Status: open → awaiting_approval → awarded → closed → cancelled. Quote/winner UI is deferred (schema is ready). |
| `purchase_orders` + `po_lines` | 1:N | Status: pending_approval → approved → in_transit → boc_clearance → overdue → received → cancelled. Stream tag (`local`/`import`), EWT fields (`ewt_rate`, `ewt_amount`, `bir_registered`). |
| `goods_receipts` + `grn_lines` | 1:N | QC: passed/partial_reject/rejected. `grn_lines.variance` is a generated column (`qty_received - qty_po`). |
| `sales_orders` + `so_lines` | 1:N | Status: draft → confirmed → credit_hold → in_transit → delivered → cancelled. Stream tag. `so_lines.amount` generated. |
| `deliveries` | header | Status: scheduled → in_transit → delivered → delayed → cancelled. `tracking_steps` jsonb (unused yet). |
| `sales_invoices` | header | Schema only — UI in next turn (AR). |
| `collections` | header | Schema only — UI in next turn (DCPR). `net = gross - ewt` generated. |

Plus the **doc-numbering helper**:

```sql
public.next_doc_no(p_series text) → text
-- Returns 'PR-2026-0001', 'PO-2026-0001', etc.
-- Atomic increment per series; resets when year flips. SECURITY DEFINER, granted to authenticated.
```

### RLS

Every table delegates to `public.can_access(auth.uid(), '<page_code>', '<action>')` — same shape as the master-data tables. Line tables use a single `for all` policy with `'edit'` action (you can't have lines without edit rights on the parent). The procurement / sales gates flow automatically when you author new access bundles.

### Angular modules (live in sidebar)

| Route | What it does | Notable behaviors |
|---|---|---|
| `/purchase-requests` | KPIs (drafts/canvassing/converted/aged>7d), table, create modal with dynamic line items | "Save Draft" vs "Submit for canvass" splits the status. Aged > 7 days computed from `created_at`. |
| `/canvasses` | KPIs, table, create modal (header only). | PR picker is pre-filtered to `status = 'for_canvass'`. Quote entry + winner picking + award action is the next pass. |
| `/purchase-orders` | KPIs (open/received MTD/overdue/import), table with EWT compliance banner, direct create with line items | Picking a supplier auto-sets `bir_registered`, `ewt_rate`, and stream (import if origin ≠ local). EWT amount computed live on the modal subtotal. Approve button transitions `pending_approval` → `approved`. |
| `/goods-receipts` | KPIs (MTD/posted/disputes/pass rate), table, create-from-PO with per-line received quantities | PO picker filtered to `approved`, `in_transit`, `boc_clearance`. Variance is a generated DB column. Posting flips the PO to `received`. |
| `/sales-orders` | KPIs (revenue MTD + Local MTD + Import MTD + Credit Hold), stream filter pills, table, create with lines | **Credit-hold check**: picking a customer whose `status='credit_hold'` blocks "Confirm SO" (Save Draft still works). Shows credit limit / AR balance / available below the customer picker. |
| `/deliveries` | KPIs (MTD/today/in transit/delayed), table, create from SO, tracker view, Dispatch / Mark Delivered buttons | SO picker filtered to `confirmed`/`in_transit`. Stepper view at the bottom shows the current shipment. |

### Files added this turn

```
supabase/migrations/20260526000005_init_procurement_and_sales.sql
src/app/purchase-requests/purchase-requests.ts
src/app/canvasses/canvasses.ts
src/app/purchase-orders/purchase-orders.ts
src/app/goods-receipts/goods-receipts.ts
src/app/sales-orders/sales-orders.ts
src/app/deliveries/deliveries.ts
```

Routes updated: 6 placeholder entries swapped for real lazy-loaded modules.

### What's intentionally deferred

These are flagged with banners in the relevant pages so the user isn't surprised:

1. **Canvass quote entry + winner picking + award → auto-create POs.** Schema is ready; UI is one focused turn. For now, admins create POs directly via the PO page — most companies do this anyway.
2. **AR (`/accounts-receivable`).** Needs sales_invoices auto-created from confirmed SOs + an aging breakdown view. Schema is in place.
3. **DCPR (`/dcpr`).** Daily collection + disbursement summary. Needs collections (UI) + close-day logic.
4. **GRN → inventory_transactions.** Once the inventory module is built (next phase), the GRN posting trigger writes inventory rows. Stub for now.
5. **Overdue invoice trigger.** A scheduled job (or daily cron) flips `sales_invoices.status` to `overdue` past `due_date`. Build with AR.

### Build verified

```
Lazy chunks added this turn:
  sales-orders       55 kB
  purchase-orders    54 kB
  deliveries         40 kB
  purchase-requests  40 kB
  goods-receipts     40 kB
  canvasses          31 kB
```

## Phase B Master Data — DONE (2026-05-26)

Five fully working modules — schema + RLS + list page + create modal — all wired to Supabase. Admin signs in, can navigate to each, create rows via modal, see them in the table. KPI cards recompute live from the rows.

### Migration

`pentahive-app/supabase/migrations/20260526000004_init_master_data.sql` — applied. Five tables:

| Table | Columns | Constraints |
|---|---|---|
| `suppliers` | code (unique), name, tin, category (check), origin, bir_registered, ewt_rate, payment_terms, contact_person, phone, email, status, ytd_purchases, timestamps | category ∈ {paddy, import, packaging, equipment, office} · status ∈ {active, inactive} |
| `customers` | code (unique), name, tin, segment (check), stream (check), credit_limit, ar_balance, ytd_sales, payment_terms, contact_person, phone, email, status (check), timestamps | segment ∈ {distributor, retail, government, financial} · stream ∈ {local, import, mixed} · status ∈ {active, credit_hold, inactive} |
| `items` | code (unique), description, uom, category (check), last_price, last_supplier_id (FK→suppliers), last_canvass_date, timestamps | category ∈ {paddy, milled-rice, import-rice, packaging, equipment, byproduct, office, other} |
| `warehouses` | code (unique), name, type (check), capacity_mt, location, status, timestamps | type ∈ {paddy, milled, import, byproduct, equipment, office} |
| `vendos` | code (unique), name, location, type (check), status (check), notes, timestamps | type ∈ {water, snacks, coffee, coin-op, other} · status ∈ {active, maintenance, retired} |

Every table also gets:
- `updated_at` trigger via the existing `public.set_updated_at()` function
- RLS enabled with **all 4 policies** (`select`, `insert`, `update`, `delete`) delegating to `public.can_access(auth.uid(), '<page_code>', '<action>')`. The access-control system is the single enforcement boundary.
- Relevant indexes (status, category, type, stream).

### Why this RLS shape matters

Because of the role short-circuits in `can_access()`:
- **Admin** can do everything (role bypass).
- **Manager** can `approve` (role bypass); for `view/create/edit/delete` they need explicit `manager` access in a bundle.
- **User** needs explicit bundle grants for everything.

So when you (developer) author a new bundle migration like `procurement_officer = view+create+edit on [purchase-requests, canvasses, purchase-orders]`, suppliers/items/etc. permissions flow through `can_access()` automatically. No additional RLS work needed when adding new modules — just call `can_access(...)` from your policies.

### Angular components

| Route | Component | What it does |
|---|---|---|
| `/suppliers`  | `Suppliers`  | KPIs (total/active/EWT-flagged/foreign) + table + create modal. Compliance banner when non-BIR suppliers exist. |
| `/customers`  | `Customers`  | KPIs (total/avg credit/total AR/credit hold) + stream filter pills (All/🌾Local/🚢Import) + table with utilization bar + create modal. |
| `/items`      | `Items`      | KPIs (total/rice count/avg price) + table + create modal. |
| `/warehouses` | `Warehouses` | KPIs (total/total capacity/storage types) + table + create modal. |
| `/vendos`     | `Vendos`     | KPIs (total/active/needs-attention) + table + create modal with notes field. |

Common patterns across all five:
- All KPIs are **`computed()` signals** off the rows signal — recompute live as you add rows.
- `loading()` + `error()` + empty-state branches in templates.
- Create button is gated by `auth.canDo('<page_code>', 'create')` — non-admins without grants don't see it (but the RLS policy is the real boundary).
- Modal is the shared `ui/modal.ts` component (backdrop + ESC to close + click-outside to close).
- Form payloads coerce `''` → `null` for nullable text columns to avoid storing empty strings.

### Shared

- `src/app/ui/modal.ts` — single reusable modal: header with close button, slot for content, ESC + backdrop close, `closeOnBackdrop` input toggle, `closed` output event.

### Files added this turn

```
pentahive-app/
├── supabase/migrations/
│   └── 20260526000004_init_master_data.sql
└── src/app/
    ├── ui/
    │   └── modal.ts
    ├── suppliers/
    │   └── suppliers.ts
    ├── customers/
    │   └── customers.ts
    ├── items/
    │   └── items.ts
    ├── warehouses/
    │   └── warehouses.ts
    └── vendos/
        └── vendos.ts
```

Routes updated: 5 placeholder entries (`customers`, `suppliers`, `items`, `warehouses`, `vendos`) swapped for real lazy-loaded components, each with `data: { pageCode: '<code>' }` for `pageAccessGuard`.

### Build verified

```
ng build --configuration=development
Lazy chunks per module:
  customers   45 kB
  suppliers   40 kB
  vendos      30 kB
  warehouses  30 kB
  items       28 kB
```

## Phase A Foundation — DONE (2026-05-26)

The Angular app now has its full chrome: sidebar, topbar, themed surfaces, and the 28 module routes that match `public.pages`. Sign in lands on `/dashboard` inside the shell. Every protected route is gated by `pageAccessGuard` reading `route.data.pageCode`.

### Files added/modified

| File | What it does |
|---|---|
| `src/styles.css` | **Rewritten.** All mockup design tokens (`--gold`, `--jade`, `--sky`, `--rose`, `--teal`, `--violet`, surfaces, mono font, stream tokens) + `--ph-*` aliases that keep the existing Login/ChangePassword styling intact. Light default + `[data-theme="dark"]` override block. |
| `src/app/theme.service.ts` | **New.** Signal-backed theme service. Reads localStorage on init (defaults to dark), writes back on change. Applies `data-theme` attribute to `<html>`. |
| `src/app/shell/shell.ts` | **New.** Layout component: sidebar (grouped nav, badges, user footer) + topbar (title/breadcrumb + theme toggle + sign-out) + content `<router-outlet>`. Admin nav group appears only when `auth.isAdmin()`. |
| `src/app/placeholder/placeholder.ts` | **New.** "Coming soon" page used by all not-yet-built modules. Reads `route.data` to display the module's title, icon, and page code. |
| `src/app/app.routes.ts` | **Rewritten.** Shell is the parent route for everything authenticated. All 28 modules have routes that point to Placeholder + carry `pageCode` data for `pageAccessGuard`. Dashboard is the only fleshed-out child; admin/users keeps its real component. |
| `src/app/app.html` | Trimmed to a bare `<router-outlet/>` (was `<main><router-outlet/></main>`). |
| `src/app/dashboard/dashboard.ts` | **Rewritten.** Now sits inside the shell (no longer renders its own topbar). Mockup-style KPI grid (4 placeholder cards) + two info cards: profile/role + page-access summary. |

### Nav structure (matches the mockup, ordered per its sidebar)

```
Overview     → Dashboard
Operations   → Weighbridge (LIVE badge), Milling, Inventory, Quality Inspection
Sales        → Customers, Sales Orders, Delivery, AR, DCPR (DAILY badge)
Procurement  → Suppliers, Purchase Requests, Canvasses, Purchase Orders,
                Goods Receipt, Items, Warehouses
Importation  → Shipments
Accounting   → General Ledger, Accounts Payable, BIR Compliance
Treasury     → Cash Position
HR & Reports → Employees, Payroll, Reports, Vendos
Admin        → Users, Access     (only visible when auth.isAdmin() is true)
```

### Theme tokens

- **Light = default.** Mockup's `:root` block was the dark theme; I inverted it so the existing Login UI stays in light mode by default (matches what the user already styled).
- **Dark via `data-theme="dark"`.** All surfaces/borders/text/sub colors swap; stream tokens swap to the brighter mockup palette.
- **`--ph-*` tokens** are now thin aliases (`--ph-bg: var(--void)`, `--ph-surface: var(--surface)`, etc.) so the user's Login and ChangePassword components keep working without touching them.

### Still to do for Phase A

1. **Real logo.** Currently a CSS-rendered SVG hex glyph. Drop `rjl_logo_256.png` (or a PentaHive equivalent) into `src/assets/` and replace the inline `<svg>` in `shell.ts` with `<img src="/assets/<name>.png" />`.
2. **Shared component library.** Right now KPI card styling is inline in dashboard CSS. When the first module consumer needs them, extract: `kpi-card`, `stream-card`, `data-table`, `pill`, `status-badge`, `modal`, `form-field`, `chart-trend`, `chart-donut`, `period-filter`. JIT extraction beats premature abstraction.
3. **Cleanup unreferenced files.** I tried to delete these but the auto-mode classifier blocked the unprompted deletion. None of them are imported anywhere, so they're harmless (tree-shaken from the bundle), but worth cleaning up before they confuse someone:
   - `src/app/shared/app-shell.ts` — earlier stub with the same `selector: 'app-shell'` as the new `shell/shell.ts`. If imported alongside the new shell, you'll get a duplicate-selector runtime error. **Delete this folder.**
   - `src/app/home/home.ts` — unused since the dashboard became the post-login landing.
   - `src/app/admin.guard.ts` — replaced by `pageAccessGuard`; no longer imported.

## What's next — high-level roadmap pointer

Full TODO is in `Skill/RJL-ERP-BUILD-TODO.md`. The next concrete blocks of work after the env values are filled in:

1. **App shell** — sidebar/topbar/breadcrumb + theme toggle, porting design tokens from the mockup (`--local`, `--import`, gold/jade/sky/rose, etc.). Section 1 + Section 4 of the TODO.
2. **Master-data schemas** — `suppliers`, `customers`, `items`, `warehouses`. Each gets its own migration; follow the column shapes in TODO § 2.
3. **Shared components** — `kpi-card`, `stream-card`, `data-table`, `pill`, `status-badge`, `modal`, `form-field`, `chart-trend`, `chart-donut`, `period-filter`. TODO § 3 Phase A.
4. **Procurement flow** — Purchase Requests → Canvass → POs → GRN. The auto-create chain (canvass-award → PO row) is the tricky part. TODO § 3 Phase C.
5. **Migrate `is_admin` / hardcoded allowlist → `has_role()` everywhere** — two-line change in the Edge Function + AuthService, deferred until you actually need non-admin roles to do something.

## Build verification

```
$ ng build --configuration=development
Initial chunk files | Names  | Raw size
main.js             | main   | 2.16 MB
styles.css          | styles | 95 bytes

Application bundle generation complete. [3.662 seconds]
```

No errors. No remaining warnings beyond the standard bundle-size advisory (development build).
