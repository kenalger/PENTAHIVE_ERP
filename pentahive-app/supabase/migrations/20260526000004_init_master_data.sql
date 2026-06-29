-- Master data tables: suppliers, customers, items, warehouses, vendos.
-- RLS policies delegate authorization to public.can_access(uid, page_code, action)
-- so the access-control system stays the single source of truth.
-- Created 2026-05-26.

-- =============================================================
-- suppliers
-- =============================================================
create table if not exists public.milling_suppliers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  name            text not null,
  tin             text,
  category        text not null check (category in ('paddy','import','packaging','equipment','office')),
  origin          text,                                      -- e.g. 'Local', 'Thailand'
  bir_registered  boolean not null default true,
  ewt_rate        numeric(5,2) not null default 0,
  payment_terms   text,                                      -- 'COD', '30d net', etc.
  contact_person  text,
  phone           text,
  email           text,
  status          text not null default 'active' check (status in ('active','inactive')),
  ytd_purchases   numeric(14,2) not null default 0,           -- maintained by procurement triggers later
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists suppliers_status_idx on public.milling_suppliers(status);
create index if not exists suppliers_category_idx on public.milling_suppliers(category);

drop trigger if exists suppliers_updated_at on public.milling_suppliers;
create trigger suppliers_updated_at before update on public.milling_suppliers
  for each row execute function public.set_updated_at();

alter table public.milling_suppliers enable row level security;

drop policy if exists suppliers_select on public.milling_suppliers;
create policy suppliers_select on public.milling_suppliers
  for select to authenticated
  using (public.can_access(auth.uid(), 'suppliers', 'view'));

drop policy if exists suppliers_insert on public.milling_suppliers;
create policy suppliers_insert on public.milling_suppliers
  for insert to authenticated
  with check (public.can_access(auth.uid(), 'suppliers', 'create'));

drop policy if exists suppliers_update on public.milling_suppliers;
create policy suppliers_update on public.milling_suppliers
  for update to authenticated
  using (public.can_access(auth.uid(), 'suppliers', 'edit'))
  with check (public.can_access(auth.uid(), 'suppliers', 'edit'));

drop policy if exists suppliers_delete on public.milling_suppliers;
create policy suppliers_delete on public.milling_suppliers
  for delete to authenticated
  using (public.can_access(auth.uid(), 'suppliers', 'delete'));

-- =============================================================
-- customers
-- =============================================================
create table if not exists public.milling_customers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  name            text not null,
  tin             text,
  segment         text not null check (segment in ('distributor','retail','government','financial')),
  stream          text not null default 'mixed' check (stream in ('local','import','mixed')),
  credit_limit    numeric(14,2) not null default 0,
  ar_balance      numeric(14,2) not null default 0,    -- maintained by AR triggers later
  ytd_sales       numeric(14,2) not null default 0,    -- maintained by SO triggers later
  payment_terms   text,
  contact_person  text,
  phone           text,
  email           text,
  status          text not null default 'active' check (status in ('active','credit_hold','inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists customers_status_idx on public.milling_customers(status);
create index if not exists customers_stream_idx on public.milling_customers(stream);

drop trigger if exists customers_updated_at on public.milling_customers;
create trigger customers_updated_at before update on public.milling_customers
  for each row execute function public.set_updated_at();

alter table public.milling_customers enable row level security;

drop policy if exists customers_select on public.milling_customers;
create policy customers_select on public.milling_customers
  for select to authenticated
  using (public.can_access(auth.uid(), 'customers', 'view'));

drop policy if exists customers_insert on public.milling_customers;
create policy customers_insert on public.milling_customers
  for insert to authenticated
  with check (public.can_access(auth.uid(), 'customers', 'create'));

drop policy if exists customers_update on public.milling_customers;
create policy customers_update on public.milling_customers
  for update to authenticated
  using (public.can_access(auth.uid(), 'customers', 'edit'))
  with check (public.can_access(auth.uid(), 'customers', 'edit'));

drop policy if exists customers_delete on public.milling_customers;
create policy customers_delete on public.milling_customers
  for delete to authenticated
  using (public.can_access(auth.uid(), 'customers', 'delete'));

-- =============================================================
-- items
-- =============================================================
create table if not exists public.milling_items (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  description         text not null,
  uom                 text not null,                          -- 'MT', 'bag', 'pc', 'set'
  category            text not null check (category in ('paddy','milled-rice','import-rice','packaging','equipment','byproduct','office','other')),
  last_price          numeric(14,2),
  last_supplier_id    uuid references public.milling_suppliers(id) on delete set null,
  last_canvass_date   date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists items_category_idx on public.milling_items(category);

drop trigger if exists items_updated_at on public.milling_items;
create trigger items_updated_at before update on public.milling_items
  for each row execute function public.set_updated_at();

alter table public.milling_items enable row level security;

drop policy if exists items_select on public.milling_items;
create policy items_select on public.milling_items
  for select to authenticated
  using (public.can_access(auth.uid(), 'items', 'view'));

drop policy if exists items_insert on public.milling_items;
create policy items_insert on public.milling_items
  for insert to authenticated
  with check (public.can_access(auth.uid(), 'items', 'create'));

drop policy if exists items_update on public.milling_items;
create policy items_update on public.milling_items
  for update to authenticated
  using (public.can_access(auth.uid(), 'items', 'edit'))
  with check (public.can_access(auth.uid(), 'items', 'edit'));

drop policy if exists items_delete on public.milling_items;
create policy items_delete on public.milling_items
  for delete to authenticated
  using (public.can_access(auth.uid(), 'items', 'delete'));

-- =============================================================
-- warehouses
-- =============================================================
create table if not exists public.milling_warehouses (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  type         text not null check (type in ('paddy','milled','import','byproduct','equipment','office')),
  capacity_mt  numeric(12,2),
  location     text,
  status       text not null default 'active' check (status in ('active','inactive')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists warehouses_type_idx on public.milling_warehouses(type);

drop trigger if exists warehouses_updated_at on public.milling_warehouses;
create trigger warehouses_updated_at before update on public.milling_warehouses
  for each row execute function public.set_updated_at();

alter table public.milling_warehouses enable row level security;

drop policy if exists warehouses_select on public.milling_warehouses;
create policy warehouses_select on public.milling_warehouses
  for select to authenticated
  using (public.can_access(auth.uid(), 'warehouses', 'view'));

drop policy if exists warehouses_insert on public.milling_warehouses;
create policy warehouses_insert on public.milling_warehouses
  for insert to authenticated
  with check (public.can_access(auth.uid(), 'warehouses', 'create'));

drop policy if exists warehouses_update on public.milling_warehouses;
create policy warehouses_update on public.milling_warehouses
  for update to authenticated
  using (public.can_access(auth.uid(), 'warehouses', 'edit'))
  with check (public.can_access(auth.uid(), 'warehouses', 'edit'));

drop policy if exists warehouses_delete on public.milling_warehouses;
create policy warehouses_delete on public.milling_warehouses
  for delete to authenticated
  using (public.can_access(auth.uid(), 'warehouses', 'delete'));

-- =============================================================
-- vendos (passive income: vending machines)
-- =============================================================
create table if not exists public.milling_vendos (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  location    text,
  type        text not null check (type in ('water','snacks','coffee','coin-op','other')),
  status      text not null default 'active' check (status in ('active','maintenance','retired')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists vendos_status_idx on public.milling_vendos(status);

drop trigger if exists vendos_updated_at on public.milling_vendos;
create trigger vendos_updated_at before update on public.milling_vendos
  for each row execute function public.set_updated_at();

alter table public.milling_vendos enable row level security;

drop policy if exists vendos_select on public.milling_vendos;
create policy vendos_select on public.milling_vendos
  for select to authenticated
  using (public.can_access(auth.uid(), 'vendos', 'view'));

drop policy if exists vendos_insert on public.milling_vendos;
create policy vendos_insert on public.milling_vendos
  for insert to authenticated
  with check (public.can_access(auth.uid(), 'vendos', 'create'));

drop policy if exists vendos_update on public.milling_vendos;
create policy vendos_update on public.milling_vendos
  for update to authenticated
  using (public.can_access(auth.uid(), 'vendos', 'edit'))
  with check (public.can_access(auth.uid(), 'vendos', 'edit'));

drop policy if exists vendos_delete on public.milling_vendos;
create policy vendos_delete on public.milling_vendos
  for delete to authenticated
  using (public.can_access(auth.uid(), 'vendos', 'delete'));
