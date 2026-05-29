-- Procurement (PR → Canvass → PO → GRN) and Sales (SO → Delivery → Invoice → Collection) schemas.
-- All RLS delegates to public.can_access(uid, page_code, action) so the access-control
-- system stays the single enforcement boundary.
-- Created 2026-05-26.

-- =============================================================
-- Document number generator (PR-YYYY-NNNN, CNV-YYYY-NNNN, PO-..., GRN-..., SO-..., DO-..., SI-..., OR-...)
-- =============================================================
create table if not exists public.doc_counters (
  series   text primary key,
  year     int  not null default extract(year from now())::int,
  last_no  int  not null default 0
);

create or replace function public.next_doc_no(p_series text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from now())::int;
  v_no   int;
begin
  insert into public.doc_counters (series, year, last_no)
  values (p_series, v_year, 0)
  on conflict (series) do nothing;

  -- Reset counter when the year flips.
  update public.doc_counters
  set year = v_year, last_no = 0
  where series = p_series and year < v_year;

  update public.doc_counters
  set last_no = last_no + 1
  where series = p_series
  returning last_no into v_no;

  return p_series || '-' || v_year::text || '-' || lpad(v_no::text, 4, '0');
end;
$$;

grant execute on function public.next_doc_no(text) to authenticated;

-- =============================================================
-- Procurement: purchase_requests + pr_lines
-- =============================================================
create table if not exists public.purchase_requests (
  id            uuid primary key default gen_random_uuid(),
  no            text unique not null,
  date          date not null default current_date,
  requester_id  uuid references public.users(id) on delete set null,
  department    text,
  purpose       text,
  needed_by     date,
  status        text not null default 'draft' check (status in ('draft','for_canvass','canvassed','approved','converted_to_po','cancelled')),
  canvass_no    text,
  po_no         text,
  total         numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pr_status_idx on public.purchase_requests(status);
create index if not exists pr_date_idx on public.purchase_requests(date);

create table if not exists public.pr_lines (
  id              uuid primary key default gen_random_uuid(),
  pr_id           uuid not null references public.purchase_requests(id) on delete cascade,
  line_no         int  not null,
  description     text not null,
  item_id         uuid references public.items(id) on delete set null,
  uom             text not null,
  qty             numeric(14,2) not null,
  est_unit_price  numeric(14,2) not null default 0,
  line_total      numeric(14,2) generated always as (qty * est_unit_price) stored
);
create index if not exists pr_lines_pr_idx on public.pr_lines(pr_id);

drop trigger if exists pr_updated_at on public.purchase_requests;
create trigger pr_updated_at before update on public.purchase_requests
  for each row execute function public.set_updated_at();

alter table public.purchase_requests enable row level security;
alter table public.pr_lines enable row level security;

drop policy if exists pr_select on public.purchase_requests;
create policy pr_select on public.purchase_requests for select to authenticated using (public.can_access(auth.uid(), 'purchase-requests', 'view'));
drop policy if exists pr_insert on public.purchase_requests;
create policy pr_insert on public.purchase_requests for insert to authenticated with check (public.can_access(auth.uid(), 'purchase-requests', 'create'));
drop policy if exists pr_update on public.purchase_requests;
create policy pr_update on public.purchase_requests for update to authenticated using (public.can_access(auth.uid(), 'purchase-requests', 'edit')) with check (public.can_access(auth.uid(), 'purchase-requests', 'edit'));
drop policy if exists pr_delete on public.purchase_requests;
create policy pr_delete on public.purchase_requests for delete to authenticated using (public.can_access(auth.uid(), 'purchase-requests', 'delete'));

drop policy if exists pr_lines_select on public.pr_lines;
create policy pr_lines_select on public.pr_lines for select to authenticated using (public.can_access(auth.uid(), 'purchase-requests', 'view'));
drop policy if exists pr_lines_write on public.pr_lines;
create policy pr_lines_write on public.pr_lines for all to authenticated using (public.can_access(auth.uid(), 'purchase-requests', 'edit')) with check (public.can_access(auth.uid(), 'purchase-requests', 'edit'));

-- =============================================================
-- Procurement: canvasses + canvass_items + canvass_quotes
-- =============================================================
create table if not exists public.canvasses (
  id              uuid primary key default gen_random_uuid(),
  no              text unique not null,
  date            date not null default current_date,
  pr_id           uuid references public.purchase_requests(id) on delete set null,
  pr_no           text,
  currency        text not null default 'PHP',
  vat_treatment   text not null default 'vat-inclusive' check (vat_treatment in ('vat-inclusive','vat-exclusive','vat-exempt')),
  status          text not null default 'open' check (status in ('open','awaiting_approval','awarded','closed','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists canvasses_status_idx on public.canvasses(status);

create table if not exists public.canvass_items (
  id                  uuid primary key default gen_random_uuid(),
  canvass_id          uuid not null references public.canvasses(id) on delete cascade,
  line_no             int not null,
  description         text not null,
  uom                 text not null,
  qty                 numeric(14,2) not null,
  winner_supplier_id  uuid references public.suppliers(id) on delete set null
);
create index if not exists canvass_items_canvass_idx on public.canvass_items(canvass_id);

create table if not exists public.canvass_quotes (
  id              uuid primary key default gen_random_uuid(),
  canvass_item_id uuid not null references public.canvass_items(id) on delete cascade,
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  unit_price      numeric(14,2) not null
);
create index if not exists canvass_quotes_item_idx on public.canvass_quotes(canvass_item_id);

drop trigger if exists canvasses_updated_at on public.canvasses;
create trigger canvasses_updated_at before update on public.canvasses
  for each row execute function public.set_updated_at();

alter table public.canvasses enable row level security;
alter table public.canvass_items enable row level security;
alter table public.canvass_quotes enable row level security;

drop policy if exists cnv_select on public.canvasses;
create policy cnv_select on public.canvasses for select to authenticated using (public.can_access(auth.uid(), 'canvasses', 'view'));
drop policy if exists cnv_insert on public.canvasses;
create policy cnv_insert on public.canvasses for insert to authenticated with check (public.can_access(auth.uid(), 'canvasses', 'create'));
drop policy if exists cnv_update on public.canvasses;
create policy cnv_update on public.canvasses for update to authenticated using (public.can_access(auth.uid(), 'canvasses', 'edit')) with check (public.can_access(auth.uid(), 'canvasses', 'edit'));
drop policy if exists cnv_delete on public.canvasses;
create policy cnv_delete on public.canvasses for delete to authenticated using (public.can_access(auth.uid(), 'canvasses', 'delete'));

drop policy if exists cnv_items_select on public.canvass_items;
create policy cnv_items_select on public.canvass_items for select to authenticated using (public.can_access(auth.uid(), 'canvasses', 'view'));
drop policy if exists cnv_items_write on public.canvass_items;
create policy cnv_items_write on public.canvass_items for all to authenticated using (public.can_access(auth.uid(), 'canvasses', 'edit')) with check (public.can_access(auth.uid(), 'canvasses', 'edit'));
drop policy if exists cnv_quotes_select on public.canvass_quotes;
create policy cnv_quotes_select on public.canvass_quotes for select to authenticated using (public.can_access(auth.uid(), 'canvasses', 'view'));
drop policy if exists cnv_quotes_write on public.canvass_quotes;
create policy cnv_quotes_write on public.canvass_quotes for all to authenticated using (public.can_access(auth.uid(), 'canvasses', 'edit')) with check (public.can_access(auth.uid(), 'canvasses', 'edit'));

-- =============================================================
-- Procurement: purchase_orders + po_lines
-- =============================================================
create table if not exists public.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  no              text unique not null,
  date            date not null default current_date,
  supplier_id     uuid references public.suppliers(id) on delete restrict,
  pr_id           uuid references public.purchase_requests(id) on delete set null,
  canvass_id      uuid references public.canvasses(id) on delete set null,
  category        text,
  stream          text not null default 'local' check (stream in ('local','import')),
  total           numeric(14,2) not null default 0,
  expected_date   date,
  status          text not null default 'pending_approval' check (status in ('pending_approval','approved','in_transit','boc_clearance','overdue','received','cancelled')),
  ewt_rate        numeric(5,2) not null default 0,
  ewt_amount      numeric(14,2) not null default 0,
  bir_registered  boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists po_status_idx on public.purchase_orders(status);
create index if not exists po_supplier_idx on public.purchase_orders(supplier_id);

create table if not exists public.po_lines (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.purchase_orders(id) on delete cascade,
  line_no       int not null,
  item_id       uuid references public.items(id) on delete set null,
  description   text not null,
  uom           text not null,
  qty           numeric(14,2) not null,
  unit_price    numeric(14,2) not null,
  line_total    numeric(14,2) generated always as (qty * unit_price) stored
);
create index if not exists po_lines_po_idx on public.po_lines(po_id);

drop trigger if exists po_updated_at on public.purchase_orders;
create trigger po_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();

alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;

drop policy if exists po_select on public.purchase_orders;
create policy po_select on public.purchase_orders for select to authenticated using (public.can_access(auth.uid(), 'purchase-orders', 'view'));
drop policy if exists po_insert on public.purchase_orders;
create policy po_insert on public.purchase_orders for insert to authenticated with check (public.can_access(auth.uid(), 'purchase-orders', 'create'));
drop policy if exists po_update on public.purchase_orders;
create policy po_update on public.purchase_orders for update to authenticated using (public.can_access(auth.uid(), 'purchase-orders', 'edit')) with check (public.can_access(auth.uid(), 'purchase-orders', 'edit'));
drop policy if exists po_delete on public.purchase_orders;
create policy po_delete on public.purchase_orders for delete to authenticated using (public.can_access(auth.uid(), 'purchase-orders', 'delete'));

drop policy if exists po_lines_select on public.po_lines;
create policy po_lines_select on public.po_lines for select to authenticated using (public.can_access(auth.uid(), 'purchase-orders', 'view'));
drop policy if exists po_lines_write on public.po_lines;
create policy po_lines_write on public.po_lines for all to authenticated using (public.can_access(auth.uid(), 'purchase-orders', 'edit')) with check (public.can_access(auth.uid(), 'purchase-orders', 'edit'));

-- =============================================================
-- Procurement: goods_receipts + grn_lines
-- =============================================================
create table if not exists public.goods_receipts (
  id              uuid primary key default gen_random_uuid(),
  no              text unique not null,
  date            date not null default current_date,
  po_id           uuid references public.purchase_orders(id) on delete set null,
  po_no           text,
  supplier_name   text,
  qc_result       text not null default 'passed' check (qc_result in ('passed','partial_reject','rejected')),
  warehouse_id    uuid references public.warehouses(id) on delete set null,
  status          text not null default 'posted' check (status in ('posted','dispute')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists grn_status_idx on public.goods_receipts(status);
create index if not exists grn_po_idx on public.goods_receipts(po_id);

create table if not exists public.grn_lines (
  id            uuid primary key default gen_random_uuid(),
  grn_id        uuid not null references public.goods_receipts(id) on delete cascade,
  po_line_id    uuid references public.po_lines(id) on delete set null,
  line_no       int not null,
  description   text not null,
  uom           text not null,
  qty_po        numeric(14,2) not null default 0,
  qty_received  numeric(14,2) not null,
  variance      numeric(14,2) generated always as (qty_received - qty_po) stored
);
create index if not exists grn_lines_grn_idx on public.grn_lines(grn_id);

drop trigger if exists grn_updated_at on public.goods_receipts;
create trigger grn_updated_at before update on public.goods_receipts
  for each row execute function public.set_updated_at();

alter table public.goods_receipts enable row level security;
alter table public.grn_lines enable row level security;

drop policy if exists grn_select on public.goods_receipts;
create policy grn_select on public.goods_receipts for select to authenticated using (public.can_access(auth.uid(), 'goods-receipts', 'view'));
drop policy if exists grn_insert on public.goods_receipts;
create policy grn_insert on public.goods_receipts for insert to authenticated with check (public.can_access(auth.uid(), 'goods-receipts', 'create'));
drop policy if exists grn_update on public.goods_receipts;
create policy grn_update on public.goods_receipts for update to authenticated using (public.can_access(auth.uid(), 'goods-receipts', 'edit')) with check (public.can_access(auth.uid(), 'goods-receipts', 'edit'));
drop policy if exists grn_delete on public.goods_receipts;
create policy grn_delete on public.goods_receipts for delete to authenticated using (public.can_access(auth.uid(), 'goods-receipts', 'delete'));

drop policy if exists grn_lines_select on public.grn_lines;
create policy grn_lines_select on public.grn_lines for select to authenticated using (public.can_access(auth.uid(), 'goods-receipts', 'view'));
drop policy if exists grn_lines_write on public.grn_lines;
create policy grn_lines_write on public.grn_lines for all to authenticated using (public.can_access(auth.uid(), 'goods-receipts', 'edit')) with check (public.can_access(auth.uid(), 'goods-receipts', 'edit'));

-- =============================================================
-- Sales: sales_orders + so_lines
-- =============================================================
create table if not exists public.sales_orders (
  id              uuid primary key default gen_random_uuid(),
  no              text unique not null,
  date            date not null default current_date,
  customer_id     uuid references public.customers(id) on delete restrict,
  stream          text not null default 'local' check (stream in ('local','import')),
  total           numeric(14,2) not null default 0,
  vat_amount      numeric(14,2) not null default 0,
  status          text not null default 'draft' check (status in ('draft','confirmed','credit_hold','in_transit','delivered','cancelled')),
  delivery_date   date,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists so_status_idx on public.sales_orders(status);
create index if not exists so_stream_idx on public.sales_orders(stream);

create table if not exists public.so_lines (
  id              uuid primary key default gen_random_uuid(),
  so_id           uuid not null references public.sales_orders(id) on delete cascade,
  line_no         int not null,
  item_id         uuid references public.items(id) on delete set null,
  product         text not null,
  grade           text,
  qty_bags        numeric(14,2) not null,
  price_per_bag   numeric(14,2) not null,
  amount          numeric(14,2) generated always as (qty_bags * price_per_bag) stored,
  vat             numeric(14,2) not null default 0
);
create index if not exists so_lines_so_idx on public.so_lines(so_id);

drop trigger if exists so_updated_at on public.sales_orders;
create trigger so_updated_at before update on public.sales_orders
  for each row execute function public.set_updated_at();

alter table public.sales_orders enable row level security;
alter table public.so_lines enable row level security;

drop policy if exists so_select on public.sales_orders;
create policy so_select on public.sales_orders for select to authenticated using (public.can_access(auth.uid(), 'sales-orders', 'view'));
drop policy if exists so_insert on public.sales_orders;
create policy so_insert on public.sales_orders for insert to authenticated with check (public.can_access(auth.uid(), 'sales-orders', 'create'));
drop policy if exists so_update on public.sales_orders;
create policy so_update on public.sales_orders for update to authenticated using (public.can_access(auth.uid(), 'sales-orders', 'edit')) with check (public.can_access(auth.uid(), 'sales-orders', 'edit'));
drop policy if exists so_delete on public.sales_orders;
create policy so_delete on public.sales_orders for delete to authenticated using (public.can_access(auth.uid(), 'sales-orders', 'delete'));

drop policy if exists so_lines_select on public.so_lines;
create policy so_lines_select on public.so_lines for select to authenticated using (public.can_access(auth.uid(), 'sales-orders', 'view'));
drop policy if exists so_lines_write on public.so_lines;
create policy so_lines_write on public.so_lines for all to authenticated using (public.can_access(auth.uid(), 'sales-orders', 'edit')) with check (public.can_access(auth.uid(), 'sales-orders', 'edit'));

-- =============================================================
-- Sales: deliveries (header only — tracking_steps in jsonb)
-- =============================================================
create table if not exists public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  no              text unique not null,
  so_id           uuid references public.sales_orders(id) on delete set null,
  so_no           text,
  customer_name   text,
  truck_no        text,
  driver          text,
  destination     text,
  dispatch_at     timestamptz,
  status          text not null default 'scheduled' check (status in ('scheduled','in_transit','delivered','delayed','cancelled')),
  tracking_steps  jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists deliveries_status_idx on public.deliveries(status);

drop trigger if exists deliveries_updated_at on public.deliveries;
create trigger deliveries_updated_at before update on public.deliveries
  for each row execute function public.set_updated_at();

alter table public.deliveries enable row level security;

drop policy if exists del_select on public.deliveries;
create policy del_select on public.deliveries for select to authenticated using (public.can_access(auth.uid(), 'deliveries', 'view'));
drop policy if exists del_insert on public.deliveries;
create policy del_insert on public.deliveries for insert to authenticated with check (public.can_access(auth.uid(), 'deliveries', 'create'));
drop policy if exists del_update on public.deliveries;
create policy del_update on public.deliveries for update to authenticated using (public.can_access(auth.uid(), 'deliveries', 'edit')) with check (public.can_access(auth.uid(), 'deliveries', 'edit'));
drop policy if exists del_delete on public.deliveries;
create policy del_delete on public.deliveries for delete to authenticated using (public.can_access(auth.uid(), 'deliveries', 'delete'));

-- =============================================================
-- Sales: sales_invoices + collections (schema only — UI deferred to next turn)
-- =============================================================
create table if not exists public.sales_invoices (
  id            uuid primary key default gen_random_uuid(),
  no            text unique not null,
  so_id         uuid references public.sales_orders(id) on delete set null,
  invoice_amt   numeric(14,2) not null,
  vat_amt       numeric(14,2) not null default 0,
  amount_due    numeric(14,2) not null,
  invoice_date  date not null default current_date,
  due_date      date,
  status        text not null default 'current' check (status in ('current','partial','overdue','paid','cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists si_status_idx on public.sales_invoices(status);

drop trigger if exists si_updated_at on public.sales_invoices;
create trigger si_updated_at before update on public.sales_invoices
  for each row execute function public.set_updated_at();

alter table public.sales_invoices enable row level security;

drop policy if exists si_select on public.sales_invoices;
create policy si_select on public.sales_invoices for select to authenticated using (public.can_access(auth.uid(), 'accounts-receivable', 'view'));
drop policy if exists si_write on public.sales_invoices;
create policy si_write on public.sales_invoices for all to authenticated using (public.can_access(auth.uid(), 'accounts-receivable', 'edit')) with check (public.can_access(auth.uid(), 'accounts-receivable', 'edit'));

create table if not exists public.collections (
  id            uuid primary key default gen_random_uuid(),
  or_no         text unique not null,
  ts            timestamptz not null default now(),
  customer_id   uuid references public.customers(id) on delete set null,
  stream        text not null default 'local' check (stream in ('local','import')),
  invoice_id    uuid references public.sales_invoices(id) on delete set null,
  gross         numeric(14,2) not null,
  ewt           numeric(14,2) not null default 0,
  net           numeric(14,2) generated always as (gross - ewt) stored,
  mode          text not null check (mode in ('cash','bank','check','gcash')),
  deposited_to  text,
  status        text not null default 'posted' check (status in ('posted','reversed')),
  posted_by_id  uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists coll_customer_idx on public.collections(customer_id);

alter table public.collections enable row level security;

drop policy if exists coll_select on public.collections;
create policy coll_select on public.collections for select to authenticated using (public.can_access(auth.uid(), 'dcpr', 'view') or public.can_access(auth.uid(), 'accounts-receivable', 'view'));
drop policy if exists coll_write on public.collections;
create policy coll_write on public.collections for all to authenticated using (public.can_access(auth.uid(), 'dcpr', 'create') or public.can_access(auth.uid(), 'accounts-receivable', 'create')) with check (public.can_access(auth.uid(), 'dcpr', 'create') or public.can_access(auth.uid(), 'accounts-receivable', 'create'));
