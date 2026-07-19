-- Group meetings (LiveKit Zoom-like) with invite links.
-- Run in: Supabase → SQL Editor → Run

create table if not exists public.meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade,
  livekit_room text not null unique,
  invite_token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  constraint meeting_sessions_token_prefix check (invite_token like 'meet_%')
);

create index if not exists meeting_sessions_conversation_active_idx
  on public.meeting_sessions (conversation_id)
  where active = true;

create index if not exists meeting_sessions_invite_token_idx
  on public.meeting_sessions (invite_token);

create index if not exists meeting_sessions_host_idx
  on public.meeting_sessions (host_id);

alter table public.meeting_sessions enable row level security;

drop policy if exists "meeting_sessions_select_member" on public.meeting_sessions;
create policy "meeting_sessions_select_member"
  on public.meeting_sessions for select
  to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and expires_at > now()
  );

drop policy if exists "meeting_sessions_insert_host" on public.meeting_sessions;
create policy "meeting_sessions_insert_host"
  on public.meeting_sessions for insert
  to authenticated
  with check (
    auth.uid() = host_id
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "meeting_sessions_update_member" on public.meeting_sessions;
create policy "meeting_sessions_update_member"
  on public.meeting_sessions for update
  to authenticated
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

-- Join via invite link: add to conversation if needed, return meeting + conversation ids.
create or replace function public.join_meeting_by_invite(p_token text)
returns table (meeting_id uuid, conversation_id uuid, livekit_room text)
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.conversation_participants (conversation_id, user_id, is_admin)
  values (ms.conversation_id, uid, false)
  on conflict (conversation_id, user_id) do nothing;

  meeting_id := ms.id;
  conversation_id := ms.conversation_id;
  livekit_room := ms.livekit_room;
  return next;
end;
$$;

revoke all on function public.join_meeting_by_invite(text) from public;
grant execute on function public.join_meeting_by_invite(text) to authenticated;
