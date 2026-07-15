-- Fix private Realtime for calls/typing (run once in Supabase SQL Editor).
-- Does not swallow errors — if this fails, the message is the real blocker.

create or replace function public.can_use_realtime_topic(p_topic text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  topic text := coalesce(p_topic, '');
  uid text;
  conv text;
  call_id text;
begin
  if auth.uid() is null then
    return false;
  end if;

  if topic like 'user-calls:%' then
    uid := split_part(topic, ':', 2);
    if uid = auth.uid()::text then
      return true;
    end if;
    return exists (
      select 1 from public.call_sessions cs
      where cs.expires_at > now()
        and (
          (cs.caller_id = auth.uid() and cs.callee_id::text = uid)
          or (cs.callee_id = auth.uid() and cs.caller_id::text = uid)
        )
    );
  end if;

  if topic like 'typing:%' then
    conv := split_part(topic, ':', 2);
    begin
      return public.is_conversation_member(conv::uuid);
    exception when others then
      return false;
    end;
  end if;

  if topic like 'call-room:%' then
    call_id := split_part(topic, ':', 2);
    begin
      return exists (
        select 1 from public.call_sessions cs
        where cs.id = call_id::uuid
          and cs.expires_at > now()
          and auth.uid() in (cs.caller_id, cs.callee_id)
      );
    exception when others then
      return false;
    end;
  end if;

  return false;
end;
$$;

revoke all on function public.can_use_realtime_topic(text) from public;
grant execute on function public.can_use_realtime_topic(text) to authenticated;
grant execute on function public.can_use_realtime_topic(text) to service_role;

-- Ensure call_sessions exists (no-op if already created)
create table if not exists public.call_sessions (
  id uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references auth.users (id) on delete cascade,
  callee_id uuid not null references auth.users (id) on delete cascade,
  video boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

alter table public.call_sessions enable row level security;

drop policy if exists "call_sessions_select_participant" on public.call_sessions;
create policy "call_sessions_select_participant"
  on public.call_sessions for select
  to authenticated
  using (
    auth.uid() in (caller_id, callee_id)
    and expires_at > now()
  );

drop policy if exists "call_sessions_insert_caller" on public.call_sessions;
create policy "call_sessions_insert_caller"
  on public.call_sessions for insert
  to authenticated
  with check (
    auth.uid() = caller_id
    and public.is_conversation_member(conversation_id)
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id
        and cp.user_id = callee_id
    )
  );

drop policy if exists "call_sessions_delete_participant" on public.call_sessions;
create policy "call_sessions_delete_participant"
  on public.call_sessions for delete
  to authenticated
  using (auth.uid() in (caller_id, callee_id));

-- Realtime authorization — must succeed (no silent skip)
alter table realtime.messages enable row level security;

drop policy if exists "whachat_realtime_select" on realtime.messages;
create policy "whachat_realtime_select"
  on realtime.messages for select
  to authenticated
  using (
    coalesce(realtime.messages.extension, 'broadcast') in ('broadcast', 'presence')
    and public.can_use_realtime_topic(realtime.topic())
  );

drop policy if exists "whachat_realtime_insert" on realtime.messages;
create policy "whachat_realtime_insert"
  on realtime.messages for insert
  to authenticated
  with check (
    coalesce(realtime.messages.extension, 'broadcast') in ('broadcast', 'presence')
    and public.can_use_realtime_topic(realtime.topic())
  );

select 'realtime calls fix ok' as status;
