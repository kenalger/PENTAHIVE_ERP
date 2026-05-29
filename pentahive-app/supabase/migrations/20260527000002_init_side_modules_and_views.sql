-- Side modules (vendo_entries, activity_log, alerts) + computed views.
-- Created 2026-05-27.

-- =============================================================
-- vendo_entries — income/expense per vending machine
-- =============================================================
create table if not exists public.vendo_entries (
  id          uuid primary key default gen_random_uuid(),
  vendo_id    uuid not null references public.vendos(id) on delete cascade,
  date        date not null default current_date,
  type        text not null check (type in ('income','expense')),
  category    text,
  amount      numeric(14,2) not null check (amount >= 0),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists vendo_entries_vendo_idx on public.vendo_entries(vendo_id);
create index if not exists vendo_entries_date_idx on public.vendo_entries(date desc);

alter table public.vendo_entries enable row level security;

drop policy if exists ve_select on public.vendo_entries;
create policy ve_select on public.vendo_entries for select to authenticated using (public.can_access(auth.uid(), 'vendos', 'view'));
drop policy if exists ve_insert on public.vendo_entries;
create policy ve_insert on public.vendo_entries for insert to authenticated with check (public.can_access(auth.uid(), 'vendos', 'create'));
drop policy if exists ve_update on public.vendo_entries;
create policy ve_update on public.vendo_entries for update to authenticated using (public.can_access(auth.uid(), 'vendos', 'edit')) with check (public.can_access(auth.uid(), 'vendos', 'edit'));
drop policy if exists ve_delete on public.vendo_entries;
create policy ve_delete on public.vendo_entries for delete to authenticated using (public.can_access(auth.uid(), 'vendos', 'delete'));

-- =============================================================
-- activity_log — generic audit trail, populated by trigger
-- =============================================================
create table if not exists public.activity_log (
  id          bigserial primary key,
  user_id     uuid references public.users(id) on delete set null,
  action      text not null check (action in ('insert','update','delete')),
  entity      text not null,                              -- table name
  entity_id   uuid,                                       -- the row's PK (best-effort uuid)
  payload     jsonb,                                      -- {before, after} for updates; full row for insert/delete
  ts          timestamptz not null default now()
);
create index if not exists activity_log_ts_idx on public.activity_log(ts desc);
create index if not exists activity_log_entity_idx on public.activity_log(entity, ts desc);
create index if not exists activity_log_user_idx on public.activity_log(user_id, ts desc);

alter table public.activity_log enable row level security;

-- Only admins can read activity (sensitive). Writes happen via SECURITY DEFINER trigger.
drop policy if exists alog_select on public.activity_log;
create policy alog_select on public.activity_log
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Generic logger. SECURITY DEFINER so it can write regardless of caller's RLS.
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_payload jsonb;
begin
  if (TG_OP = 'DELETE') then
    v_id := (to_jsonb(OLD) ->> 'id')::uuid;
    v_payload := jsonb_build_object('before', to_jsonb(OLD));
  elsif (TG_OP = 'UPDATE') then
    v_id := (to_jsonb(NEW) ->> 'id')::uuid;
    v_payload := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  else
    v_id := (to_jsonb(NEW) ->> 'id')::uuid;
    v_payload := jsonb_build_object('after', to_jsonb(NEW));
  end if;

  insert into public.activity_log (user_id, action, entity, entity_id, payload)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_id, v_payload);

  return coalesce(NEW, OLD);
exception when others then
  -- Audit logging must never break the operation that triggered it.
  return coalesce(NEW, OLD);
end;
$$;

-- Attach to high-value workflow tables.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'purchase_requests', 'canvasses', 'purchase_orders', 'goods_receipts',
      'sales_orders', 'deliveries', 'sales_invoices', 'collections',
      'inventory', 'inventory_transactions',
      'milling_batches', 'toll_milling', 'weighbridge_tickets', 'quality_inspections',
      'suppliers', 'customers', 'items', 'warehouses', 'vendos', 'vendo_entries',
      'user_access', 'access_definitions'
    ])
  loop
    execute format('drop trigger if exists audit_%I on public.%I', t, t);
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.log_activity()',
      t, t
    );
  end loop;
end$$;

-- =============================================================
-- alerts — workflow notifications
-- =============================================================
create table if not exists public.alerts (
  id           uuid primary key default gen_random_uuid(),
  type         text not null check (type in ('info','warning','error','ok')),
  title        text not null,
  body         text,
  entity       text,
  entity_id    uuid,
  target_role  text,                                     -- 'admin' | 'manager' | 'user' | null = everyone
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists alerts_created_idx on public.alerts(created_at desc);
create index if not exists alerts_unread_idx on public.alerts(read_at) where read_at is null;

alter table public.alerts enable row level security;

-- Visibility: everyone sees role-null alerts; otherwise only role-matched users.
drop policy if exists alerts_select on public.alerts;
create policy alerts_select on public.alerts
  for select to authenticated
  using (
    target_role is null
    or public.has_role(auth.uid(), target_role)
  );

-- Writes restricted to admins (or service_role).
drop policy if exists alerts_write on public.alerts;
create policy alerts_write on public.alerts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- Computed views — used by future dashboard widgets
-- =============================================================

-- 1) v_customer_ar — live AR per customer
create or replace view public.v_customer_ar
with (security_invoker = true)
as
select
  c.id                                   as customer_id,
  c.code, c.name, c.stream,
  coalesce(sum(case when si.status in ('current','partial','overdue')
                    then si.amount_due else 0 end), 0)::numeric(14,2) as ar_balance,
  count(*) filter (where si.status = 'overdue')::int                   as overdue_count,
  coalesce(sum(case when si.status = 'overdue'
                    then si.amount_due else 0 end), 0)::numeric(14,2) as overdue_amount
from public.customers c
left join public.sales_orders so on so.customer_id = c.id
left join public.sales_invoices si on si.so_id = so.id
group by c.id, c.code, c.name, c.stream;

-- 2) v_customer_ytd — sum YTD sales per customer
create or replace view public.v_customer_ytd
with (security_invoker = true)
as
select
  c.id                            as customer_id,
  c.code, c.name, c.stream,
  coalesce(sum(so.total) filter (where extract(year from so.date) = extract(year from now())
                                       and so.status not in ('cancelled','credit_hold')), 0)::numeric(14,2) as ytd_sales,
  count(so.id) filter (where extract(year from so.date) = extract(year from now()))::int as ytd_order_count
from public.customers c
left join public.sales_orders so on so.customer_id = c.id
group by c.id, c.code, c.name, c.stream;

-- 3) v_inventory_value_by_stream — Local vs Import inventory totals
create or replace view public.v_inventory_value_by_stream
with (security_invoker = true)
as
select
  stream,
  count(*)::int                            as sku_count,
  coalesce(sum(on_hand_mt), 0)::numeric(14,2)  as total_on_hand_mt,
  coalesce(sum(reserved_mt), 0)::numeric(14,2) as total_reserved_mt,
  coalesce(sum(available_mt), 0)::numeric(14,2)as total_available_mt,
  coalesce(sum(total_value), 0)::numeric(14,2) as total_value
from public.inventory
group by stream;

-- 4) v_revenue_daily_by_stream — daily revenue Local vs Import (for Dashboard trend chart)
create or replace view public.v_revenue_daily_by_stream
with (security_invoker = true)
as
select
  so.date,
  so.stream,
  count(*)::int                       as order_count,
  coalesce(sum(so.total), 0)::numeric(14,2) as revenue
from public.sales_orders so
where so.status not in ('cancelled')
group by so.date, so.stream
order by so.date desc, so.stream;
