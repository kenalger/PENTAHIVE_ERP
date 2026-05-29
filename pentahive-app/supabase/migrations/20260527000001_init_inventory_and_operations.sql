-- Inventory + Operations (Weighbridge, Milling internal, Toll milling, Quality Inspection).
-- RLS delegated to public.can_access(uid, page_code, action) — same enforcement boundary.
-- Created 2026-05-27.

-- =============================================================
-- inventory  +  inventory_transactions
-- =============================================================
create table if not exists public.inventory (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique not null,
  product       text not null,
  variety_grade text,
  warehouse_id  uuid references public.warehouses(id) on delete set null,
  stream        text not null default 'local' check (stream in ('local','import')),
  on_hand_mt    numeric(14,2) not null default 0,
  reserved_mt   numeric(14,2) not null default 0,
  available_mt  numeric(14,2) generated always as (on_hand_mt - reserved_mt) stored,
  unit_cost     numeric(14,2) not null default 0,
  total_value   numeric(14,2) generated always as (on_hand_mt * unit_cost) stored,
  reorder_pt    numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists inv_warehouse_idx on public.inventory(warehouse_id);
create index if not exists inv_stream_idx on public.inventory(stream);

drop trigger if exists inv_updated_at on public.inventory;
create trigger inv_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

create table if not exists public.inventory_transactions (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null,                            -- not FK so historical rows survive item deletes
  type          text not null check (type in ('receipt','dispatch','adjust','transfer-in','transfer-out')),
  qty           numeric(14,2) not null,                   -- always positive; the type defines the sign of impact
  source_table  text,
  source_id     uuid,
  notes         text,
  ts            timestamptz not null default now()
);
create index if not exists inv_tx_sku_idx on public.inventory_transactions(sku);
create index if not exists inv_tx_ts_idx on public.inventory_transactions(ts desc);

alter table public.inventory enable row level security;
alter table public.inventory_transactions enable row level security;

drop policy if exists inv_select on public.inventory;
create policy inv_select on public.inventory for select to authenticated using (public.can_access(auth.uid(), 'inventory', 'view'));
drop policy if exists inv_insert on public.inventory;
create policy inv_insert on public.inventory for insert to authenticated with check (public.can_access(auth.uid(), 'inventory', 'create'));
drop policy if exists inv_update on public.inventory;
create policy inv_update on public.inventory for update to authenticated using (public.can_access(auth.uid(), 'inventory', 'edit')) with check (public.can_access(auth.uid(), 'inventory', 'edit'));
drop policy if exists inv_delete on public.inventory;
create policy inv_delete on public.inventory for delete to authenticated using (public.can_access(auth.uid(), 'inventory', 'delete'));

drop policy if exists inv_tx_select on public.inventory_transactions;
create policy inv_tx_select on public.inventory_transactions for select to authenticated using (public.can_access(auth.uid(), 'inventory', 'view'));
drop policy if exists inv_tx_write on public.inventory_transactions;
create policy inv_tx_write on public.inventory_transactions for all to authenticated using (public.can_access(auth.uid(), 'inventory', 'edit')) with check (public.can_access(auth.uid(), 'inventory', 'edit'));

-- =============================================================
-- weighbridge_tickets
-- =============================================================
create table if not exists public.weighbridge_tickets (
  id          uuid primary key default gen_random_uuid(),
  or_no       text unique not null,
  ts          timestamptz not null default now(),
  plate       text,
  customer    text,
  mode        text not null default 'single' check (mode in ('single','two-way')),
  gross       numeric(14,2) not null,
  tare        numeric(14,2) not null default 0,
  net         numeric(14,2) generated always as (gross - tare) stored,
  price       numeric(14,2) not null default 0,
  payment     text not null default 'cash' check (payment in ('cash','credit')),
  operator    text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists wt_ts_idx on public.weighbridge_tickets(ts desc);

alter table public.weighbridge_tickets enable row level security;

drop policy if exists wt_select on public.weighbridge_tickets;
create policy wt_select on public.weighbridge_tickets for select to authenticated using (public.can_access(auth.uid(), 'weighbridge', 'view'));
drop policy if exists wt_insert on public.weighbridge_tickets;
create policy wt_insert on public.weighbridge_tickets for insert to authenticated with check (public.can_access(auth.uid(), 'weighbridge', 'create'));
drop policy if exists wt_update on public.weighbridge_tickets;
create policy wt_update on public.weighbridge_tickets for update to authenticated using (public.can_access(auth.uid(), 'weighbridge', 'edit')) with check (public.can_access(auth.uid(), 'weighbridge', 'edit'));
drop policy if exists wt_delete on public.weighbridge_tickets;
create policy wt_delete on public.weighbridge_tickets for delete to authenticated using (public.can_access(auth.uid(), 'weighbridge', 'delete'));

-- =============================================================
-- milling_batches  (internal milling)
-- =============================================================
create table if not exists public.milling_batches (
  id                  uuid primary key default gen_random_uuid(),
  batch_no            text unique not null,
  date_planned        date,
  date_completed      date,
  source              text,
  variety             text,
  sacks_in            numeric(14,2) not null default 0,
  kg_per_sack         numeric(14,2) not null default 50,
  rice_out            numeric(14,2) not null default 0,                 -- in MT
  bran_out            numeric(14,2) not null default 0,
  husk_out            numeric(14,2) not null default 0,
  recovery_pct        numeric(5,2)  not null default 0,
  cost_per_rice_sack  numeric(14,2) not null default 0,
  total_cost          numeric(14,2) not null default 0,
  status              text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists mb_status_idx on public.milling_batches(status);

drop trigger if exists mb_updated_at on public.milling_batches;
create trigger mb_updated_at before update on public.milling_batches
  for each row execute function public.set_updated_at();

alter table public.milling_batches enable row level security;

drop policy if exists mb_select on public.milling_batches;
create policy mb_select on public.milling_batches for select to authenticated using (public.can_access(auth.uid(), 'milling', 'view'));
drop policy if exists mb_insert on public.milling_batches;
create policy mb_insert on public.milling_batches for insert to authenticated with check (public.can_access(auth.uid(), 'milling', 'create'));
drop policy if exists mb_update on public.milling_batches;
create policy mb_update on public.milling_batches for update to authenticated using (public.can_access(auth.uid(), 'milling', 'edit')) with check (public.can_access(auth.uid(), 'milling', 'edit'));
drop policy if exists mb_delete on public.milling_batches;
create policy mb_delete on public.milling_batches for delete to authenticated using (public.can_access(auth.uid(), 'milling', 'delete'));

-- =============================================================
-- toll_milling
-- =============================================================
create table if not exists public.toll_milling (
  id                       uuid primary key default gen_random_uuid(),
  or_no                    text unique not null,
  date                     date not null default current_date,
  customer                 text not null,
  variety                  text,
  sacks_in                 numeric(14,2) not null default 0,
  kg_per_sack              numeric(14,2) not null default 50,
  rice_out                 numeric(14,2) not null default 0,
  bran_out                 numeric(14,2) not null default 0,
  husk_out                 numeric(14,2) not null default 0,
  recovery_pct             numeric(5,2)  not null default 0,
  price_per_sack           numeric(14,2) not null default 0,
  total                    numeric(14,2) not null default 0,
  byproduct_disposition    text not null default 'customer' check (byproduct_disposition in ('customer','rjl')),
  notes                    text,
  created_at               timestamptz not null default now()
);
create index if not exists tm_date_idx on public.toll_milling(date desc);

-- Share the 'milling' page_code for RLS purposes (Internal + Toll on the same UI tab page).
alter table public.toll_milling enable row level security;

drop policy if exists tm_select on public.toll_milling;
create policy tm_select on public.toll_milling for select to authenticated using (public.can_access(auth.uid(), 'milling', 'view'));
drop policy if exists tm_insert on public.toll_milling;
create policy tm_insert on public.toll_milling for insert to authenticated with check (public.can_access(auth.uid(), 'milling', 'create'));
drop policy if exists tm_update on public.toll_milling;
create policy tm_update on public.toll_milling for update to authenticated using (public.can_access(auth.uid(), 'milling', 'edit')) with check (public.can_access(auth.uid(), 'milling', 'edit'));
drop policy if exists tm_delete on public.toll_milling;
create policy tm_delete on public.toll_milling for delete to authenticated using (public.can_access(auth.uid(), 'milling', 'delete'));

-- =============================================================
-- quality_inspections
-- =============================================================
create table if not exists public.quality_inspections (
  id              uuid primary key default gen_random_uuid(),
  qc_no           text unique not null,
  grn_id          uuid references public.goods_receipts(id) on delete set null,
  grn_no          text,
  supplier_name   text,
  grade           text,
  moisture_pct    numeric(5,2),
  impurity_pct    numeric(5,2),
  chalkiness_pct  numeric(5,2),
  broken_pct      numeric(5,2),
  inspector       text,
  result          text not null default 'passed' check (result in ('passed','partial_reject','rejected')),
  notes           text,
  inspected_at    timestamptz not null default now()
);
create index if not exists qi_result_idx on public.quality_inspections(result);
create index if not exists qi_inspected_idx on public.quality_inspections(inspected_at desc);

alter table public.quality_inspections enable row level security;

drop policy if exists qi_select on public.quality_inspections;
create policy qi_select on public.quality_inspections for select to authenticated using (public.can_access(auth.uid(), 'quality-inspection', 'view'));
drop policy if exists qi_insert on public.quality_inspections;
create policy qi_insert on public.quality_inspections for insert to authenticated with check (public.can_access(auth.uid(), 'quality-inspection', 'create'));
drop policy if exists qi_update on public.quality_inspections;
create policy qi_update on public.quality_inspections for update to authenticated using (public.can_access(auth.uid(), 'quality-inspection', 'edit')) with check (public.can_access(auth.uid(), 'quality-inspection', 'edit'));
drop policy if exists qi_delete on public.quality_inspections;
create policy qi_delete on public.quality_inspections for delete to authenticated using (public.can_access(auth.uid(), 'quality-inspection', 'delete'));
