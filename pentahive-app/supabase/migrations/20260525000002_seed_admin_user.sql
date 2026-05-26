-- Seed the first admin user: admin@gmail.com / 123456
-- Idempotent: only inserts if the email isn't already present.

do $$
declare
  new_uid uuid;
begin
  if exists (select 1 from auth.users where email = 'admin@gmail.com') then
    raise notice 'admin@gmail.com already exists, skipping seed';
    return;
  end if;

  new_uid := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_uid,
    'authenticated',
    'authenticated',
    'admin@gmail.com',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  -- Mirror identity row so password sign-in works on all Supabase Auth versions.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(),
    new_uid,
    new_uid::text,
    jsonb_build_object('sub', new_uid::text, 'email', 'admin@gmail.com', 'email_verified', true),
    'email',
    now(), now(), now()
  );

  -- The on_auth_user_created trigger already populated public.users.
  -- Promote it to admin.
  update public.users set is_admin = true where id = new_uid;
end
$$;
