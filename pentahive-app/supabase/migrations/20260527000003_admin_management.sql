-- Admin management RLS — allow admins to read/write user_roles + user_access
-- from the browser via has_role() (so the admin UI doesn't need an Edge Function
-- round-trip for every assignment). Service-role still bypasses everything.
-- Also seeds the admin-roles page.
-- Created 2026-05-27.

-- =============================================================
-- public.users — admins can read every row (existing self-only policy was too tight)
-- =============================================================
drop policy if exists users_select_self on public.users;
drop policy if exists users_select       on public.users;
create policy users_select on public.users
  for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- public.user_roles — admin read-all + admin write
-- =============================================================
drop policy if exists user_roles_select_self on public.user_roles;
drop policy if exists user_roles_select      on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- public.user_access — admin read-all + admin write
-- =============================================================
drop policy if exists user_access_select_self on public.user_access;
drop policy if exists user_access_select       on public.user_access;
create policy user_access_select on public.user_access
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists user_access_admin_write on public.user_access;
create policy user_access_admin_write on public.user_access
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- Seed admin-roles page (so the route gate works)
-- =============================================================
insert into public.pages (code, label, description, requires_role)
values ('admin-roles', 'Admin — Roles', 'Role assignments', 'admin')
on conflict (code) do nothing;

-- Also keep the all_access bundle covering the new page so admin assignments stay complete.
insert into public.access_definition_permissions (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'all_access'),
  p.id,
  true, true, true, true, true
from public.pages p
where p.code = 'admin-roles'
on conflict (access_id, page_id) do nothing;
