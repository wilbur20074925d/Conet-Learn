-- Let teachers read individual notes and each submission without joining the group.
-- Safe to re-run. Students still only read their own notes.

drop policy if exists "ConetDocuments_select" on public."ConetDocuments";
create policy "ConetDocuments_select" on public."ConetDocuments"
  for select to authenticated using (
    user_id = public.conet_my_profile_id()
    or public.conet_am_teacher()
  );

drop policy if exists "ConetDocumentHistory_select" on public."ConetDocumentHistory";
create policy "ConetDocumentHistory_select" on public."ConetDocumentHistory"
  for select to authenticated using (
    user_id = public.conet_my_profile_id()
    or public.conet_am_teacher()
  );
