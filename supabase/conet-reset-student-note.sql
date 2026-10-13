-- Let a teacher clear one student's individual note in a group so they can answer again.
-- Safe to re-run.

create or replace function public.conet_reset_student_note(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doc_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.conet_am_teacher() then
    raise exception 'Only a teacher can reset a note';
  end if;
  if not exists (
    select 1
    from public."ConetGroupMembers" m
    join public."ConetUsers" u on u.id = m.user_id
    where m.group_id = p_group_id
      and m.user_id = p_user_id
      and u.role = 'student'
  ) then
    raise exception 'Student is not in this group';
  end if;

  select id into doc_id
  from public."ConetDocuments"
  where group_id = p_group_id and user_id = p_user_id;

  if doc_id is null then
    return;
  end if;

  delete from public."ConetDocumentHistory" where document_id = doc_id;

  update public."ConetDocuments"
  set
    content = jsonb_build_object(
      'field1', '',
      'field2', '',
      'part1_concept1', '',
      'part1_concept2', '',
      'savedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )::text,
    updated_at = clock_timestamp()
  where id = doc_id;
end;
$$;

revoke all on function public.conet_reset_student_note(uuid, uuid) from public;
grant execute on function public.conet_reset_student_note(uuid, uuid) to authenticated;
