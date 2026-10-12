-- Group Post submissions. Each submit keeps a copy; the live document is unchanged.
-- Safe to re-run.

create table if not exists public."ConetGroupPostSubmissions" (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  note_id uuid references public."ConetCollaborativeNotes" (id) on delete set null,
  user_id uuid not null references public."ConetUsers" (id) on delete cascade,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists "ConetGroupPostSubmissions_group_created_idx"
  on public."ConetGroupPostSubmissions" (group_id, created_at desc);

alter table public."ConetGroupPostSubmissions" enable row level security;

grant select, insert on public."ConetGroupPostSubmissions" to authenticated;

drop policy if exists "ConetGroupPostSubmissions_select" on public."ConetGroupPostSubmissions";
create policy "ConetGroupPostSubmissions_select" on public."ConetGroupPostSubmissions"
  for select to authenticated using (
    public.conet_am_teacher()
    or public.conet_is_member(group_id)
  );

drop policy if exists "ConetGroupPostSubmissions_insert" on public."ConetGroupPostSubmissions";
create policy "ConetGroupPostSubmissions_insert" on public."ConetGroupPostSubmissions"
  for insert to authenticated with check (
    user_id = public.conet_my_profile_id()
    and public.conet_is_member(group_id)
  );
