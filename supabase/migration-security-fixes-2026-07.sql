-- Security fixes: Work Space IDOR, meeting join/membership, meeting UPDATE,
-- Google Chat webhook isolation, block enforcement, active-meeting uniqueness.
-- Run in: Supabase → SQL Editor → Run
-- After: migration-work-spaces.sql, migration-meeting-sessions.sql,
--        migration-google-chat-webhook.sql, migration-invites-prefs.sql

-- ---------------------------------------------------------------------------
-- 1) Work Space members: no self-join / self-admin escalation
-- ---------------------------------------------------------------------------
drop policy if exists "work_space_members_insert" on public.work_space_members;
create policy "work_space_members_insert"
  on public.work_space_members for insert
  to authenticated
  with check (
    -- Admins may add anyone (role chosen by admin)
    public.is_work_space_admin(space_id)
    or (
      -- Space creator may add themselves as the first admin only
      user_id = auth.uid()
      and role = 'admin'
      and exists (
        select 1
        from public.work_spaces ws
        where ws.id = space_id
          and ws.created_by = auth.uid()
      )
      and not exists (
        select 1
        from public.work_space_members m
        where m.space_id = space_id
      )
    )
  );

-- Prevent role elevation via UPDATE if a policy is added later
create or replace function public.guard_work_space_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and not public.is_work_space_admin(old.space_id) then
    raise exception 'Only space admins can change member roles';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_work_space_member_role on public.work_space_members;
create trigger trg_guard_work_space_member_role
  before update on public.work_space_members
  for each row
  execute function public.guard_work_space_member_role();

-- Invites: admins only
drop policy if exists "work_space_invites_insert" on public.work_space_invites;
create policy "work_space_invites_insert"
  on public.work_space_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_work_space_admin(space_id)
  );

-- Join invite: only bump use_count when a new membership is created
create or replace function public.join_work_space_by_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.work_space_invites%rowtype;
  uid uuid := auth.uid();
  chan record;
  new_member_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.work_space_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    raise exception 'Invite exhausted';
  end if;

  insert into public.work_space_members (space_id, user_id, role)
  values (inv.space_id, uid, 'member')
  on conflict (space_id, user_id) do nothing
  returning id into new_member_id;

  for chan in
    select id from public.conversations
    where work_space_id = inv.space_id and is_group = true
  loop
    insert into public.conversation_participants (conversation_id, user_id, is_admin)
    values (chan.id, uid, false)
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  if new_member_id is not null then
    update public.work_space_invites
    set use_count = use_count + 1
    where id = inv.id;
  end if;

  return inv.space_id;
end;
$$;

revoke all on function public.join_work_space_by_invite(text) from public;
grant execute on function public.join_work_space_by_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Meeting join: never permanently add outsiders to DMs; groups may add
-- ---------------------------------------------------------------------------
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

-- Host or conversation admin may update; lock immutable columns
drop policy if exists "meeting_sessions_update_member" on public.meeting_sessions;
drop policy if exists "meeting_sessions_update_host" on public.meeting_sessions;
create policy "meeting_sessions_update_host"
  on public.meeting_sessions for update
  to authenticated
  using (
    auth.uid() = host_id
    or public.is_conversation_admin(conversation_id)
  )
  with check (
    auth.uid() = host_id
    or public.is_conversation_admin(conversation_id)
  );

create or replace function public.guard_meeting_sessions_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.host_id is distinct from old.host_id
     or new.livekit_room is distinct from old.livekit_room
     or new.invite_token is distinct from old.invite_token then
    raise exception 'Immutable meeting fields cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_meeting_sessions_immutable on public.meeting_sessions;
create trigger trg_guard_meeting_sessions_immutable
  before update on public.meeting_sessions
  for each row
  execute function public.guard_meeting_sessions_immutable();

-- One active meeting per conversation (deactivate extras first)
update public.meeting_sessions ms
set active = false,
    ended_at = coalesce(ms.ended_at, now())
where ms.active = true
  and ms.id <> (
    select m2.id
    from public.meeting_sessions m2
    where m2.conversation_id = ms.conversation_id
      and m2.active = true
    order by m2.created_at desc
    limit 1
  );

create unique index if not exists meeting_sessions_one_active_per_conversation
  on public.meeting_sessions (conversation_id)
  where active = true;

-- ---------------------------------------------------------------------------
-- 3) Google Chat webhook: admin-only table (remove from readable work_spaces)
-- ---------------------------------------------------------------------------
create table if not exists public.work_space_webhooks (
  space_id uuid primary key references public.work_spaces (id) on delete cascade,
  webhook_url text not null,
  updated_at timestamptz not null default now(),
  constraint work_space_webhooks_url_check check (
    length(webhook_url) <= 2000
    and webhook_url like 'https://chat.googleapis.com/%'
  )
);

alter table public.work_space_webhooks enable row level security;

drop policy if exists "work_space_webhooks_select_admin" on public.work_space_webhooks;
create policy "work_space_webhooks_select_admin"
  on public.work_space_webhooks for select
  to authenticated
  using (public.is_work_space_admin(space_id));

drop policy if exists "work_space_webhooks_insert_admin" on public.work_space_webhooks;
create policy "work_space_webhooks_insert_admin"
  on public.work_space_webhooks for insert
  to authenticated
  with check (public.is_work_space_admin(space_id));

drop policy if exists "work_space_webhooks_update_admin" on public.work_space_webhooks;
create policy "work_space_webhooks_update_admin"
  on public.work_space_webhooks for update
  to authenticated
  using (public.is_work_space_admin(space_id))
  with check (public.is_work_space_admin(space_id));

drop policy if exists "work_space_webhooks_delete_admin" on public.work_space_webhooks;
create policy "work_space_webhooks_delete_admin"
  on public.work_space_webhooks for delete
  to authenticated
  using (public.is_work_space_admin(space_id));

insert into public.work_space_webhooks (space_id, webhook_url)
select id, google_chat_webhook_url
from public.work_spaces
where google_chat_webhook_url is not null
  and length(trim(google_chat_webhook_url)) > 0
on conflict (space_id) do update
  set webhook_url = excluded.webhook_url,
      updated_at = now();

-- Clear legacy column so SELECT * no longer leaks the secret
update public.work_spaces
set google_chat_webhook_url = null
where google_chat_webhook_url is not null;

comment on table public.work_space_webhooks is
  'Google Chat incoming webhook URLs. Admin-only RLS; never expose to members.';

-- ---------------------------------------------------------------------------
-- 4) Block enforcement on DM message insert + hardened message update
-- ---------------------------------------------------------------------------
create or replace function public.dm_messaging_blocked(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and coalesce(c.is_group, false) = false
      and exists (
        select 1
        from public.conversation_participants other
        where other.conversation_id = p_conversation_id
          and other.user_id <> auth.uid()
          and (
            exists (
              select 1 from public.profiles peer
              where peer.id = other.user_id
                and auth.uid() = any (coalesce(peer.blocked_user_ids, '{}'::uuid[]))
            )
            or exists (
              select 1 from public.profiles me
              where me.id = auth.uid()
                and other.user_id = any (coalesce(me.blocked_user_ids, '{}'::uuid[]))
            )
          )
      )
  );
$$;

revoke all on function public.dm_messaging_blocked(uuid) from public;
grant execute on function public.dm_messaging_blocked(uuid) to authenticated;

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.dm_messaging_blocked(conversation_id)
  );

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own"
  on public.messages for update
  to authenticated
  using (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  )
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  );
