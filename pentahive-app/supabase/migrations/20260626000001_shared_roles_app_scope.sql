-- Stage 1 of the WVW <-> xavi co-tenancy (see PENTAHIVE_ERP/Skill/unification.md).
-- Make public.roles a SHARED, app-scoped table. Both ERPs live in this one project
-- (iblrotkczdrztenchnzx); each owns its own role rows via the `app` column.
--   * WVW keeps admin/manager/user   (app='wvw')
--   * xavi mirrors its 7 role_t values (app='xavi')
-- xavi's runtime still uses its role_t ENUM for assignment/RPC logic; these rows are
-- the shared catalogue/registry only. No FK from xavi points here.
-- WVW behaviour is preserved: its single roles dropdown query filters app='wvw'.

-- 1. App-scope column. Existing WVW rows backfill to 'wvw' via the default.
alter table public.roles
  add column if not exists app text not null default 'wvw';

-- 2. Roles are unique PER APP (each app has its own namespace), not globally.
alter table public.roles drop constraint if exists roles_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_app_name_key') then
    alter table public.roles add constraint roles_app_name_key unique (app, name);
  end if;
end $$;

create index if not exists roles_app_idx on public.roles (app);

-- 3. Mirror xavi's role_t values as catalogue rows (app='xavi').
insert into public.roles (app, name, description) values
  ('xavi', 'Owner',      'xavi: full access; implicitly admin (manages users/roles)'),
  ('xavi', 'Manager',    'xavi: full access across all modules'),
  ('xavi', 'Accounting', 'xavi: finance, procurement, AP, ledgers, reports, master data'),
  ('xavi', 'Stockman',   'xavi: inventory, MRP, transfers, fulfillment, items'),
  ('xavi', 'Dispatcher', 'xavi: sales orders, fulfillment, transfers, branch stock'),
  ('xavi', 'Cashier',    'xavi: POS, cashier, sales orders, prooflist'),
  ('xavi', 'Salesman',   'xavi: POS, sales orders, estimates, credit memos, KPI')
on conflict (app, name) do nothing;
