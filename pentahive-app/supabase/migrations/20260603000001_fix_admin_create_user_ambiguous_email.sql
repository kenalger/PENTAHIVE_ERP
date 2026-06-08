-- Fix: admin_create_user threw "column reference 'email' is ambiguous" because
-- the function's RETURNS TABLE(... email text ...) declares an OUT column named
-- `email`, which shadows auth.users.email inside the duplicate-check query.
-- Qualifying the column reference (auth.users.email) resolves the ambiguity.
-- Created 2026-06-03.

create or replace function public.admin_create_user(p_email text)
returns table(user_id uuid, email text, temp_password text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid     uuid;
  v_pwd     text;
  v_chars   text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  v_i       int;
  v_clean   text;
begin
  -- 1. Authorize: caller must be an admin.
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden: only admins can create users';
  end if;

  -- 2. Validate / normalize email.
  v_clean := lower(trim(p_email));
  if v_clean is null or v_clean = '' then
    raise exception 'email required';
  end if;
  if v_clean !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address: %', p_email;
  end if;

  -- 3. Duplicate check. Fully-qualified to disambiguate from the OUT column.
  if exists (select 1 from auth.users u where lower(u.email) = v_clean) then
    raise exception 'a user with that email already exists';
  end if;

  -- 4. Generate a readable 14-char temp password.
  v_pwd := '';
  for v_i in 1..14 loop
    v_pwd := v_pwd || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
  end loop;

  -- 5. Create auth.users row.
  v_uid := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    v_clean,
    extensions.crypt(v_pwd, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('must_change_password', true),
    now(), now(),
    '', '', '', ''
  );

  -- 6. Mirror identity row so email password sign-in works.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_uid,
    v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_clean, 'email_verified', true),
    'email',
    now(), now(), now()
  );

  -- 7. Return one row with the credentials for the admin UI to display.
  return query select v_uid, v_clean, v_pwd;
end;
$$;

grant execute on function public.admin_create_user(text) to authenticated;
