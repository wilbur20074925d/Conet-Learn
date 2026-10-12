-- Groups that teachers create, and chat sessions students open inside a group.
-- Run this in the Supabase SQL editor for the current project (hnhuvcgksfxcrefmsfxu).
-- Safe to re-run. Uses only this project's existing Conet tables.

-- The old app placed every student into one seminar. The first time this file runs,
-- those automatic memberships are cleared so each student chooses a group.
do $$
begin
  create table if not exists public."ConetSchemaFlags" (
    id text primary key
  );
  if to_regclass('public."ConetSessions"') is null then
    insert into public."ConetSchemaFlags" (id)
    values ('clear-student-groups')
    on conflict do nothing;
  end if;
end $$;

create table if not exists public."ConetSessions" (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  title text not null,
  created_by uuid references public."ConetUsers" (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public."ConetMessages"
  add column if not exists session_id uuid references public."ConetSessions" (id) on delete cascade;

create index if not exists "ConetSessions_group_created_idx"
  on public."ConetSessions" (group_id, created_at desc);

create index if not exists "ConetMessages_session_created_idx"
  on public."ConetMessages" (session_id, created_at);

insert into public."ConetSessions" (group_id, title)
select g.id, 'General'
from public."ConetGroups" g
where exists (
  select 1 from public."ConetMessages" m
  where m.group_id = g.id and m.session_id is null
)
and not exists (
  select 1 from public."ConetSessions" s where s.group_id = g.id
);

update public."ConetMessages" m
set session_id = (
  select s.id
  from public."ConetSessions" s
  where s.group_id = m.group_id
  order by s.created_at
  limit 1
)
where m.session_id is null
  and exists (
    select 1 from public."ConetSessions" s where s.group_id = m.group_id
  );

do $$
begin
  if not exists (select 1 from public."ConetMessages" where session_id is null) then
    alter table public."ConetMessages" alter column session_id set not null;
  end if;
end $$;

do $$
begin
  if exists (select 1 from public."ConetSchemaFlags" where id = 'clear-student-groups') then
    delete from public."ConetGroupMembers" m
    using public."ConetUsers" u
    where m.user_id = u.id
      and u.role = 'student';
    delete from public."ConetSchemaFlags" where id = 'clear-student-groups';
  end if;
end $$;

drop table if exists public."ConetSchemaFlags";

alter table public."ConetSessions" enable row level security;

grant select, insert, update, delete on public."ConetSessions" to authenticated;

create or replace function public.conet_am_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."ConetUsers"
    where auth_id = auth.uid()
      and role = 'teacher'
  );
$$;

revoke all on function public.conet_am_teacher() from public;
grant execute on function public.conet_am_teacher() to authenticated;

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
    from public."ConetGroupMembers"
    where user_id = new.user_id
      and group_id <> new.group_id
  ) then
    raise exception 'already in a group';
  end if;
  return new;
end;
$$;

drop trigger if exists conet_one_student_group on public."ConetGroupMembers";
create trigger conet_one_student_group
  before insert on public."ConetGroupMembers"
  for each row execute function public.conet_guard_student_membership();

drop policy if exists "ConetGroups_select" on public."ConetGroups";
create policy "ConetGroups_select" on public."ConetGroups"
  for select to authenticated using (true);

drop policy if exists "ConetGroups_teacher_update" on public."ConetGroups";
create policy "ConetGroups_teacher_update" on public."ConetGroups"
  for update to authenticated
  using (public.conet_am_teacher())
  with check (public.conet_am_teacher());

drop policy if exists "ConetGroupMembers_select" on public."ConetGroupMembers";
create policy "ConetGroupMembers_select" on public."ConetGroupMembers"
  for select to authenticated using (
    public.conet_am_teacher()
    or user_id = public.conet_my_profile_id()
    or public.conet_is_member(group_id)
  );

drop policy if exists "ConetSessions_select" on public."ConetSessions";
create policy "ConetSessions_select" on public."ConetSessions"
  for select to authenticated using (
    public.conet_am_teacher()
    or public.conet_is_member(group_id)
  );

drop policy if exists "ConetSessions_insert" on public."ConetSessions";
create policy "ConetSessions_insert" on public."ConetSessions"
  for insert to authenticated with check (
    public.conet_is_member(group_id)
    and created_by = public.conet_my_profile_id()
  );

drop policy if exists "ConetSessions_delete" on public."ConetSessions";
create policy "ConetSessions_delete" on public."ConetSessions"
  for delete to authenticated using (
    public.conet_am_teacher()
    or created_by = public.conet_my_profile_id()
  );

drop policy if exists "ConetMessages_select" on public."ConetMessages";
create policy "ConetMessages_select" on public."ConetMessages"
  for select to authenticated using (
    public.conet_am_teacher()
    or public.conet_is_member(group_id)
  );

drop policy if exists "ConetMessages_insert" on public."ConetMessages";
create policy "ConetMessages_insert" on public."ConetMessages"
  for insert to authenticated with check (
    public.conet_is_member(group_id)
    and (
      user_id = public.conet_my_profile_id()
      or user_id = '00000000-0000-0000-0000-000000000999'
    )
    and exists (
      select 1
      from public."ConetSessions" s
      where s.id = session_id
        and s.group_id = group_id
    )
  );

drop policy if exists "ConetPresence_select" on public."ConetPresence";
create policy "ConetPresence_select" on public."ConetPresence"
  for select to authenticated using (
    public.conet_am_teacher()
    or public.conet_is_member(group_id)
  );

create or replace function public.conet_ensure_membership()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  profile public."ConetUsers"%rowtype;
  gid uuid;
  gname text;
  gmode integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into profile from public."ConetUsers" where auth_id = uid;
  if not found then
    insert into public."ConetUsers" (auth_id, email, name, role)
    values (uid, null, 'Student', 'student')
    returning * into profile;
  end if;

  select g.id, g.name, g.newintervene
    into gid, gname, gmode
  from public."ConetGroupMembers" m
  join public."ConetGroups" g on g.id = m.group_id
  where m.user_id = profile.id
  order by m.created_at
  limit 1;

  return jsonb_build_object(
    'group_id', gid,
    'group_name', gname,
    'newintervene', coalesce(gmode, 1),
    'user_id', profile.id
  );
end;
$$;

create or replace function public.conet_group_directory()
returns table (id uuid, name text, member_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    (
      select count(*)::integer
      from public."ConetGroupMembers" m
      join public."ConetUsers" u on u.id = m.user_id
      where m.group_id = g.id
        and u.role = 'student'
    ) as member_count
  from public."ConetGroups" g
  order by g.created_at;
$$;

revoke all on function public.conet_group_directory() from public;
grant execute on function public.conet_group_directory() to authenticated;

create or replace function public.conet_create_group(p_name text)
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

  insert into public."ConetGroups" (name, newintervene, intervene)
  values (clean, 1, true)
  returning id into gid;

  return gid;
end;
$$;

create or replace function public.conet_delete_group(p_group_id uuid)
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
    raise exception 'Only a teacher can delete a group';
  end if;
  if not exists (select 1 from public."ConetGroups" where id = p_group_id) then
    raise exception 'Group not found';
  end if;

  delete from public."ConetGroups" where id = p_group_id;
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

  if exists (select 1 from public."ConetGroupMembers" where user_id = profile.id) then
    raise exception 'already in a group';
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

  delete from public."ConetGroupMembers" where user_id = p_user_id;
  insert into public."ConetGroupMembers" (group_id, user_id)
  values (p_group_id, p_user_id);
end;
$$;

create or replace function public.conet_remove_student(p_user_id uuid)
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

  delete from public."ConetGroupMembers" where user_id = p_user_id;
end;
$$;

create or replace function public.conet_create_session(p_group_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.conet_my_profile_id();
  sid uuid;
  clean text := trim(coalesce(p_title, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if me is null then
    raise exception 'profile missing';
  end if;
  if not public.conet_is_member(p_group_id) then
    raise exception 'not a group member';
  end if;
  if public.conet_am_teacher() then
    raise exception 'Only students can create a chat session';
  end if;
  if clean = '' or char_length(clean) > 80 then
    raise exception 'invalid name';
  end if;

  insert into public."ConetSessions" (group_id, title, created_by)
  values (p_group_id, clean, me)
  returning id into sid;

  return sid;
end;
$$;

create or replace function public.conet_delete_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.conet_my_profile_id();
  owner uuid;
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select created_by, group_id into owner, gid
  from public."ConetSessions"
  where id = p_session_id;
  if gid is null then
    raise exception 'session not in group';
  end if;

  if public.conet_am_teacher() then
    delete from public."ConetSessions" where id = p_session_id;
    return;
  end if;

  if owner is not null and owner = me and public.conet_is_member(gid) then
    delete from public."ConetSessions" where id = p_session_id;
    return;
  end if;

  raise exception 'You cannot delete this chat session';
end;
$$;

drop function if exists public.conet_send_message(uuid, text, uuid);
create or replace function public.conet_send_message(
  p_group_id uuid,
  p_session_id uuid,
  p_content text,
  p_reply_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.conet_my_profile_id();
  mid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if me is null then
    raise exception 'profile missing';
  end if;
  if public.conet_am_teacher() then
    raise exception 'teachers view sessions';
  end if;
  if not public.conet_is_member(p_group_id) then
    raise exception 'not a group member';
  end if;
  if not exists (
    select 1 from public."ConetSessions"
    where id = p_session_id and group_id = p_group_id
  ) then
    raise exception 'session not in group';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'empty message';
  end if;
  if p_reply_to is not null and not exists (
    select 1 from public."ConetMessages"
    where id = p_reply_to and session_id = p_session_id
  ) then
    raise exception 'reply target not in this session';
  end if;

  insert into public."ConetMessages" (group_id, session_id, user_id, content, reply_to, is_reply)
  values (p_group_id, p_session_id, me, trim(p_content), p_reply_to, p_reply_to is not null)
  returning id into mid;

  return mid;
end;
$$;

drop function if exists public.conet_post_nate_message(uuid, text);
create or replace function public.conet_post_nate_message(
  p_group_id uuid,
  p_session_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_is_member(p_group_id) then
    raise exception 'not a group member';
  end if;
  if not exists (
    select 1 from public."ConetSessions"
    where id = p_session_id and group_id = p_group_id
  ) then
    raise exception 'session not in group';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'empty message';
  end if;

  insert into public."ConetMessages" (group_id, session_id, user_id, content, is_reply)
  values (
    p_group_id,
    p_session_id,
    '00000000-0000-0000-0000-000000000999',
    trim(p_content),
    false
  )
  returning id into mid;

  return mid;
end;
$$;

revoke all on function public.conet_create_group(text) from public;
revoke all on function public.conet_delete_group(uuid) from public;
revoke all on function public.conet_join_group(uuid) from public;
revoke all on function public.conet_move_student(uuid, uuid) from public;
revoke all on function public.conet_remove_student(uuid) from public;
revoke all on function public.conet_create_session(uuid, text) from public;
revoke all on function public.conet_delete_session(uuid) from public;
revoke all on function public.conet_send_message(uuid, uuid, text, uuid) from public;
revoke all on function public.conet_post_nate_message(uuid, uuid, text) from public;

grant execute on function public.conet_create_group(text) to authenticated;
grant execute on function public.conet_delete_group(uuid) to authenticated;
grant execute on function public.conet_join_group(uuid) to authenticated;
grant execute on function public.conet_move_student(uuid, uuid) to authenticated;
grant execute on function public.conet_remove_student(uuid) to authenticated;
grant execute on function public.conet_create_session(uuid, text) to authenticated;
grant execute on function public.conet_delete_session(uuid) to authenticated;
grant execute on function public.conet_send_message(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.conet_post_nate_message(uuid, uuid, text) to authenticated;
