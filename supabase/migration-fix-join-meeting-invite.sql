-- Fix ambiguous conversation_id in join_meeting_by_invite + DM membership guard.
-- Prefer migration-security-fixes-2026-07.sql for the full security pack.
-- Run in: Supabase → SQL Editor → Run

create or replace function public.join_meeting_by_invite(p_token text)
returns table (meeting_id uuid, conversation_id uuid, livekit_room text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  ms public.meeting_sessions%rowtype;
  uid uuid := auth.uid();
  v_is_group boolean;
  v_is_member boolean;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into ms
  from public.meeting_sessions
  where invite_token = trim(p_token)
  for update;

  if not found then
    raise exception 'Meeting invite not found';
  end if;

  if not ms.active or ms.expires_at < now() then
    raise exception 'Meeting has ended';
  end if;

  select c.is_group into v_is_group
  from public.conversations c
  where c.id = ms.conversation_id;

  if v_is_group is null then
    raise exception 'Conversation not found';
  end if;

  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = ms.conversation_id
      and cp.user_id = uid
  ) into v_is_member;

  -- Groups may add the joiner; DMs never permanently add outsiders
  if v_is_group then
    insert into public.conversation_participants as cp (conversation_id, user_id, is_admin)
    values (ms.conversation_id, uid, false)
    on conflict (conversation_id, user_id) do nothing;
  elsif not v_is_member then
    raise exception 'Meeting invite is for conversation members only';
  end if;

  return query
  select ms.id, ms.conversation_id, ms.livekit_room;
end;
$$;

revoke all on function public.join_meeting_by_invite(text) from public;
grant execute on function public.join_meeting_by_invite(text) to authenticated;
