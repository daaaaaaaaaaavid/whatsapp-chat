-- Fix ambiguous conversation_id in join_meeting_by_invite
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

  insert into public.conversation_participants as cp (conversation_id, user_id, is_admin)
  values (ms.conversation_id, uid, false)
  on conflict (conversation_id, user_id) do nothing;

  return query
  select ms.id, ms.conversation_id, ms.livekit_room;
end;
$$;

revoke all on function public.join_meeting_by_invite(text) from public;
grant execute on function public.join_meeting_by_invite(text) to authenticated;
