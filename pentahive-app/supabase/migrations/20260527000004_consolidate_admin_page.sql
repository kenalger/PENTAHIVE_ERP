-- Consolidate the Admin section into a single page.
-- The UI now ships one Admin route (/admin) with Users / Roles / Access tabs;
-- the route guard checks pageCode='admin' for all three URLs.
--
-- Old per-tab pages (admin-users, admin-roles, admin-access) are left in the
-- pages table so any historical access_definition_permissions rows remain
-- valid — they're just no longer referenced by the router.
-- Created 2026-05-27.

insert into public.pages (code, label, description, requires_role)
values ('admin', 'Admin', 'User, role, and access bundle management', 'admin')
on conflict (code) do nothing;
