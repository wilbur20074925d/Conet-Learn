-- Classes, the sessions inside them, and the groups inside each session.
-- Session materials are stored per class session. Teachers can upload files
-- into the conet-materials bucket.
-- Re-running this lets a teacher place each student in one class, in more than one
-- session of that class, and in one group inside each session.
-- Students cannot place themselves.
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

-- One class per student. A student can then be placed in more than one session of that class.
create table if not exists public."ConetClassMembers" (
  class_id uuid not null references public."ConetClasses" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create unique index if not exists "ConetClassMembers_one_class_idx"
  on public."ConetClassMembers" (user_id);

create table if not exists public."ConetSessionMembers" (
  class_session_id uuid not null references public."ConetClassSessions" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_session_id, user_id)
);

alter table public."ConetClassMembers" enable row level security;
alter table public."ConetSessionMembers" enable row level security;

grant select on public."ConetClassMembers" to authenticated;
grant select on public."ConetSessionMembers" to authenticated;

drop policy if exists "ConetClassMembers_select" on public."ConetClassMembers";
create policy "ConetClassMembers_select" on public."ConetClassMembers"
  for select to authenticated using (true);

drop policy if exists "ConetSessionMembers_select" on public."ConetSessionMembers";
create policy "ConetSessionMembers_select" on public."ConetSessionMembers"
  for select to authenticated using (true);

-- Keep the earliest class and the earliest group in each session for students already placed.
insert into public."ConetClassMembers" (class_id, user_id, created_at)
select distinct on (member.user_id) session.class_id, member.user_id, member.created_at
from public."ConetGroupMembers" member
join public."ConetUsers" student on student.id = member.user_id and student.role = 'student'
join public."ConetGroups" grp on grp.id = member.group_id
join public."ConetClassSessions" session on session.id = grp.class_session_id
order by member.user_id, member.created_at
on conflict (user_id) do nothing;

delete from public."ConetGroupMembers" member
using public."ConetGroups" grp
join public."ConetClassSessions" session on session.id = grp.class_session_id
where member.group_id = grp.id
  and exists (
    select 1
    from public."ConetClassMembers" enrolled
    where enrolled.user_id = member.user_id
      and enrolled.class_id <> session.class_id
  );

delete from public."ConetGroupMembers" member
using public."ConetGroups" grp
where member.group_id = grp.id
  and grp.class_session_id is not null
  and exists (
    select 1
    from public."ConetGroupMembers" earlier
    join public."ConetGroups" earlier_group on earlier_group.id = earlier.group_id
    where earlier.user_id = member.user_id
      and earlier_group.class_session_id = grp.class_session_id
      and (earlier.created_at, earlier.group_id) < (member.created_at, member.group_id)
  );

insert into public."ConetSessionMembers" (class_session_id, user_id, created_at)
select distinct on (grp.class_session_id, member.user_id) grp.class_session_id, member.user_id, member.created_at
from public."ConetGroupMembers" member
join public."ConetGroups" grp on grp.id = member.group_id
join public."ConetClassSessions" session on session.id = grp.class_session_id
join public."ConetClassMembers" enrolled
  on enrolled.user_id = member.user_id
 and enrolled.class_id = session.class_id
where grp.class_session_id is not null
order by grp.class_session_id, member.user_id, member.created_at
on conflict (class_session_id, user_id) do nothing;

-- One group per session. A student may belong to groups in different sessions of the same class.
create or replace function public.conet_clear_session_groups(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public."ConetGroupMembers" member
  using public."ConetGroups" existing, public."ConetGroups" target
  where member.user_id = p_user_id
    and member.group_id <> p_group_id
    and existing.id = member.group_id
    and target.id = p_group_id
    and existing.class_session_id is not distinct from target.class_session_id;
end;
$$;

revoke all on function public.conet_clear_session_groups(uuid, uuid) from public;

create or replace function public.conet_guard_student_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_role text;
  session_id uuid;
begin
  select role into member_role from public."ConetUsers" where id = new.user_id;
  if member_role is distinct from 'student' then
    return new;
  end if;

  select class_session_id into session_id from public."ConetGroups" where id = new.group_id;
  if session_id is not null and not exists (
    select 1
    from public."ConetSessionMembers"
    where class_session_id = session_id
      and user_id = new.user_id
  ) then
    raise exception 'not in this session';
  end if;

  if exists (
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  raise exception 'Students cannot join a group';
end;
$$;

create or replace function public.conet_place_students_in_class(p_class_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  placed_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can place a student';
  end if;
  if not exists (select 1 from public."ConetClasses" where id = p_class_id) then
    raise exception 'Class not found';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) < 1 then
    raise exception 'Choose a student';
  end if;

  foreach placed_id in array p_user_ids loop
    if not exists (
      select 1 from public."ConetUsers" where id = placed_id and role = 'student'
    ) then
      raise exception 'That person is not a student';
    end if;
    if exists (
      select 1 from public."ConetClassMembers"
      where user_id = placed_id
        and class_id <> p_class_id
    ) then
      raise exception 'already in another class';
    end if;
    insert into public."ConetClassMembers" (class_id, user_id)
    values (p_class_id, placed_id)
    on conflict (class_id, user_id) do nothing;
  end loop;
end;
$$;

create or replace function public.conet_place_students_in_session(p_session_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  placed_id uuid;
  parent_class uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can place a student';
  end if;

  select class_id into parent_class from public."ConetClassSessions" where id = p_session_id;
  if parent_class is null then
    raise exception 'Session not found';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) < 1 then
    raise exception 'Choose a student';
  end if;

  foreach placed_id in array p_user_ids loop
    if not exists (
      select 1 from public."ConetClassMembers"
      where class_id = parent_class
        and user_id = placed_id
    ) then
      raise exception 'not in this class';
    end if;
    insert into public."ConetSessionMembers" (class_session_id, user_id)
    values (p_session_id, placed_id)
    on conflict (class_session_id, user_id) do nothing;
  end loop;
end;
$$;

create or replace function public.conet_place_students_in_group(p_group_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  placed_id uuid;
  session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can place a student';
  end if;

  select class_session_id into session_id from public."ConetGroups" where id = p_group_id;
  if session_id is null then
    raise exception 'Group not found';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) < 1 then
    raise exception 'Choose a student';
  end if;

  foreach placed_id in array p_user_ids loop
    if not exists (
      select 1 from public."ConetSessionMembers"
      where class_session_id = session_id
        and user_id = placed_id
    ) then
      raise exception 'not in this session';
    end if;

    perform pg_advisory_xact_lock(hashtext(placed_id::text));
    perform public.conet_clear_session_groups(placed_id, p_group_id);

    insert into public."ConetGroupMembers" (group_id, user_id)
    values (p_group_id, placed_id)
    on conflict (group_id, user_id) do nothing;
  end loop;
end;
$$;

create or replace function public.conet_move_student(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.conet_place_students_in_group(p_group_id, array[p_user_id]);
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
  if p_from_group_id = p_to_group_id then
    return;
  end if;
  perform public.conet_place_students_in_group(p_to_group_id, array[p_user_id]);
end;
$$;

revoke all on function public.conet_place_students_in_class(uuid, uuid[]) from public;
revoke all on function public.conet_place_students_in_session(uuid, uuid[]) from public;
revoke all on function public.conet_place_students_in_group(uuid, uuid[]) from public;
grant execute on function public.conet_place_students_in_class(uuid, uuid[]) to authenticated;
grant execute on function public.conet_place_students_in_session(uuid, uuid[]) to authenticated;
grant execute on function public.conet_place_students_in_group(uuid, uuid[]) to authenticated;

create or replace function public.conet_remove_student_from_session(p_user_id uuid, p_session_id uuid)
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

  delete from public."ConetGroupMembers" member
  using public."ConetGroups" grp
  where member.user_id = p_user_id
    and grp.id = member.group_id
    and grp.class_session_id = p_session_id;

  delete from public."ConetSessionMembers"
  where user_id = p_user_id
    and class_session_id = p_session_id;
end;
$$;

create or replace function public.conet_remove_student_from_class(p_user_id uuid, p_class_id uuid)
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

  delete from public."ConetGroupMembers" member
  using public."ConetGroups" grp
  join public."ConetClassSessions" session on session.id = grp.class_session_id
  where member.user_id = p_user_id
    and grp.id = member.group_id
    and session.class_id = p_class_id;

  delete from public."ConetSessionMembers" member
  using public."ConetClassSessions" session
  where member.user_id = p_user_id
    and session.id = member.class_session_id
    and session.class_id = p_class_id;

  delete from public."ConetClassMembers"
  where user_id = p_user_id
    and class_id = p_class_id;
end;
$$;

revoke all on function public.conet_remove_student_from_session(uuid, uuid) from public;
revoke all on function public.conet_remove_student_from_class(uuid, uuid) from public;
grant execute on function public.conet_remove_student_from_session(uuid, uuid) to authenticated;
grant execute on function public.conet_remove_student_from_class(uuid, uuid) to authenticated;

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
