-- Let the AI teammate read each group member's individual note while building a reply.
-- Students still cannot read one another's notes through the app. Safe to re-run.

create or replace function public.conet_agent_group_context(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not (public.conet_am_teacher() or public.conet_is_member(p_group_id)) then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('name', person.name, 'content', person.content)
      order by person.name
    ),
    '[]'::jsonb
  )
  into result
  from (
    select u.name, d.content
    from public."ConetGroupMembers" m
    join public."ConetUsers" u on u.id = m.user_id
    left join public."ConetDocuments" d
      on d.group_id = m.group_id
     and d.user_id = m.user_id
    where m.group_id = p_group_id
      and u.role = 'student'
  ) person;

  return result;
end;
$$;

revoke all on function public.conet_agent_group_context(uuid) from public;
grant execute on function public.conet_agent_group_context(uuid) to authenticated;
