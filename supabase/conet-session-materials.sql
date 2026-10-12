-- Class-wide instructions and materials shown from the Session Materials button.
-- Safe to re-run. Run this in the Supabase SQL editor after supabase/conet-schema.sql.

create table if not exists public."ConetSessionBrief" (
  id text primary key,
  title text not null default '',
  instructions text not null default '',
  materials jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public."ConetUsers" (id) on delete set null
);

alter table public."ConetSessionBrief" enable row level security;

grant select, insert, update on public."ConetSessionBrief" to authenticated;

drop policy if exists "ConetSessionBrief_select" on public."ConetSessionBrief";
create policy "ConetSessionBrief_select" on public."ConetSessionBrief"
  for select to authenticated using (true);

drop policy if exists "ConetSessionBrief_teacher_insert" on public."ConetSessionBrief";
create policy "ConetSessionBrief_teacher_insert" on public."ConetSessionBrief"
  for insert to authenticated
  with check (public.conet_am_teacher());

drop policy if exists "ConetSessionBrief_teacher_update" on public."ConetSessionBrief";
create policy "ConetSessionBrief_teacher_update" on public."ConetSessionBrief"
  for update to authenticated
  using (public.conet_am_teacher())
  with check (public.conet_am_teacher());

insert into public."ConetSessionBrief" (id, title, instructions, materials)
values ('current', '', '', '[]'::jsonb)
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = 'ConetSessionBrief'
    ) then
      alter publication supabase_realtime add table public."ConetSessionBrief";
    end if;
  end if;
end $$;
