-- Idempotent Remy welcome when a group chat session starts (AI modes 1–2 only).

create or replace function public.conet_ensure_agent_opening(
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
  mode int;
  clean text := trim(coalesce(p_content, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not (public.conet_am_teacher() or public.conet_is_member(p_group_id)) then
    raise exception 'not allowed';
  end if;
  if clean = '' then
    raise exception 'empty message';
  end if;

  select coalesce(g.newintervene, 1)
  into mode
  from public."ConetGroups" g
  where g.id = p_group_id;
  if not found then
    raise exception 'group not found';
  end if;
  if mode = 3 then
    return null;
  end if;

  if not exists (
    select 1
    from public."ConetSessions" s
    where s.id = p_session_id and s.group_id = p_group_id
  ) then
    raise exception 'session not in group';
  end if;

  if exists (
    select 1
    from public."ConetMessages" m
    where m.session_id = p_session_id
      and m.user_id = '00000000-0000-0000-0000-000000000999'
      and m.content like 'Hi everyone, I''m %'
  ) then
    return null;
  end if;

  insert into public."ConetMessages" (group_id, session_id, user_id, content, is_reply)
  values (
    p_group_id,
    p_session_id,
    '00000000-0000-0000-0000-000000000999',
    clean,
    false
  )
  returning id into mid;

  return mid;
end;
$$;

revoke all on function public.conet_ensure_agent_opening(uuid, uuid, text) from public;
grant execute on function public.conet_ensure_agent_opening(uuid, uuid, text) to authenticated;
