-- Co-net Learn collaborative documentation (Yjs / TipTap sessions).
-- Safe to re-run. Mirrors StreamLearn-pro collaborative_notes for group docs.

create extension if not exists pgcrypto;

create table if not exists public."ConetCollaborativeNotes" (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public."ConetGroups" (id) on delete cascade,
  owner_id uuid not null references public."ConetUsers" (id) on delete cascade,
  title text not null default 'Untitled Documentation',
  content text not null default '',
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  last_edited_by uuid references public."ConetUsers" (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists "ConetCollaborativeNotes_group_updated_idx"
  on public."ConetCollaborativeNotes" (group_id, updated_at desc)
  where is_deleted = false;

alter table public."ConetCollaborativeNotes" enable row level security;

grant select, insert, update, delete on public."ConetCollaborativeNotes" to authenticated;
grant select, insert, update, delete on public."ConetCollaborativeNotes" to service_role;

-- Group members can read notes in their group; teachers can read all.
drop policy if exists "ConetCollaborativeNotes_select" on public."ConetCollaborativeNotes";
create policy "ConetCollaborativeNotes_select" on public."ConetCollaborativeNotes"
  for select to authenticated
  using (
    exists (
      select 1
      from public."ConetUsers" me
      where me.auth_id = auth.uid()
        and (
          me.role = 'teacher'
          or exists (
            select 1
            from public."ConetGroupMembers" gm
            where gm.group_id = "ConetCollaborativeNotes".group_id
              and gm.user_id = me.id
          )
        )
    )
  );

drop policy if exists "ConetCollaborativeNotes_insert" on public."ConetCollaborativeNotes";
create policy "ConetCollaborativeNotes_insert" on public."ConetCollaborativeNotes"
  for insert to authenticated
  with check (
    exists (
      select 1
      from public."ConetUsers" me
      join public."ConetGroupMembers" gm on gm.user_id = me.id
      where me.auth_id = auth.uid()
        and gm.group_id = "ConetCollaborativeNotes".group_id
        and me.id = "ConetCollaborativeNotes".owner_id
    )
  );

drop policy if exists "ConetCollaborativeNotes_update" on public."ConetCollaborativeNotes";
create policy "ConetCollaborativeNotes_update" on public."ConetCollaborativeNotes"
  for update to authenticated
  using (
    exists (
      select 1
      from public."ConetUsers" me
      where me.auth_id = auth.uid()
        and (
          me.role = 'teacher'
          or exists (
            select 1
            from public."ConetGroupMembers" gm
            where gm.group_id = "ConetCollaborativeNotes".group_id
              and gm.user_id = me.id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public."ConetUsers" me
      where me.auth_id = auth.uid()
        and (
          me.role = 'teacher'
          or exists (
            select 1
            from public."ConetGroupMembers" gm
            where gm.group_id = "ConetCollaborativeNotes".group_id
              and gm.user_id = me.id
          )
        )
    )
  );
