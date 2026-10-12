-- Classes, the sessions inside them, and the groups inside each session.
-- Session materials are stored per class session. Teachers can upload files
-- into the conet-materials bucket.
-- Re-running this also lets a student join one group in each session.
-- Safe to re-run. Run this in the Supabase SQL editor after supabase/conet-sessions.sql.

create table if not exists public."ConetClasses" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public."ConetClassSessions" (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public."ConetClasses" (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

alter table public."ConetGroups"
  add column if not exists class_session_id uuid references public."ConetClassSessions" (id) on delete cascade;

create index if not exists "ConetClassSessions_class_created_idx"
  on public."ConetClassSessions" (class_id, created_at);

create index if not exists "ConetGroups_class_session_idx"
  on public."ConetGroups" (class_session_id);

alter table public."ConetClasses" enable row level security;
alter table public."ConetClassSessions" enable row level security;

grant select, insert, update, delete on public."ConetClasses" to authenticated;
grant select, insert, update, delete on public."ConetClassSessions" to authenticated;

drop policy if exists "ConetClasses_select" on public."ConetClasses";
create policy "ConetClasses_select" on public."ConetClasses"
  for select to authenticated using (true);

drop policy if exists "ConetClasses_teacher_write" on public."ConetClasses";
create policy "ConetClasses_teacher_write" on public."ConetClasses"
  for all to authenticated
  using (public.conet_am_teacher())
  with check (public.conet_am_teacher());

drop policy if exists "ConetClassSessions_select" on public."ConetClassSessions";
create policy "ConetClassSessions_select" on public."ConetClassSessions"
  for select to authenticated using (true);

drop policy if exists "ConetClassSessions_teacher_write" on public."ConetClassSessions";
create policy "ConetClassSessions_teacher_write" on public."ConetClassSessions"
  for all to authenticated
  using (public.conet_am_teacher())
  with check (public.conet_am_teacher());

-- Existing groups become the first session of a class named Class.
do $$
declare
  class_id uuid;
  session_id uuid;
begin
  if exists (select 1 from public."ConetGroups") and not exists (select 1 from public."ConetClasses") then
    insert into public."ConetClasses" (name) values ('Class') returning id into class_id;
    insert into public."ConetClassSessions" (class_id, title) values (class_id, 'Session 1') returning id into session_id;
    update public."ConetGroups" set class_session_id = session_id where class_session_id is null;
    if to_regclass('public."ConetSessionBrief"') is not null then
      insert into public."ConetSessionBrief" (id, title, instructions, materials, updated_at, updated_by)
      select session_id::text, title, instructions, materials, updated_at, updated_by
      from public."ConetSessionBrief"
      where id = 'current'
      on conflict (id) do nothing;
    end if;
  end if;
end $$;

create or replace function public.conet_create_group_in_session(p_name text, p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  clean text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can create a group';
  end if;
  if clean = '' or char_length(clean) > 80 then
    raise exception 'invalid name';
  end if;
  if not exists (select 1 from public."ConetClassSessions" where id = p_session_id) then
    raise exception 'Session not found';
  end if;

  insert into public."ConetGroups" (name, newintervene, intervene, class_session_id)
  values (clean, 1, true, p_session_id)
  returning id into gid;

  insert into public."ConetSessions" (group_id, title)
  values (gid, clean);

  return gid;
end;
$$;

revoke all on function public.conet_create_group_in_session(text, uuid) from public;
grant execute on function public.conet_create_group_in_session(text, uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('conet-materials', 'conet-materials', true)
on conflict (id) do update set public = true;

drop policy if exists "conet_materials_read" on storage.objects;
create policy "conet_materials_read" on storage.objects
  for select to public
  using (bucket_id = 'conet-materials');

drop policy if exists "conet_materials_teacher_insert" on storage.objects;
create policy "conet_materials_teacher_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'conet-materials' and public.conet_am_teacher());

drop policy if exists "conet_materials_teacher_update" on storage.objects;
create policy "conet_materials_teacher_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'conet-materials' and public.conet_am_teacher())
  with check (bucket_id = 'conet-materials' and public.conet_am_teacher());

drop policy if exists "conet_materials_teacher_delete" on storage.objects;
create policy "conet_materials_teacher_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'conet-materials' and public.conet_am_teacher());

-- A student may belong to one group per class session, and to many sessions.
create or replace function public.conet_guard_student_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
begin
  select role into member_role from public."ConetUsers" where id = new.user_id;
  if member_role = 'student' and exists (
    select 1
    from public."ConetGroupMembers" member
    join public."ConetGroups" existing on existing.id = member.group_id
    join public."ConetGroups" incoming on incoming.id = new.group_id
    where member.user_id = new.user_id
      and member.group_id <> new.group_id
      and existing.class_session_id is not distinct from incoming.class_session_id
  ) then
    raise exception 'already in this session';
  end if;
  return new;
end;
$$;

create or replace function public.conet_join_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public."ConetUsers"%rowtype;
  gname text;
  gmode integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into profile from public."ConetUsers" where auth_id = auth.uid();
  if not found then
    raise exception 'profile missing';
  end if;
  if profile.role <> 'student' then
    raise exception 'Only students can join a group';
  end if;

  perform pg_advisory_xact_lock(hashtext(profile.id::text));

  if exists (
    select 1
    from public."ConetGroupMembers" member
    join public."ConetGroups" existing on existing.id = member.group_id
    join public."ConetGroups" target on target.id = p_group_id
    where member.user_id = profile.id
      and existing.class_session_id is not distinct from target.class_session_id
  ) then
    raise exception 'already in this session';
  end if;

  select name, newintervene into gname, gmode
  from public."ConetGroups"
  where id = p_group_id;
  if gname is null then
    raise exception 'Group not found';
  end if;

  insert into public."ConetGroupMembers" (group_id, user_id)
  values (p_group_id, profile.id);

  return jsonb_build_object(
    'group_id', p_group_id,
    'group_name', gname,
    'newintervene', gmode
  );
end;
$$;

create or replace function public.conet_move_student(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can move a student';
  end if;
  if not exists (
    select 1 from public."ConetUsers" where id = p_user_id and role = 'student'
  ) then
    raise exception 'That person is not a student';
  end if;
  if not exists (select 1 from public."ConetGroups" where id = p_group_id) then
    raise exception 'Group not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  delete from public."ConetGroupMembers" member
  using public."ConetGroups" existing, public."ConetGroups" target
  where member.user_id = p_user_id
    and existing.id = member.group_id
    and target.id = p_group_id
    and existing.class_session_id is not distinct from target.class_session_id;

  insert into public."ConetGroupMembers" (group_id, user_id)
  values (p_group_id, p_user_id);
end;
$$;

create or replace function public.conet_transfer_student(
  p_user_id uuid,
  p_from_group_id uuid,
  p_to_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can move a student';
  end if;
  if p_from_group_id = p_to_group_id then
    return;
  end if;
  if not exists (
    select 1 from public."ConetUsers" where id = p_user_id and role = 'student'
  ) then
    raise exception 'That person is not a student';
  end if;
  if not exists (select 1 from public."ConetGroups" where id = p_to_group_id) then
    raise exception 'Group not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  delete from public."ConetGroupMembers"
  where user_id = p_user_id
    and group_id = p_from_group_id;

  delete from public."ConetGroupMembers" member
  using public."ConetGroups" existing, public."ConetGroups" target
  where member.user_id = p_user_id
    and existing.id = member.group_id
    and target.id = p_to_group_id
    and existing.class_session_id is not distinct from target.class_session_id;

  insert into public."ConetGroupMembers" (group_id, user_id)
  values (p_to_group_id, p_user_id);
end;
$$;

create or replace function public.conet_remove_student_from_group(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can remove a student';
  end if;
  if not exists (
    select 1 from public."ConetUsers" where id = p_user_id and role = 'student'
  ) then
    raise exception 'That person is not a student';
  end if;

  delete from public."ConetGroupMembers"
  where user_id = p_user_id
    and group_id = p_group_id;
end;
$$;

revoke all on function public.conet_transfer_student(uuid, uuid, uuid) from public;
grant execute on function public.conet_transfer_student(uuid, uuid, uuid) to authenticated;

revoke all on function public.conet_remove_student_from_group(uuid, uuid) from public;
grant execute on function public.conet_remove_student_from_group(uuid, uuid) to authenticated;
