-- public.users — application profile table, 1:1 with auth.users
-- Created 2026-05-25 as the first ERP schema.

create table if not exists public.users (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null,
  full_name             text,
  is_admin              boolean not null default false,
  must_change_password  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (lower(email));

-- updated_at auto-touch
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Auto-create a public.users row whenever an auth.users row is inserted.
-- Mirrors id + email and copies must_change_password from user_metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, must_change_password)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- RLS
alter table public.users enable row level security;

-- Read your own profile
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select to authenticated
  using (auth.uid() = id);

-- Update your own profile — but only the full_name column.
-- Privilege fields (is_admin, must_change_password) stay server-side.
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.users from authenticated, anon;
grant update (full_name) on public.users to authenticated;
