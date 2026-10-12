-- CoNetLearn tables. Names use the Conet prefix.
-- Safe to re-run. Does not touch other tables in this project.
-- Group chat sessions live in supabase/conet-sessions.sql. Run that file after this one.

create extension if not exists pgcrypto;

create table if not exists public."ConetUsers" (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users (id) on delete cascade,
  email text,
  name text not null,
  role text not null default 'student' check (role in ('teacher', 'student', 'ai')),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public."ConetGroups" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  newintervene integer not null default 1 check (newintervene in (1, 2, 3)),
  intervene boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public."ConetGroupMembers" (
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public."ConetMessages" (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  content text not null,
  reply_to uuid references public."ConetMessages" (id) on delete set null,
  is_reply boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public."ConetDocuments" (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public."ConetDocumentHistory" (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public."ConetDocuments" (id) on delete cascade,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  content text not null,
  is_submit boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public."ConetUserConsent" (
  user_id uuid primary key references public."ConetUsers" (id) on delete cascade,
  consent_given boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists "ConetMessages_group_created_idx"
  on public."ConetMessages" (group_id, created_at);

create index if not exists "ConetDocumentHistory_document_created_idx"
  on public."ConetDocumentHistory" (document_id, created_at desc);

insert into public."ConetUsers" (id, name, role)
values ('00000000-0000-0000-0000-000000000999', 'NATE', 'ai')
on conflict (id) do nothing;

alter table public."ConetUsers" enable row level security;
alter table public."ConetGroups" enable row level security;
alter table public."ConetGroupMembers" enable row level security;
alter table public."ConetMessages" enable row level security;
alter table public."ConetDocuments" enable row level security;
alter table public."ConetDocumentHistory" enable row level security;
alter table public."ConetUserConsent" enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public."ConetUsers" to authenticated;
grant select, insert, update, delete on public."ConetGroups" to authenticated;
grant select, insert, update, delete on public."ConetGroupMembers" to authenticated;
grant select, insert, update, delete on public."ConetMessages" to authenticated;
grant select, insert, update, delete on public."ConetDocuments" to authenticated;
grant select, insert, update, delete on public."ConetDocumentHistory" to authenticated;
grant select, insert, update, delete on public."ConetUserConsent" to authenticated;

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

revoke all on function public.conet_my_profile_id() from public;
revoke all on function public.conet_is_member(uuid) from public;
revoke all on function public.conet_is_teacher(uuid) from public;
revoke all on function public.conet_am_teacher() from public;
grant execute on function public.conet_my_profile_id() to authenticated;
grant execute on function public.conet_is_member(uuid) to authenticated;
grant execute on function public.conet_is_teacher(uuid) to authenticated;
grant execute on function public.conet_am_teacher() to authenticated;

drop policy if exists "ConetUsers_select" on public."ConetUsers";
create policy "ConetUsers_select" on public."ConetUsers"
  for select to authenticated using (true);

drop policy if exists "ConetUsers_insert_own" on public."ConetUsers";
create policy "ConetUsers_insert_own" on public."ConetUsers"
  for insert to authenticated with check (auth_id = auth.uid());

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
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ConetMessages'
      and column_name = 'session_id'
  ) then
    execute 'drop policy if exists "ConetMessages_insert" on public."ConetMessages"';
    execute $policy$
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
      )
    $policy$;
  end if;
end $$;

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

create or replace function public.conet_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."ConetUsers" (auth_id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'student'), '@', 1)),
    case
      when coalesce(new.raw_user_meta_data->>'role', 'student') = 'teacher' then 'teacher'
      else 'student'
    end
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_conet on auth.users;
create trigger on_auth_user_created_conet
  after insert on auth.users
  for each row execute function public.conet_handle_new_user();

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
    'newintervene', gmode,
    'user_id', profile.id
  );
end;
$$;

revoke all on function public.conet_ensure_membership() from public;
grant execute on function public.conet_ensure_membership() to authenticated;

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
  for select to authenticated using (
    public.conet_am_teacher()
    or public.conet_is_member(group_id)
  );

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

-- Confirm the initial classroom accounts if they already exist in Auth.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email in ('1@outlook.com', 'yangyuebo@outlook.com');

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
