-- Roles + user-role assignments. Many-to-many: one user can hold several roles.
-- Created 2026-05-25.

create table if not exists public.roles (
  id          smallserial primary key,
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now()
);

insert into public.roles (name, description) values
  ('admin',    'Full system access — can manage users and all data'),
  ('manager',  'Department or team leader with elevated permissions'),
  ('employee', 'Standard employee account')
on conflict (name) do nothing;

create table if not exists public.user_roles (
  user_id     uuid     not null references public.users(id) on delete cascade,
  role_id     smallint not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists user_roles_user_idx on public.user_roles (user_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- Helper: does this user hold a given role?
-- Useful inside RLS policies on other tables: `using (public.has_role(auth.uid(), 'manager'))`.
create or replace function public.has_role(uid uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = uid and r.name = role_name
  );
$$;

-- RLS: roles list is readable by any signed-in user (e.g. dropdowns).
-- Writes only happen server-side via service_role; no client write policies.
alter table public.roles enable row level security;

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated
  using (true);

-- RLS: each user can see their own role assignments. Admin reads go through service_role.
alter table public.user_roles enable row level security;

drop policy if exists user_roles_select_self on public.user_roles;
create policy user_roles_select_self on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

-- Seed: give admin@gmail.com the 'admin' role.
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from public.users u, public.roles r
where u.email = 'admin@gmail.com' and r.name = 'admin'
on conflict do nothing;
