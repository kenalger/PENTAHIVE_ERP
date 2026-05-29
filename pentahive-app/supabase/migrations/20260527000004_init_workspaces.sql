-- Workspaces — multi-tenant-style isolation between business lines.
-- All existing pages are tagged 'milling' (the rice/grain ERP we built so far).
-- Future workspaces (e.g. 'hardware') will get their own pages with their own
-- workspace tag.
-- Admin and Settings pages are cross-workspace (workspace = null).
-- Created 2026-05-27.

-- 1. Catalog of workspaces. Code is the URL segment (e.g. /milling).
create table if not exists public.workspaces (
  code         text primary key,
  name         text not null,
  icon         text,                          -- emoji or short glyph
  description  text,
  status       text not null default 'active' check (status in ('active','coming_soon','disabled')),
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.workspaces (code, name, icon, description, status, sort_order) values
  ('milling',  'Milling',  '🌾', 'Rice mill operations: paddy procurement, milling, sales, inventory', 'active', 1),
  ('hardware', 'Hardware', '🔧', 'Hardware store and equipment operations', 'coming_soon', 2)
on conflict (code) do nothing;

-- 2. Tag each existing page with a workspace.
alter table public.pages
  add column if not exists workspace text references public.workspaces(code) on delete set null;

-- All currently-seeded pages belong to the milling workspace except admin and settings.
update public.pages
set workspace = 'milling'
where workspace is null
  and code not in ('admin', 'admin-users', 'admin-roles', 'admin-access', 'settings');

create index if not exists pages_workspace_idx on public.pages(workspace);

-- 3. Helper functions

-- Does this user have access to a given workspace?
-- Admin role bypasses (full access). Otherwise must have at least one bundle
-- granting can_view on any page in the workspace.
create or replace function public.user_has_workspace(p_user_id uuid, p_workspace text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_role(p_user_id, 'admin') then true
    else exists (
      select 1
      from public.user_access ua
      join public.access_definition_permissions adp on adp.access_id = ua.access_id
      join public.pages p on p.id = adp.page_id
      where ua.user_id = p_user_id
        and p.workspace = p_workspace
        and adp.can_view = true
    )
  end;
$$;

-- Which active workspaces can this user access?
create or replace function public.user_workspaces(p_user_id uuid)
returns table (code text, name text, icon text, description text, status text, sort_order smallint)
language sql
stable
security definer
set search_path = public
as $$
  select w.code, w.name, w.icon, w.description, w.status, w.sort_order
  from public.workspaces w
  where w.status <> 'disabled'
    and public.user_has_workspace(p_user_id, w.code)
  order by w.sort_order, w.name;
$$;

grant execute on function public.user_has_workspace(uuid, text) to authenticated;
grant execute on function public.user_workspaces(uuid)         to authenticated;

-- 4. RLS — workspaces table is readable by any authenticated user (so the picker can list)
alter table public.workspaces enable row level security;

drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (true);

-- 5. Update can_enter_page so admin-only pages with no workspace still work as before;
-- no semantic change needed since requires_role still gates them. Documenting for clarity.
