---
name: pentahive-auth-model
description: How auth/roles/admin work in the PENTAHIVE/JKL ERP and how to seed a login user via SQL
metadata:
  type: project
---

PENTAHIVE_ERP (pentahive-app, Angular 21 + Supabase, project ref `zpfkhcnxtiyojodtmepn`) auth model:

- Login is Supabase Auth email+password (`signInWithPassword`). No self-signup — accounts are admin-provisioned.
- Roles live in `public.roles` (`admin=1, manager=2, user=3`) and `public.user_roles(user_id uuid, role_id smallint)`. Page permissions come from view `v_user_effective_access`.
- Frontend `AuthService.canDo()` short-circuits: `admin` role → true for everything; `manager` → approve on everything. So role_id=1 = full access to all pages.
- `environment.adminEmails` (`admin@gmail.com`, `kadimaymay.mhi@gmail.com`) is a UI-only admin fallback; the `create-user` Edge Function enforces the real allowlist check and needs an existing admin's JWT (circular for bootstrapping).

**Seeding a working login via SQL only (MCP has no Auth admin API):** insert into `auth.users` (instance_id, id, aud='authenticated', role='authenticated', email, encrypted_password=`crypt('pw', gen_salt('bf'))`, email_confirmed_at=now(), raw_app_meta_data `{"provider":"email","providers":["email"]}`) + `auth.identities` (provider='email', provider_id=user_id::text, identity_data `{sub,email,email_verified}`) + `user_roles`. **Critical gotcha:** GoTrue throws a 500 on login if token columns are NULL — must set `confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token` to `''`.

Created an admin login `wimpycoder@jkl.local` / `123456` (role admin) on 2026-06-13 for the dev to inspect the ERP — weak password, intended for local use only.

Dev runs the app with `npm start` (Node was installed via winget to `C:\Program Files\nodejs`; Angular CLI is local-only, no global `ng`). See [[ahjin-guild-agents]] for the custom agent roster.
