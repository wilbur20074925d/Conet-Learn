-- Student and teacher logins for CoNetLearn.
-- Run this once in the Supabase SQL editor after conet-schema.sql.
-- Safe to re-run.
--
-- Students sign in with username = name without spaces (uppercase), password = student ID.
-- Teachers sign in with their email and the password set here.

alter table public."ConetUsers" add column if not exists student_id text;

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

create or replace function public.conet_create_student(
  p_email text,
  p_name text,
  p_password text default null,
  p_student_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
  clean_email text := lower(trim(p_email));
  clean_name text := trim(p_name);
  clean_password text := coalesce(nullif(trim(p_password), ''), 'Password123');
  clean_student_id text := nullif(trim(p_student_id), '');
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
  if length(clean_password) < 1 or length(clean_password) > 128 then
    raise exception 'invalid password';
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
    public.conet_hash_password(clean_password),
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
  set
    name = clean_name,
    email = clean_email,
    role = 'student',
    student_id = clean_student_id
  where auth_id = new_id;

  return new_id;
exception
  when unique_violation then
    raise exception 'already registered';
end;
$$;

create or replace function public.conet_create_teacher(p_email text, p_name text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid := gen_random_uuid();
  clean_email text := lower(trim(p_email));
  clean_name text := trim(p_name);
  clean_password text := trim(p_password);
begin
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can create a teacher account';
  end if;
  if clean_name is null or length(clean_name) < 1 or length(clean_name) > 80 then
    raise exception 'invalid name';
  end if;
  if clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid email';
  end if;
  if length(clean_password) < 8 or length(clean_password) > 128 then
    raise exception 'invalid password';
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
    public.conet_hash_password(clean_password),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', clean_name, 'role', 'teacher'),
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
  set name = clean_name, email = clean_email, role = 'teacher', student_id = null
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
  stored_id text;
  next_password text;
begin
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can reset a password';
  end if;

  select auth_id, student_id
    into target_auth, stored_id
  from public."ConetUsers"
  where id = p_user_id
    and role = 'student';

  if target_auth is null then
    raise exception 'Student not found';
  end if;

  next_password := coalesce(nullif(trim(stored_id), ''), 'Password123');

  update auth.users
  set
    encrypted_password = public.conet_hash_password(next_password),
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

create or replace function public.conet_delete_students(p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  uid uuid;
  target_auth uuid;
  deleted_count integer := 0;
begin
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can delete student accounts';
  end if;
  if p_user_ids is null or coalesce(array_length(p_user_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach uid in array p_user_ids loop
    select auth_id
      into target_auth
    from public."ConetUsers"
    where id = uid
      and role = 'student';

    if target_auth is not null then
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

      delete from auth.users where id = target_auth;
      deleted_count := deleted_count + 1;
    end if;
  end loop;

  return deleted_count;
end;
$$;

revoke all on function public.conet_create_student(text, text, text, text) from public;
revoke all on function public.conet_create_teacher(text, text, text) from public;
revoke all on function public.conet_reset_student_password(uuid) from public;
revoke all on function public.conet_delete_students(uuid[]) from public;
grant execute on function public.conet_create_student(text, text, text, text) to authenticated;
grant execute on function public.conet_create_teacher(text, text, text) to authenticated;
grant execute on function public.conet_reset_student_password(uuid) to authenticated;
grant execute on function public.conet_delete_students(uuid[]) to authenticated;
