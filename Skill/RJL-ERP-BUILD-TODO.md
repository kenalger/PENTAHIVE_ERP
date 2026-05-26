# RJL ERP — Angular + Supabase Build TODO

> **Status snapshot (2026-05-26):** Project scaffold + Supabase wiring + admin-managed auth are **DONE**. Schema work has started — `public.users`, `public.roles`, `public.user_roles`, `public.has_role()`, plus a seeded admin account (`admin@gmail.com` / `123456`). Next up: app shell + module schemas (suppliers/customers/items/warehouses), then Procurement.
>
> See `HANDOFF.md` at the repo root for the full implementation log. Specific deviations from this TODO are noted inline below.

## ✅ Completed so far (2026-05-26 — late session)

**Phase B Master Data now complete** (suppliers, customers, items, warehouses, vendos — full CRUD with KPIs + modals + RLS).

**Phase A Foundation now complete:**
- App shell (sidebar + topbar + content area) — `src/app/shell/shell.ts`
- Theme service with localStorage persistence, defaults to dark — `src/app/theme.service.ts`
- Design tokens ported from mockup into `src/styles.css` (light default + `[data-theme="dark"]` override)
- All 28 module routes wired with `pageAccessGuard` and per-route `pageCode`
- `Placeholder` component used for all not-yet-built modules
- Dashboard refit with mockup-style KPI cards + profile/access cards
- `ph-*` design tokens kept as aliases so the user's existing Login/ChangePassword UI keeps working

## ✅ Completed so far

- **Project scaffold** — Angular 21 standalone app at `pentahive-app/` (note: Angular 21, not 17; `style=css` not scss; `--strict` not set on init)
- **Supabase JS SDK** — `npm i @supabase/supabase-js` done
- **Environments** — `environment.ts` + `environment.development.ts` with `supabaseUrl` / `supabaseAnonKey` / `adminEmails` (placeholder values, real creds still to fill in)
- **Supabase client** — `src/app/supabase.client.ts` (single exported `supabase` instance, **not** a `core/supabase.service.ts` injectable — simpler shape, same outcome)
- **Auth (admin-managed model)** — Login, Change-Password forced flow, Admin panel for creating users, Edge Function `create-user` source written. **No public signup** by design.
- **Route guards** — `authGuard`, `adminGuard`, `changePasswordGuard` wired on every protected route
- **Direct Postgres client** — `db.js` + `.env` for Node-side scripts / migrations (port 6543 transaction pooler, `prepare: false`)
- **MCP server** — `.mcp.json` at workspace root, hosted Supabase MCP at project ref `zpfkhcnxtiyojodtmepn`
- **Schema (live in DB)**
  - `public.users` — profile mirror of `auth.users` with `is_admin`, `must_change_password`, full_name, RLS (self-read, self-update full_name only), trigger that auto-creates a row on each new `auth.users` insert
  - `public.roles` + `public.user_roles` — M:M role assignments, seeded with `admin` / `manager` / `user`
  - `public.has_role(uuid, text)` — helper for use inside RLS policies on other tables
  - Seeded admin: `admin@gmail.com` (bcrypt password `123456`), assigned the `admin` role
  - **`public.pages`** — 28 pages seeded (every module from this TODO). `requires_role` column lets a page declare its own role gate (admin/manager).
  - **Access bundle catalog** (developer-authored via migrations):
    - `public.access_definitions` — named bundles (`code`, `name`, `description`)
    - `public.access_definition_permissions` — page × permission matrix per bundle
    - `public.user_access` — admin assigns bundles to users (M:M)
    - `public.v_user_effective_access` — view: OR-union of all bundles per (user, page)
  - `public.can_access(uid, page_code, action)` — action-level authorization (use in RLS + button gating). Rewritten to walk `user_access` → `access_definition_permissions`.
  - `public.can_enter_page(uid, page_code)` — page-level entry check for route guards (combines `requires_role` + `can_access(view)`).
- **Edge Function `manage-access`** — admin-only, dispatches on `body.action`: `assign_access`, `unassign_access`, `list_user_assignments`, `list_access_definitions`, `list_users`, `list_pages`. Admin check uses `has_role(uid,'admin')`, not the env allowlist. Not yet deployed.
- **AuthService** loads roles + effective permissions on every session change (via `v_user_effective_access` view). Signals: `roles`, `grants`, `accessLoaded`, `isManager`. `isAdmin` now reads from `roles` (falls back to env allowlist before first load). Helper `canDo(pageCode, action)` mirrors `can_access` semantics in TS.
- **`pageAccessGuard`** — generic route guard using the `can_enter_page` RPC. Routes pass `data: { pageCode: '...' }`. Wired on `/admin/users`; older `adminGuard` is unused (file kept for reference, slated for delete).
- **Dashboard** at `/dashboard` — post-login landing page; shows email + role pills + explicit grants list. Login now awaits `loadAccess()` before routing here, so the page renders with populated signals on first paint.

**Still required before sign-in works end-to-end** (covered in `HANDOFF.md`):
1. Paste real `supabaseUrl` + `supabaseAnonKey` into `environment.ts` / `environment.development.ts`
2. Disable email signup + confirm-email in Supabase dashboard (UI tidy — code already handles it)
3. `supabase login` → `supabase link --project-ref zpfkhcnxtiyojodtmepn` → `supabase functions deploy create-user`
4. In a terminal, run `claude /mcp` to authenticate the Supabase MCP

---

## 0. Stack & Conventions

- **Frontend**: Angular 17+ (standalone components, signals, control flow `@if/@for`)
- **State**: Angular signals + RxJS where needed; no NgRx unless it earns its keep
- **Backend**: Supabase (Postgres + Auth + Row-Level Security + Realtime + Storage)
- **Forms**: Reactive Forms
- **UI**: Custom CSS using the design tokens from the mockup (or wire to Tailwind if you prefer — but keep the tokens). Don't use Angular Material's defaults; the mockup look is distinctive.
- **Charts**: Either keep the hand-coded SVG approach from the mockup (zero deps, very lean) or use `ngx-charts` if you want more out of the box. SVG is recommended — the mockup chart code is portable.
- **Auth**: Supabase Auth (email/password to start; can add SSO later)
- **Hosting**: Vercel / Netlify / Supabase Edge — pick one early
- **PDF/print**: Use `window.print()` with print-only CSS for AOQ, PO, GRN docs (mockup already shows the pattern)

### Naming
- Tables: `snake_case_plural` (e.g. `purchase_orders`)
- Columns: `snake_case` (e.g. `supplier_id`)
- Components: `kebab-case.component.ts`
- Routes: `kebab-case` (`/purchase-requests`, `/canvass`)

### Stream concept
"Local" = buy local paddy → mill → resell. "Import" = import rice → resell. **Every transactional table that touches trading needs a `stream` enum (`local`/`import`) column** — this is what drives all the Local/Import splits across SO, AR, DCPR, PO, Inventory, Customers, Dashboard KPIs and charts.

---

## 1. Project setup (Day 1)

- [x] **DONE** — `ng new pentahive-app --routing --style=css --ssr=false` *(Angular 21, css not scss, --strict not set; can be added later via tsconfig if wanted)*
- [x] **DONE** — `npm i @supabase/supabase-js`
- [x] **DONE** — `environment.ts` + `environment.development.ts` with `supabaseUrl`, `supabaseAnonKey`, `adminEmails` *(placeholders still need real values — see HANDOFF.md step 1)*
- [x] **DONE** — `src/app/supabase.client.ts` (single exported client, not an injectable service — equivalent function, simpler shape)
- [x] **DONE** — Routing skeleton with all 28 module routes (sidebar groups: Overview, Operations, Sales, Procurement, Importation, Accounting, Treasury, HR & Reports, Admin). Routes pass `pageCode` data to `pageAccessGuard`.
- [x] **DONE** — App shell at `src/app/shell/shell.ts`. Sidebar (grouped nav with badges), topbar (page title + breadcrumb + theme toggle + sign-out), content area renders child `<router-outlet/>`. Shell is itself a route component wrapping all authenticated routes.
- [ ] Logo: PNG version of mockup logo still pending — currently using an inline SVG hex mark. *(Drop `rjl_logo_256.png` into `src/assets/` and swap `<svg>` for `<img>` in `shell.ts`.)*
- [x] **DONE — Theme toggle + tokens.** `ThemeService` (signal-backed, localStorage-persisted). Mockup CSS variables ported to `src/styles.css` with **light theme as default** + `[data-theme="dark"]` override. Includes stream tokens (`--local/--import`), gold/jade/sky/rose/teal/violet, surfaces, raised/float/border/rim layers, mono + brand fonts. `ph-*` aliases kept for backward compatibility with existing forms.
- [x] **DONE** — `authGuard`, `adminGuard`, `changePasswordGuard` applied to all protected routes; `/login` and `/change-password` are the only public-ish routes

### Design tokens to port verbatim from mockup
```css
--local:#4ade80; --local-deep:#16a34a; --local-bg:rgba(74,222,128,.08);
--import:#60a5fa; --import-deep:#2563eb; --import-bg:rgba(96,165,250,.08);
```
Plus the full `:root` block (gold, jade, sky, rose, surfaces, etc.). Light theme overrides too.

---

## 2. Supabase schema (Day 2-3)

Write each table as a versioned `.sql` migration. Below is a starting schema — flesh it out as you go.

### Master data
- [x] **DONE — `suppliers`** — table + RLS via `can_access`. Page: KPIs (total/active/EWT-flagged/foreign), full registry table with pills + BIR/non-BIR badges, create modal. EWT compliance banner when non-BIR rows exist. **CSV import** still pending — Phase I polish.
- [x] **DONE — `customers`** — table + RLS. Page: KPIs (total/avg credit/total AR/credit hold), stream filter pills (All/Local/Import), table with utilization bar per row, create modal.
- [x] **DONE — `items`** — table + RLS. Page: KPIs (total/rice count/avg price), table, create modal.
- [x] **DONE — `warehouses`** — table + RLS. Page: KPIs (total/capacity/types), table, create modal.
- [x] **DONE — `vendos`** — table + RLS. Page: KPIs (total/active/needs attention), table with notes, create modal.

- [x] **DONE — `users`** (extends `auth.users`): id (uuid, FK to auth), email, full_name, is_admin, must_change_password, created_at, updated_at. **Diverges from spec:** roles are not a single column — we built a proper M:M (`public.roles` + `public.user_roles`) instead. The spec's `role` enum (`requester|procurement|approver|admin`) should be seeded into `public.roles` whenever you're ready. `department` column still needs to be added — TODO if/when HR module gets built.
- [x] **DONE — `roles`** + **`user_roles`** (M:M) + `has_role(uuid, text)` helper for RLS. Seeded with `admin`, `manager`, `user`. The spec's separate `requester|procurement|approver` enum is now expressed via the access-control system (per-page grants) rather than additional named roles — see access_grants below.
- [x] **DONE — `pages`** + **access bundle catalog** (`access_definitions`, `access_definition_permissions`, `user_access`, `v_user_effective_access`) + `can_access()` + `can_enter_page()`. Developer authors access bundles in SQL migrations; admin assigns them to users at runtime via the `manage-access` Edge Function. Admin role is implicit full-access; manager role is implicit approve; users gain access only via assignments. All 28 modules seeded as page rows. **Catalog contains one bundle: `all_access`** (full permissions on every page, assigned to `admin@gmail.com`). Add more via new migrations as the modules come online. See HANDOFF.md → "Schema — access control" for the full breakdown.
<!-- (Moved up — see Master data section above. All five master-data tables are DONE.) -->

### Procurement
- [ ] **`purchase_requests`**: id, no, date, requester_id, department, purpose, needed_by, status (`draft|for_canvass|canvassed|approved|converted_to_po|cancelled`), canvass_no, po_no, created_at
- [ ] **`pr_lines`**: id, pr_id, line_no, description, item_id (nullable), uom, qty, est_unit_price
- [ ] **`canvasses`**: id, no, date, pr_id, pr_no, currency, vat_treatment, status (`open|awaiting_approval|awarded|closed|cancelled`), created_at
- [ ] **`canvass_items`**: id, canvass_id, line_no, description, uom, qty, winner_supplier_id (nullable)
- [ ] **`canvass_quotes`**: id, canvass_item_id, supplier_id, unit_price (numeric)
- [ ] **`purchase_orders`**: id, no, date, supplier_id, pr_id, canvass_id, category, stream (computed from supplier.origin), total, expected_date, status (`pending_approval|approved|in_transit|boc_clearance|overdue|received|cancelled`), ewt_rate, ewt_amount
- [ ] **`po_lines`**: id, po_id, line_no, description, uom, qty, unit_price, line_total
- [ ] **`goods_receipts`**: id, no, date, po_id, qc_result (passed|partial_reject|rejected), warehouse_id, status (posted|dispute), created_at
- [ ] **`grn_lines`**: id, grn_id, po_line_id, description, uom, qty_po, qty_received

### Sales
- [ ] **`sales_orders`**: id, no, date, customer_id, stream (`local|import`), total, status (`draft|confirmed|credit_hold|in_transit|delivered|cancelled`), delivery_date
- [ ] **`so_lines`**: id, so_id, product, grade, qty_bags, price_per_bag, amount, vat
- [ ] **`sales_invoices`**: id, no, so_id, invoice_amt, vat_amt, amount_due, invoice_date, due_date, status (`current|partial|overdue|paid`)
- [ ] **`deliveries`**: id, no, so_id, truck_no, driver, destination, dispatch_at, status (`scheduled|in_transit|delivered|delayed`), tracking_steps (jsonb)
- [ ] **`collections`**: id, or_no, ts, customer_id, stream (denormalized from customer or SO), invoice_id, gross, ewt, net, mode (cash|bank|check|gcash), deposited_to, status, posted_by_id

### Inventory
- [ ] **`inventory`**: id, sku, product, variety_grade, warehouse_id, stream, on_hand_mt, reserved_mt, available_mt (generated column), unit_cost, total_value (generated), reorder_pt, status (ok|low|critical)
- [ ] **`inventory_transactions`**: id, sku, type (receipt|dispatch|adjust|transfer), qty, source_table, source_id, ts

### Operations
- [ ] **`weighbridge_tickets`**: id, or_no, ts, plate, customer, mode (single|two-way), gross, tare, net, price, payment, operator, notes
- [ ] **`milling_batches`**: id, batch_no, date_planned, date_completed, source, variety, sacks_in, kg_per_sack, rice_out, bran_out, husk_out, recovery_pct, cost_per_rice_sack, total_cost, status (planned|in_progress|completed)
- [ ] **`toll_milling`**: id, or_no, date, customer, variety, sacks_in, kg_per_sack, rice_out, bran_out, husk_out, recovery_pct, price_per_sack, total, byproduct_disposition (customer|rjl)

### Side modules
- [ ] **`vendo_entries`**: id, vendo_id, date, type (income|expense), category, amount, notes
- [ ] **`activity_log`**: id, user_id, action, entity, entity_id, ts, payload (jsonb)
- [ ] **`alerts`**: id, type (info|warning|error|ok), title, body, entity, entity_id, target_role, read_at, created_at

### Computed views (materialized or regular)
- [ ] **`v_customer_ar`** — sum unpaid invoices per customer, expose ar_balance
- [ ] **`v_customer_ytd`** — sum YTD sales per customer
- [ ] **`v_inventory_value_by_stream`** — Local vs Import total inventory value
- [ ] **`v_revenue_daily_by_stream`** — daily revenue Local vs Import, used by Dashboard trend chart

### RLS policies (write tests as you go)
- [x] **DONE (partial)** — RLS enabled on `public.users` (read/update own row only, column-level grant restricts updates to `full_name`), `public.roles` (read-all for authenticated), `public.user_roles` (read own assignments only), `public.pages` (read-all for authenticated), `public.access_grants` (read own only). No client-side write policies — admin operations go through Edge Functions with `service_role`.
- [ ] Authenticated users can read most tables (start permissive) — apply to remaining tables as they're added
- [x] **DONE (mechanism in place)** — PR/Canvass/PO etc. write policies should use `public.can_access(auth.uid(), 'purchase-requests', 'edit')` etc. The function is built; module migrations just need to call it from their `using/with check` clauses.
- [ ] PR write: explicit page-level grants via access_grants → use `can_access(uid, 'purchase-requests', 'create' / 'edit')`
- [ ] Canvass write: → `can_access(uid, 'canvasses', 'create' / 'edit')`
- [ ] Approval transitions: → `can_access(uid, 'purchase-orders', 'approve')` etc. Manager role gets this implicitly; users need explicit grant.
- [x] **DONE** — No anonymous access. Edge Function `create-user` verifies JWT and checks against hardcoded `ADMIN_EMAILS` allowlist before any DB write. *(That allowlist will be replaced by `has_role(uid, 'admin')` once `manage-access` Edge Function is built.)*

### Triggers / functions
- [ ] On canvass `awarded` → create `purchase_orders` row(s) (one per winning supplier), set `purchase_requests.status = 'converted_to_po'`
- [ ] On PO status → `received` → create `goods_receipts` placeholder
- [ ] On `sales_invoices` due_date < today and status != paid → set `overdue`
- [ ] Auto-generate document numbers per series (PR-YYYY-NNNN, CNV-YYYY-NNNN, PO-YYYY-NNNN, etc.) via a `next_doc_no(series text)` function backed by a `doc_counters` table

---

## 3. Module build order (recommended sequence)

Each module = one Angular feature module / route group. Build in this order so each next module has its dependencies ready.

### Phase A — Foundation (Week 1)
- [x] **DONE — Auth** (login, change-password forced flow, admin-creates-users panel). **Diverges from spec:** no public signup (intentional — admin-managed model), no password-reset UI yet *(easy add later via `supabase.auth.resetPasswordForEmail()`)*. The "signup placeholder" item is intentionally **not** going to happen — public signup is closed by design.
- [x] **DONE — App shell** (sidebar + topbar + breadcrumb). Sidebar shows the user's display name + role pill at the bottom; admin nav group appears only when `auth.isAdmin()` is true. Topbar shows current route's label + group as breadcrumb.
- [x] **DONE — Theme toggle**. Dark default per mockup; persists to localStorage; toggle in topbar.
- [ ] **Shared components**: KPI card styling is inline in dashboard; full extraction into components pending. Still to build: `stream-card`, `data-table`, `pill`, `status-badge`, `modal`, `form-field`, `chart-trend`, `chart-donut`, `period-filter`. Build JIT when each module's first consumer needs them.

### Phase B — Master data (Week 1-2)
- [x] **DONE — Suppliers** — CRUD (list + create modal). KPIs live. CSV import is **not** done — Phase I polish.
- [x] **DONE — Customers** — CRUD with stream filter pill (All / Local / Import). Credit utilization bar shown per row. AR balance read from column (will be maintained by AR triggers when AR module is built).
- [x] **DONE — Items** — CRUD.
- [x] **DONE — Warehouses** — CRUD.
- [x] **DONE — Vendos** — CRUD (was Phase G but the shape matches B exactly, did it now).

### Phase C — Procurement flow (Week 2-3)
Build in order; the auto-creates are the hard part.
- [ ] **Purchase Requests**
  - [ ] List with KPIs (Drafts+ForCanvass, Canvassing, Converted, Aged > 7d)
  - [ ] Create/edit modal with dynamic line items, live total
  - [ ] Role-gated actions: Submit (Requester), Issue Canvass (Procurement), View Canvass, View PO
- [ ] **Canvass**
  - [ ] List with KPIs (Open, Awaiting Approval, Awarded, Avg Suppliers)
  - [ ] Create modal: pick PR (only `for_canvass` ones), pick 2–3 suppliers, enter quotes per item per supplier, pick winner per line
  - [ ] Submit-for-approval gating (winners required)
  - [ ] AOQ view modal with print CSS
  - [ ] Award action (Approver) → calls Supabase function that creates PO(s) + updates PR
- [ ] **Purchase Orders**
  - [ ] Split panel: Local Procurement card + Import Procurement card
  - [ ] Each card = filtered table with subtotal row
  - [ ] Status workflow buttons (Approve, Mark Received)
  - [ ] EWT compliance alert (live count of non-BIR active POs)
- [ ] **Goods Receipt**
  - [ ] Mark Received modal: received qty per line + variance + QC + warehouse
  - [ ] Posting creates inventory_transactions

### Phase D — Sales flow (Week 3-4)
- [ ] **Sales Orders**
  - [ ] Split panel: 🌾 Local Trading Register + 🚢 Import Trading Register
  - [ ] KPIs: Local Trading MTD, Import Trading MTD, Open Orders, Service Revenue (toll milling + weighbridge MTD — pulled from `toll_milling` + `weighbridge_tickets`)
  - [ ] Create SO modal
- [ ] **Delivery**
  - [ ] DO list
  - [ ] Delivery Tracker UI (the stepper from the mockup)
- [ ] **Accounts Receivable**
  - [ ] Split panel: Local AR + Import AR
  - [ ] Aging breakdown chart (≤30d / 31-60 / 61-90 / >90)
  - [ ] Record Payment modal → creates `collections` row
  - [ ] Credit Hold flag enforcement on customer (prevent new SO if `ar_balance > credit_limit`)
- [ ] **DCPR (Daily Collection & Payment Report)**
  - [ ] Date navigator (prev/next/pick)
  - [ ] Split Collections card: 🌾 Local Collections + 🚢 Import Collections (stream taken from invoice's source SO)
  - [ ] Disbursements card (CV register)
  - [ ] Combined gradient strip showing Local / Import / Net-after-EWT
  - [ ] Close Day action (locks all entries for the date)

### Phase E — Inventory & operations (Week 4-5)
- [ ] **Inventory**
  - [ ] Split Stock Ledger: 🌾 Local Stock + 🚢 Import Stock
  - [ ] Warehouse utilization bars
  - [ ] Stock Transfer + Stock Adjustment modals
- [ ] **Weighbridge** — already has its own logic in mockup, port it
- [ ] **Milling** — Internal Batches + Toll Milling tabs
- [ ] **Quality Inspection** — port from mockup

### Phase F — Accounting & compliance (Week 5-6)
- [ ] **Accounts Payable** — port from mockup
- [ ] **General Ledger** — port from mockup
- [ ] **BIR Compliance** — VAT analysis, SLS/SLP, EWT tracking
- [ ] **Treasury** — cash position dashboard

### Phase G — Side & supporting modules (Week 6+)
- [ ] **Passive Income / Vendos**
  - [ ] Vendos table (add/edit/delete machines)
  - [ ] Cash Movements (income + expense entries)
  - [ ] KPIs: Active Vendos, Income MTD, Expenses MTD, Net MTD
  - [ ] Filter by vendo
- [ ] **Importation** — shipment tracker
- [ ] **HR** — employee directory
- [ ] **Payroll** — port from mockup
- [ ] **Reports & Analytics** — port from mockup

### Phase H — Dashboard (Week 6-7)
**Build this last** so all the underlying data is real.
- [ ] **Date filter** pill bar: YTD (default) / Monthly / Weekly / Daily / Custom (2 date inputs)
- [ ] **4 KPI cards**: Local Trading [period], Import Trading [period], AR Outstanding, Active POs
- [ ] **Revenue Trend chart** — full-width SVG line+area chart, Local vs Import, with composition pills inline in the card header
- [ ] **Composition pills** — mini progress bar + % per stream, in the trend chart header
- [ ] **Top Customers** — horizontal bar chart, top 5, color-coded by stream
- [ ] **Recent Activity** — compact 4-column table (Reference, Party, Amount, Status)
- [ ] Chart bucketing rules:
  - YTD → monthly buckets
  - Monthly → daily in current month
  - Weekly → 7 daily points
  - Daily → 14-day context window
  - Custom → ≥60 days = monthly, else daily

### Phase I — Polish (Week 7+)
- [ ] Print CSS for AOQ, PO, PR, GRN
- [ ] Responsive (< 880px stacks the Local/Import cards vertically)
- [ ] Empty states everywhere
- [ ] Loading skeletons
- [ ] Error toasts
- [ ] Confirm dialogs for destructive actions
- [ ] Keyboard shortcuts (`g d` = dashboard, `g p` = PR, etc.)
- [ ] Activity log + audit trail

---

## 4. Design system — port these exactly

### Stream color tokens (CSS variables)
```css
--local:#4ade80; --local-deep:#16a34a; --local-bg:rgba(74,222,128,.08);
--import:#60a5fa; --import-deep:#2563eb; --import-bg:rgba(96,165,250,.08);
```

### Stream card pattern
- Local card: 4px left border `var(--local)`, table subtotal row uses `var(--local-bg)`
- Import card: same with `var(--import)`
- Header chip (`stream-chip`): pill, tinted background, stream-deep text color

### Layout rhythm on split panels
1. KPI row (4 cards) — period-aware
2. Local card (green border) — full table + subtotal row
3. Import card (blue border) — full table + subtotal row
4. Optional info alert below

### Typography
- KPI value: 26px, font-weight 800, monospace, letter-spacing -1px
- KPI label: 10.5px, uppercase, letter-spacing .8px, color sub
- Card title: 13.5px, font-weight 700
- Subtotal row: background `var(--local-bg)` or `var(--import-bg)`, font-weight 600

### Charts
- Use the exact SVG patterns from the mockup `drawTrend()` / `drawDonut()` / `drawCustomers()` functions
- Smooth bezier path generator (Catmull-Rom approximation) is in the mockup — copy it
- Hover tooltips are positioned via container `getBoundingClientRect()` math

### Don'ts
- Don't use bright reds/yellows for non-error states
- Don't put more than 4 KPIs in a row on the dashboard
- Don't add a "Local | Import" orientation banner above split panels — the colored card borders already convey the split
- Don't show the same value twice (we removed a "Streams Comparison" widget for this reason)

---

## 5. Working with Claude Opus — tips

You're using Claude Opus to help build this. Some things that work well based on how the mockup was built:

### Give it the mockup as context
When you ask Claude to build a new Angular component, **always paste in the mockup's equivalent HTML section** as the design source. Claude will replicate layout, copy, and styling much faster than from a verbal description.

### Build one screen at a time
Each module (PR, Canvass, etc.) is its own conversation. Don't try to build everything in one mega-prompt — Claude does its best work in focused sessions.

### Ask for the schema migration first
For each module, ask: *"Write the Supabase migration SQL for the [module] tables, including RLS policies. Use this schema sketch: [paste from TODO.md]"*. Run + test the migration before writing any Angular code.

### State the acceptance criteria
End each prompt with what "done" looks like. e.g. *"Done = list renders from Supabase, create modal works, role gating blocks unauthorized actions"*.

### Don't accept "// TODO: implement" stubs
If Claude leaves a placeholder, push back: *"Implement that fully, don't stub it"*.

### Run the mockup side-by-side
Keep `graincore_erp_world_class.html` open in one browser tab and your Angular dev server in another. When the design drifts, you'll see it.

### Test the auto-create flows manually
The Canvass-award-creates-PO chain is the trickiest part. After you build it, manually walk through: create PR → submit → issue canvass → enter quotes → pick winner → submit for approval → award → confirm PO row exists with correct supplier, items, total, EWT. Reload the page between each step to make sure persistence works.

### Use Claude's planning mode for tricky flows
For the Canvass winner-picking UI, the GRN reconciliation, or the Dashboard chart bucketing logic, ask Claude to **plan first**, then implement. Saves rework.

### Don't let Claude reinvent the design system
Paste the CSS tokens and component class names from this doc into every conversation so it stops generating fresh styles each time.

---

## 6. Sample acceptance criteria (use this template)

For each module, you should have a checklist like:

```
Module: Purchase Requests
- [ ] List page renders from Supabase
- [ ] KPI cards show live counts
- [ ] Create modal validates required fields
- [ ] Line items can be added/removed dynamically
- [ ] Total recalculates live
- [ ] Save Draft → status=draft, not visible in canvass picker
- [ ] Save & Submit → status=for_canvass, visible to procurement
- [ ] Edit only allowed on draft + by original requester
- [ ] Delete only allowed on draft + with confirm dialog
- [ ] RLS: requester sees only own org's PRs; procurement sees all
- [ ] Role pill switches the available row actions
- [ ] Aged > 7 days highlights in KPI
- [ ] Print works
```

---

## 7. Known good defaults (from the mockup, copy directly)

### Suppliers seed (9 rows)
See `PROC_SUPPLIERS` array in the mockup's procurement IIFE. Same fields, same data.

### Document number format
- `PR-YYYY-NNNN` (zero-padded 4-digit)
- `CNV-YYYY-NNNN`
- `PO-YYYY-NNNN`
- `GRN-YYYY-NNNN`
- `OR-YYYY-NNNN`
- `SI-YYYY-NNNN`
- `DO-YYYY-NNNN`

### Document statuses (exact strings to use)
- PR: `Draft | For Canvass | Canvassed | Approved | Converted to PO | Cancelled`
- Canvass: `Open | Awaiting Approval | Awarded | Closed | Cancelled`
- PO: `Pending Approval | Approved | In Transit | BOC Clearance | Overdue | Received | Cancelled`
- GRN: `Posted | Dispute`
- SO: `Draft | Confirmed | Credit Hold | In Transit | Delivered | Cancelled`
- AR Invoice: `Current | Partial | Overdue | Paid`

### EWT rule
- Suppliers with `bir_registered = false` get 1% EWT on PO totals
- Compute on PO creation, show as chip on PO row + alert at top of PO panel
- Aggregate non-BIR active POs into "EWT Compliance" warning with total to remit

---

## 8. Open questions / decisions to confirm with the team

- [ ] Who is the "Approver" role — owner only, or department heads can approve up to a limit?
- [ ] Does the GRN trigger inventory_transactions automatically, or does someone need to "Post to Inventory" as a second step?
- [ ] Multi-currency: imports are quoted in USD/THB — do we store at quote-time FX rate, or revalue at PO/landed cost time?
- [ ] Multi-tenant? Single tenant? (Mockup assumes single org)
- [ ] Will there be a mobile app, or is the responsive web view enough?

---

**Last note:** the mockup is *fully functional* as a localStorage prototype — you can use it to validate any business-logic question by trying it in the browser. If Claude isn't sure how a flow should work, open the mockup, run the flow, and screenshot the result as reference.

Good luck. Ship something boring that works before you ship something flashy that doesn't.
