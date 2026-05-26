-- Refactor access control: developer-defined access bundles instead of per-user grants.
-- Created 2026-05-26.
--
-- Before: admin ticked per-(user, page) checkboxes — access_grants table.
-- After:  developer authors named access bundles (in migrations); admin assigns
--         them to users in the running app.
--
-- New tables:
--   access_definitions             — catalog of access bundles (code, name, description)
--   access_definition_permissions  — what each bundle grants, per page
--   user_access                    — M:M assignment of access bundles to users
--
-- Removed:
--   access_grants — dropped (was empty; nothing in app code wrote to it yet)
--
-- can_access() is rewritten to walk the new tables. can_enter_page() is unchanged
-- (it delegates to can_access).

-- 1. New catalog table — what kinds of access exist in this app.
create table if not exists public.access_definitions (
  id          smallserial primary key,
  code        text not null unique,  -- 'procurement_officer', 'sales_viewer'
  name        text not null,         -- 'Procurement Officer'
  description text,
  created_at  timestamptz not null default now()
);

-- 2. The page+permission matrix that defines each access.
create table if not exists public.access_definition_permissions (
  access_id   smallint not null references public.access_definitions(id) on delete cascade,
  page_id     smallint not null references public.pages(id) on delete cascade,
  can_view    boolean not null default false,
  can_create  boolean not null default false,
  can_edit    boolean not null default false,
  can_delete  boolean not null default false,
  can_approve boolean not null default false,
  primary key (access_id, page_id)
);

create index if not exists adp_access_idx on public.access_definition_permissions (access_id);
create index if not exists adp_page_idx on public.access_definition_permissions (page_id);

-- 3. User assignments — many access definitions per user is allowed.
create table if not exists public.user_access (
  user_id     uuid not null references public.users(id) on delete cascade,
  access_id   smallint not null references public.access_definitions(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, access_id)
);

create index if not exists user_access_user_idx on public.user_access (user_id);
create index if not exists user_access_access_idx on public.user_access (access_id);

-- 4. Rewrite can_access to walk user_access → access_definition_permissions.
-- Role short-circuits stay the same:
--   admin   → true always
--   manager → true for 'approve' always
--   anyone else → OR-union of all assigned access bundles' permissions.
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
      from public.user_access ua
      join public.access_definition_permissions adp on adp.access_id = ua.access_id
      join public.pages p on p.id = adp.page_id
      where ua.user_id = p_user_id
        and p.code = p_page_code
        and case p_action
              when 'view'    then adp.can_view
              when 'create'  then adp.can_create
              when 'edit'    then adp.can_edit
              when 'delete'  then adp.can_delete
              when 'approve' then adp.can_approve
              else false
            end
    )
  end;
$$;

-- 5. View: effective access per (user, page), unioned across all assigned bundles.
-- Used by the Angular AuthService to fetch a flat permission map for the signed-in user.
-- bool_or makes the union: if ANY assigned bundle grants the right, the user has it.
create or replace view public.v_user_effective_access
with (security_invoker = true)
as
select
  ua.user_id,
  p.id as page_id,
  p.code as page_code,
  p.label as page_label,
  bool_or(adp.can_view)    as can_view,
  bool_or(adp.can_create)  as can_create,
  bool_or(adp.can_edit)    as can_edit,
  bool_or(adp.can_delete)  as can_delete,
  bool_or(adp.can_approve) as can_approve
from public.user_access ua
join public.access_definition_permissions adp on adp.access_id = ua.access_id
join public.pages p on p.id = adp.page_id
group by ua.user_id, p.id, p.code, p.label;

-- 6. RLS.
alter table public.access_definitions enable row level security;
drop policy if exists access_definitions_select on public.access_definitions;
create policy access_definitions_select on public.access_definitions
  for select to authenticated using (true);

alter table public.access_definition_permissions enable row level security;
drop policy if exists adp_select on public.access_definition_permissions;
create policy adp_select on public.access_definition_permissions
  for select to authenticated using (true);

alter table public.user_access enable row level security;
drop policy if exists user_access_select_self on public.user_access;
create policy user_access_select_self on public.user_access
  for select to authenticated using (user_id = auth.uid());

-- 7. Drop the old access_grants table. Safe — it was empty.
drop table if exists public.access_grants cascade;
