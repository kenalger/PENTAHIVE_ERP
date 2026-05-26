-- Create an 'all_access' bundle (every page × every permission) and assign it
-- to admin@gmail.com. Note: admin already has implicit full access via the
-- 'admin' role bypass in can_access(); this just makes the assignment explicit
-- and visible in v_user_effective_access / the dashboard grants list.
-- Created 2026-05-26.

-- 1. Define the bundle.
insert into public.access_definitions (code, name, description)
values ('all_access', 'All Access', 'Full permissions on every page in the system')
on conflict (code) do nothing;

-- 2. Populate its permissions: every page × every action true.
insert into public.access_definition_permissions
  (access_id, page_id, can_view, can_create, can_edit, can_delete, can_approve)
select
  (select id from public.access_definitions where code = 'all_access'),
  p.id,
  true, true, true, true, true
from public.pages p
on conflict (access_id, page_id) do update
set can_view    = true,
    can_create  = true,
    can_edit    = true,
    can_delete  = true,
    can_approve = true;

-- 3. Assign the bundle to admin@gmail.com.
insert into public.user_access (user_id, access_id, assigned_by)
select
  u.id,
  (select id from public.access_definitions where code = 'all_access'),
  u.id  -- self-assigned during seed (no other admin exists to credit)
from public.users u
where u.email = 'admin@gmail.com'
on conflict (user_id, access_id) do nothing;
