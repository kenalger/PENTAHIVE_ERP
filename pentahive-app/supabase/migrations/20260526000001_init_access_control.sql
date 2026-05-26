-- Role-based + per-page access control.
-- Created 2026-05-26.
--
-- Model (per user's design decisions):
--   1. admin role  → implicit full access on everything (no grant rows needed).
--   2. manager role → implicit 'approve' on everything; other actions need grants.
--   3. user role   → starts with nothing, gets access via access_grants rows.
-- AND pages can ALSO declare their own minimum role requirement (pages.requires_role).

-- 1. Rename 'employee' role to 'user' to match the user's terminology.
update public.roles
set name = 'user',
    description = 'Standard user account — gets access via explicit page-level grants'
where name = 'employee';

-- 2. Pages — canonical list of app pages/modules.
-- requires_role:
--   null     → any signed-in user with grants can enter
--   'manager'→ only admin or manager roles can enter (grants still apply on top)
--   'admin'  → only admin role can enter
create table if not exists public.pages (
  id            smallserial primary key,
  code          text not null unique,
  label         text not null,
  description   text,
  requires_role text check (requires_role in ('manager', 'admin')),
  created_at    timestamptz not null default now()
);

insert into public.pages (code, label, description, requires_role) values
  ('dashboard',           'Dashboard',            'Main analytics and KPIs',                       null),
  ('suppliers',           'Suppliers',            'Master data — suppliers',                        null),
  ('customers',           'Customers',            'Master data — customers',                        null),
  ('items',               'Items',                'Master data — items',                            null),
  ('warehouses',          'Warehouses',           'Master data — warehouses',                       null),
  ('vendos',              'Vendos',               'Passive income / vending machines',              null),
  ('purchase-requests',   'Purchase Requests',    'Procurement — PRs',                              null),
  ('canvasses',           'Canvasses',            'Procurement — supplier canvasses',               null),
  ('purchase-orders',     'Purchase Orders',      'Procurement — POs',                              null),
  ('goods-receipts',      'Goods Receipts',       'Procurement — GRNs',                             null),
  ('sales-orders',        'Sales Orders',         'Sales — orders',                                 null),
  ('deliveries',          'Deliveries',           'Sales — delivery tracking',                      null),
  ('accounts-receivable', 'Accounts Receivable',  'Sales — AR',                                     null),
  ('dcpr',                'DCPR',                 'Daily Collection & Payment Report',              null),
  ('inventory',           'Inventory',            'Stock management',                               null),
  ('weighbridge',         'Weighbridge',          'Operations — weighbridge tickets',               null),
  ('milling',             'Milling',              'Operations — internal + toll milling',           null),
  ('quality-inspection',  'Quality Inspection',   'QC',                                             null),
  ('accounts-payable',    'Accounts Payable',     'Accounting — AP',                                null),
  ('general-ledger',      'General Ledger',       'Accounting — GL',                                null),
  ('bir-compliance',      'BIR Compliance',       'VAT analysis, SLS/SLP, EWT tracking',            null),
  ('treasury',            'Treasury',             'Cash position dashboard',                        null),
  ('importation',         'Importation',          'Shipment tracker',                               null),
  ('hr',                  'HR',                   'Employee directory',                             null),
  ('payroll',             'Payroll',              'Payroll',                                        null),
  ('reports',             'Reports',              'Reports & analytics',                            null),
  ('admin-users',         'Admin — Users',        'User management page',                           'admin'),
  ('admin-access',        'Admin — Access',       'Page-level access control',                      'admin')
on conflict (code) do nothing;

-- 3. Access grants — one row per (user, page).
create table if not exists public.access_grants (
  user_id     uuid     not null references public.users(id) on delete cascade,
  page_id     smallint not null references public.pages(id) on delete cascade,
  can_view    boolean  not null default false,
  can_create  boolean  not null default false,
  can_edit    boolean  not null default false,
  can_delete  boolean  not null default false,
  can_approve boolean  not null default false,
  granted_by  uuid     references public.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, page_id)
);

create index if not exists access_grants_user_idx on public.access_grants (user_id);
create index if not exists access_grants_page_idx on public.access_grants (page_id);

-- 4. can_access(uid, page_code, action) — action-level authorization.
-- Use this for BUTTON-level checks ("can this user approve?", "can this user delete?")
-- and from RLS policies on other tables.
-- p_action ∈ {'view','create','edit','delete','approve'}.
create or replace function public.can_access(
  p_user_id   uuid,
  p_page_code text,
  p_action    text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_role(p_user_id, 'admin') then true
    when public.has_role(p_user_id, 'manager') and p_action = 'approve' then true
    else exists (
      select 1
      from public.access_grants ag
      join public.pages p on p.id = ag.page_id
      where ag.user_id = p_user_id
        and p.code = p_page_code
        and case p_action
              when 'view'    then ag.can_view
              when 'create'  then ag.can_create
              when 'edit'    then ag.can_edit
              when 'delete'  then ag.can_delete
              when 'approve' then ag.can_approve
              else false
            end
    )
  end;
$$;

-- 5. can_enter_page(uid, page_code) — page-level entry check for route guards.
-- Combines pages.requires_role (page-declared role gate) with can_access(view).
-- Returns false if the page doesn't exist (safer than null).
create or replace function public.can_enter_page(
  p_user_id   uuid,
  p_page_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_requires text;
  v_exists   boolean;
begin
  select requires_role, true into v_requires, v_exists
  from public.pages where code = p_page_code;

  if not coalesce(v_exists, false) then
    return false;  -- unknown page
  end if;

  -- Page-declared role gate
  if v_requires = 'admin' then
    return public.has_role(p_user_id, 'admin');
  elsif v_requires = 'manager' then
    return public.has_role(p_user_id, 'admin')
        or public.has_role(p_user_id, 'manager');
  end if;

  -- Otherwise: view permission (admin/manager always pass via can_access semantics)
  return public.can_access(p_user_id, p_page_code, 'view');
end;
$$;

-- 6. RLS
alter table public.pages enable row level security;

drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages
  for select to authenticated
  using (true);

alter table public.access_grants enable row level security;

drop policy if exists access_grants_select_self on public.access_grants;
create policy access_grants_select_self on public.access_grants
  for select to authenticated
  using (user_id = auth.uid());
