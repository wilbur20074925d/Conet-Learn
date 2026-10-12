-- Student logins for CoNetLearn.
-- Run this once in the Supabase SQL editor after conet-schema.sql.
-- Safe to re-run.
--
-- Teachers create accounts with the starting password Password123.
-- Only a teacher can set that password again, from the Students panel.
-- The student then signs in with Password123.

create or replace function public.conet_hash_password(p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return crypt(p_password, gen_salt('bf', 10));
end;
$$;

revoke all on function public.conet_hash_password(text) from public;

create or replace function public.conet_create_student(p_email text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
  clean_email text := lower(trim(p_email));
  clean_name text := trim(p_name);
begin
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can create a student account';
  end if;
  if clean_name is null or length(clean_name) < 1 or length(clean_name) > 80 then
    raise exception 'invalid name';
  end if;
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean_email) then
    raise exception 'already registered';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    clean_email,
    public.conet_hash_password('Password123'),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', clean_name, 'role', 'student'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    new_id::text,
    new_id,
    jsonb_build_object(
      'sub', new_id::text,
      'email', clean_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  );

  update public."ConetUsers"
  set name = clean_name, email = clean_email, role = 'student'
  where auth_id = new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'already registered';
end;
$$;

create or replace function public.conet_reset_student_password(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_auth uuid;
begin
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can reset a password';
  end if;

  select auth_id
    into target_auth
  from public."ConetUsers"
  where id = p_user_id
    and role = 'student';

  if target_auth is null then
    raise exception 'Student not found';
  end if;

  update auth.users
  set
    encrypted_password = public.conet_hash_password('Password123'),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = target_auth;

  if not found then
    raise exception 'Student not found';
  end if;

  begin
    delete from auth.sessions where user_id::text = target_auth::text;
  exception
    when undefined_table or undefined_column then
      null;
  end;

  begin
    delete from auth.refresh_tokens where user_id::text = target_auth::text;
  exception
    when undefined_table or undefined_column then
      null;
  end;
end;
$$;

revoke all on function public.conet_create_student(text, text) from public;
revoke all on function public.conet_reset_student_password(uuid) from public;
grant execute on function public.conet_create_student(text, text) to authenticated;
grant execute on function public.conet_reset_student_password(uuid) to authenticated;
