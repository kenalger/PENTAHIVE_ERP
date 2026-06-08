-- Seed a catalog of role-shaped access bundles for the milling workspace.
-- Before this migration only `all_access` existed, which forced admins to
-- grant new employees full system access (which they shouldn't). This adds
-- 7 bundles that correspond to real ERP job functions in a rice-mill setup.
-- Created 2026-06-03.
--
-- Authoring pattern (per HANDOFF "Access bundles" section):
--   1. insert into access_definitions (code, name, description)
--   2. insert into access_definition_permissions (access_id, page_id, ...flags)
-- Both are idempotent via on conflict do nothing.
--
-- Every operational bundle includes `dashboard` view so the user lands on a
-- real page after login. Admins still get full access via the `admin` role
-- bypass in can_access() — these bundles are for non-admin users.

-- ─── 1. Procurement Officer ───────────────────────────────────────────────
insert into public.access_definitions (code, name, description) values
  ('procurement_officer', 'Procurement Officer',
   'Manage purchase requests, canvasses, POs, and goods receipts. Read suppliers and items.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'procurement_officer'),
  (select id from public.pages where code = p.code),
  p.v, p.c, p.e, p.d, p.a
from (values
  ('dashboard',         true,  false, false, false, false),
  ('purchase-requests', true,  true,  true,  false, false),
  ('canvasses',         true,  true,  true,  false, false),
  ('purchase-orders',   true,  true,  true,  false, false),
  ('goods-receipts',    true,  true,  true,  false, false),
  ('suppliers',         true,  true,  true,  false, false),
  ('items',             true,  false, true,  false, false),
  ('warehouses',        true,  false, false, false, false),
  ('inventory',         true,  false, false, false, false)
) as p(code, v, c, e, d, a)
on conflict (access_id, page_id) do nothing;

-- ─── 2. Sales Officer ─────────────────────────────────────────────────────
insert into public.access_definitions (code, name, description) values
  ('sales_officer', 'Sales Officer',
   'Manage customers, sales orders, and deliveries. Read inventory and AR for visibility.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'sales_officer'),
  (select id from public.pages where code = p.code),
  p.v, p.c, p.e, p.d, p.a
from (values
  ('dashboard',           true,  false, false, false, false),
  ('customers',           true,  true,  true,  false, false),
  ('sales-orders',        true,  true,  true,  false, false),
  ('deliveries',          true,  true,  true,  false, false),
  ('items',               true,  false, false, false, false),
  ('inventory',           true,  false, false, false, false),
  ('accounts-receivable', true,  false, false, false, false),
  ('dcpr',                true,  false, false, false, false)
) as p(code, v, c, e, d, a)
on conflict (access_id, page_id) do nothing;

-- ─── 3. Warehouse Keeper ──────────────────────────────────────────────────
insert into public.access_definitions (code, name, description) values
  ('warehouse_keeper', 'Warehouse Keeper',
   'Manage inventory, warehouses, and weighbridge tickets. Read GRNs and deliveries to reconcile movements.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'warehouse_keeper'),
  (select id from public.pages where code = p.code),
  p.v, p.c, p.e, p.d, p.a
from (values
  ('dashboard',      true,  false, false, false, false),
  ('inventory',      true,  true,  true,  false, false),
  ('warehouses',     true,  true,  true,  false, false),
  ('weighbridge',    true,  true,  true,  false, false),
  ('items',          true,  false, false, false, false),
  ('goods-receipts', true,  false, false, false, false),
  ('deliveries',     true,  false, false, false, false)
) as p(code, v, c, e, d, a)
on conflict (access_id, page_id) do nothing;

-- ─── 4. Mill Operator ─────────────────────────────────────────────────────
insert into public.access_definitions (code, name, description) values
  ('mill_operator', 'Mill Operator',
   'Run milling batches and toll-milling jobs, log quality inspections, weigh deliveries.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'mill_operator'),
  (select id from public.pages where code = p.code),
  p.v, p.c, p.e, p.d, p.a
from (values
  ('dashboard',          true,  false, false, false, false),
  ('milling',            true,  true,  true,  false, false),
  ('quality-inspection', true,  true,  true,  false, false),
  ('weighbridge',        true,  true,  true,  false, false),
  ('inventory',          true,  false, false, false, false),
  ('items',              true,  false, false, false, false)
) as p(code, v, c, e, d, a)
on conflict (access_id, page_id) do nothing;

-- ─── 5. Accountant ────────────────────────────────────────────────────────
insert into public.access_definitions (code, name, description) values
  ('accountant', 'Accountant',
   'Manage AR, AP, general ledger, BIR compliance, treasury, and daily DCPR. Read source documents.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'accountant'),
  (select id from public.pages where code = p.code),
  p.v, p.c, p.e, p.d, p.a
from (values
  ('dashboard',           true,  false, false, false, false),
  ('accounts-receivable', true,  true,  true,  false, false),
  ('accounts-payable',    true,  true,  true,  false, false),
  ('general-ledger',      true,  true,  true,  false, false),
  ('bir-compliance',      true,  true,  true,  false, false),
  ('treasury',            true,  true,  true,  false, false),
  ('dcpr',                true,  true,  true,  false, false),
  ('sales-orders',        true,  false, false, false, false),
  ('purchase-orders',     true,  false, false, false, false),
  ('goods-receipts',      true,  false, false, false, false),
  ('deliveries',          true,  false, false, false, false),
  ('reports',             true,  false, false, false, false)
) as p(code, v, c, e, d, a)
on conflict (access_id, page_id) do nothing;

-- ─── 6. HR Officer ────────────────────────────────────────────────────────
insert into public.access_definitions (code, name, description) values
  ('hr_officer', 'HR Officer',
   'Manage employees and payroll. Read-only dashboard.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'hr_officer'),
  (select id from public.pages where code = p.code),
  p.v, p.c, p.e, p.d, p.a
from (values
  ('dashboard', true,  false, false, false, false),
  ('hr',        true,  true,  true,  false, false),
  ('payroll',   true,  true,  true,  false, false)
) as p(code, v, c, e, d, a)
on conflict (access_id, page_id) do nothing;

-- ─── 7. Read-Only Viewer ──────────────────────────────────────────────────
-- For executives, auditors, or anyone who needs visibility without write rights.
-- Excludes HR/payroll (privacy) and admin pages (admin-role-gated anyway).
insert into public.access_definitions (code, name, description) values
  ('read_only_viewer', 'Read-Only Viewer',
   'View everything in the milling workspace (no writes). Excludes HR, payroll, and admin pages.')
on conflict (code) do nothing;

insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'read_only_viewer'),
  pg.id,
  true, false, false, false, false
from public.pages pg
where pg.workspace = 'milling'
  and pg.code not in ('hr', 'payroll')
on conflict (access_id, page_id) do nothing;
