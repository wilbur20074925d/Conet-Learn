-- Fix infinite recursion in ConetGroupMembers RLS and unblock chat/document writes.
-- Run this in the Supabase SQL editor for project hnhuvcgksfxcrefmsfxu.

create or replace function public.conet_my_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public."ConetUsers"
  where auth_id = auth.uid()
  limit 1;
$$;

create or replace function public.conet_is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."ConetGroupMembers" m
    join public."ConetUsers" u on u.id = m.user_id
    where m.group_id = p_group_id
      and u.auth_id = auth.uid()
  );
$$;

create or replace function public.conet_is_teacher(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public."ConetGroupMembers" m
    join public."ConetUsers" u on u.id = m.user_id
    where m.group_id = p_group_id
      and u.auth_id = auth.uid()
      and u.role = 'teacher'
  );
$$;

revoke all on function public.conet_my_profile_id() from public;
revoke all on function public.conet_is_member(uuid) from public;
revoke all on function public.conet_is_teacher(uuid) from public;
grant execute on function public.conet_my_profile_id() to authenticated;
grant execute on function public.conet_is_member(uuid) to authenticated;
grant execute on function public.conet_is_teacher(uuid) to authenticated;

drop policy if exists "ConetGroups_select" on public."ConetGroups";
create policy "ConetGroups_select" on public."ConetGroups"
  for select to authenticated using (public.conet_is_member(id));

drop policy if exists "ConetGroups_teacher_update" on public."ConetGroups";
create policy "ConetGroups_teacher_update" on public."ConetGroups"
  for update to authenticated using (public.conet_is_teacher(id));

drop policy if exists "ConetGroupMembers_select" on public."ConetGroupMembers";
create policy "ConetGroupMembers_select" on public."ConetGroupMembers"
  for select to authenticated using (public.conet_is_member(group_id));

drop policy if exists "ConetMessages_select" on public."ConetMessages";
create policy "ConetMessages_select" on public."ConetMessages"
  for select to authenticated using (public.conet_is_member(group_id));

drop policy if exists "ConetMessages_insert" on public."ConetMessages";
create policy "ConetMessages_insert" on public."ConetMessages"
  for insert to authenticated with check (
    public.conet_is_member(group_id)
    and (
      user_id = public.conet_my_profile_id()
      or user_id = '00000000-0000-0000-0000-000000000999'
    )
  );

drop policy if exists "ConetDocuments_select" on public."ConetDocuments";
create policy "ConetDocuments_select" on public."ConetDocuments"
  for select to authenticated using (user_id = public.conet_my_profile_id());

drop policy if exists "ConetDocuments_insert" on public."ConetDocuments";
create policy "ConetDocuments_insert" on public."ConetDocuments"
  for insert to authenticated with check (user_id = public.conet_my_profile_id());

drop policy if exists "ConetDocuments_update" on public."ConetDocuments";
create policy "ConetDocuments_update" on public."ConetDocuments"
  for update to authenticated
  using (user_id = public.conet_my_profile_id())
  with check (user_id = public.conet_my_profile_id());

drop policy if exists "ConetDocumentHistory_select" on public."ConetDocumentHistory";
create policy "ConetDocumentHistory_select" on public."ConetDocumentHistory"
  for select to authenticated using (user_id = public.conet_my_profile_id());

drop policy if exists "ConetDocumentHistory_insert" on public."ConetDocumentHistory";
create policy "ConetDocumentHistory_insert" on public."ConetDocumentHistory"
  for insert to authenticated with check (user_id = public.conet_my_profile_id());

drop policy if exists "ConetUserConsent_all" on public."ConetUserConsent";
create policy "ConetUserConsent_all" on public."ConetUserConsent"
  for all to authenticated
  using (user_id = public.conet_my_profile_id())
  with check (user_id = public.conet_my_profile_id());

create or replace function public.conet_send_message(
  p_group_id uuid,
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
  if not public.conet_is_member(p_group_id) then
    raise exception 'not a group member';
  end if;
  if nullif(trim(p_content), '') is null then
    raise exception 'empty message';
  end if;

  insert into public."ConetMessages" (group_id, user_id, content, reply_to, is_reply)
  values (p_group_id, me, trim(p_content), p_reply_to, p_reply_to is not null)
  returning id into mid;

  return mid;
end;
$$;

create or replace function public.conet_post_nate_message(
  p_group_id uuid,
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
  if nullif(trim(p_content), '') is null then
    raise exception 'empty message';
  end if;

  insert into public."ConetMessages" (group_id, user_id, content, is_reply)
  values (p_group_id, '00000000-0000-0000-0000-000000000999', trim(p_content), false)
  returning id into mid;

  return mid;
end;
$$;

revoke all on function public.conet_send_message(uuid, text, uuid) from public;
revoke all on function public.conet_post_nate_message(uuid, text) from public;
grant execute on function public.conet_send_message(uuid, text, uuid) to authenticated;
grant execute on function public.conet_post_nate_message(uuid, text) to authenticated;

-- Keep teacher / student roles aligned with the seed accounts.
update public."ConetUsers"
set
  email = coalesce(email, '1@outlook.com'),
  name = case when name in ('Student', '1') then 'Teacher' else name end,
  role = 'teacher'
where auth_id in (
  select id from auth.users where email = '1@outlook.com'
);

update public."ConetUsers"
set
  email = coalesce(email, 'yangyuebo@outlook.com'),
  role = 'student'
where auth_id in (
  select id from auth.users where email = 'yangyuebo@outlook.com'
);

-- Who is currently in the CoNet Seminar, stored in the database and broadcast live.
create table if not exists public."ConetPresence" (
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists "ConetPresence_group_seen_idx"
  on public."ConetPresence" (group_id, last_seen desc);

alter table public."ConetPresence" enable row level security;
alter table public."ConetMessages" replica identity full;
alter table public."ConetPresence" replica identity full;

grant select, insert, update, delete on public."ConetPresence" to authenticated;

drop policy if exists "ConetPresence_select" on public."ConetPresence";
create policy "ConetPresence_select" on public."ConetPresence"
  for select to authenticated using (public.conet_is_member(group_id));

drop policy if exists "ConetPresence_insert" on public."ConetPresence";
create policy "ConetPresence_insert" on public."ConetPresence"
  for insert to authenticated with check (
    public.conet_is_member(group_id)
    and user_id = public.conet_my_profile_id()
  );

drop policy if exists "ConetPresence_update" on public."ConetPresence";
create policy "ConetPresence_update" on public."ConetPresence"
  for update to authenticated
  using (user_id = public.conet_my_profile_id())
  with check (
    public.conet_is_member(group_id)
    and user_id = public.conet_my_profile_id()
  );

create or replace function public.conet_touch_presence(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := public.conet_my_profile_id();
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

  insert into public."ConetPresence" (group_id, user_id, last_seen)
  values (p_group_id, me, now())
  on conflict (group_id, user_id)
  do update set last_seen = now();
end;
$$;

revoke all on function public.conet_touch_presence(uuid) from public;
grant execute on function public.conet_touch_presence(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public."ConetMessages";
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public."ConetPresence";
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
