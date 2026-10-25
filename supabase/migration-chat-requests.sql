-- Chat requests: a new 1:1 stays pending until the other person accepts.
-- Run in: Supabase → SQL Editor → Run
-- Existing chats and groups stay accepted.

alter table public.conversations
  add column if not exists request_status text not null default 'accepted';

alter table public.conversations
  drop constraint if exists conversations_request_status_check;

alter table public.conversations
  add constraint conversations_request_status_check
  check (request_status in ('pending', 'accepted', 'declined'));

update public.conversations
set request_status = 'accepted'
where is_group = true
   or request_status is null;

-- Clients cannot flip request_status themselves. Internal functions set a transaction flag.
create or replace function public.guard_conversation_request_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_group then
      new.request_status := 'accepted';
    elsif coalesce(current_setting('app.allow_request_status', true), '') is distinct from '1' then
      new.request_status := 'pending';
    elsif new.request_status is null
      or new.request_status not in ('pending', 'accepted', 'declined') then
      new.request_status := 'accepted';
    end if;
    return new;
  end if;

  if new.request_status is distinct from old.request_status
     and coalesce(current_setting('app.allow_request_status', true), '') is distinct from '1' then
    new.request_status := old.request_status;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_request_status_guard on public.conversations;
create trigger conversations_request_status_guard
  before insert or update on public.conversations
  for each row
  execute function public.guard_conversation_request_status();

-- Notes-to-self is a normal chat (single participant).
create or replace function public.accept_self_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.is_group = false
      and c.created_by = auth.uid()
  ) then
    raise exception 'Not found';
  end if;

  if (
    select count(*)::int
    from public.conversation_participants
    where conversation_id = p_conversation_id
  ) <> 1 then
    raise exception 'Not a self chat';
  end if;

  if not exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  ) then
    raise exception 'Not a self chat';
  end if;

  perform set_config('app.allow_request_status', '1', true);
  update public.conversations
  set request_status = 'accepted',
      updated_at = now()
  where id = p_conversation_id;
end;
$$;

revoke all on function public.accept_self_conversation(uuid) from public;
grant execute on function public.accept_self_conversation(uuid) to authenticated;

-- The person who was asked accepts or declines. The sender cannot approve themselves.
create or replace function public.respond_to_chat_request(
  p_conversation_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into conv
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found then
    raise exception 'Not found';
  end if;

  if conv.is_group or conv.request_status = 'accepted' then
    return 'accepted';
  end if;

  if not public.is_conversation_member(conv.id) then
    raise exception 'Not a participant';
  end if;

  if conv.created_by = auth.uid() then
    raise exception 'Only the recipient can respond';
  end if;

  -- Declined can still be accepted later, if they decide to talk after all.
  if conv.request_status = 'declined' and not coalesce(p_accept, false) then
    return 'declined';
  end if;

  if conv.request_status not in ('pending', 'declined') then
    raise exception 'Request is not pending';
  end if;

  perform set_config('app.allow_request_status', '1', true);
  update public.conversations
  set request_status = case when p_accept then 'accepted' else 'declined' end,
      updated_at = now()
  where id = conv.id;

  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

revoke all on function public.respond_to_chat_request(uuid, boolean) from public;
grant execute on function public.respond_to_chat_request(uuid, boolean) to authenticated;

-- After a decline, the sender can ask again. Same chat, no duplicate thread.
create or replace function public.resend_chat_request(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into conv
  from public.conversations
  where id = p_conversation_id
  for update;

  if not found or conv.is_group then
    raise exception 'Not found';
  end if;

  if conv.created_by is distinct from auth.uid() then
    raise exception 'Only the requester can resend';
  end if;

  if conv.request_status <> 'declined' then
    raise exception 'Request is not declined';
  end if;

  if not public.is_conversation_member(conv.id) then
    raise exception 'Not a participant';
  end if;

  perform set_config('app.allow_request_status', '1', true);
  update public.conversations
  set request_status = 'pending',
      updated_at = now()
  where id = conv.id;
end;
$$;

revoke all on function public.resend_chat_request(uuid) from public;
grant execute on function public.resend_chat_request(uuid) to authenticated;

-- Pending: only the sender can write. Declined: nobody. Accepted and groups: normal.
create or replace function public.chat_request_allows_send(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.is_group
        or c.request_status = 'accepted'
        or (c.request_status = 'pending' and c.created_by = auth.uid())
      )
  );
$$;

revoke all on function public.chat_request_allows_send(uuid) from public;
grant execute on function public.chat_request_allows_send(uuid) to authenticated;

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.dm_messaging_blocked(conversation_id)
    and public.chat_request_allows_send(conversation_id)
  );

-- Opening an email invite is itself the approval, so that chat is accepted.
create or replace function public.accept_dm_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.dm_invites%rowtype;
  uid uuid := auth.uid();
  user_email text;
  existing_id uuid;
  new_id uuid;
  part record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.dm_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if inv.accepted_at is not null then
    if inv.accepted_by = uid and inv.conversation_id is not null then
      return inv.conversation_id;
    end if;
    raise exception 'Invite already used';
  end if;

  if inv.inviter_id = uid then
    raise exception 'Cannot accept your own invite';
  end if;

  select lower(trim(email)) into user_email
  from auth.users
  where id = uid;

  if user_email is null or user_email <> lower(trim(inv.invitee_email)) then
    raise exception 'Invite email mismatch';
  end if;

  for part in
    select cp.conversation_id
    from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.user_id = inv.inviter_id
      and c.is_group = false
  loop
    if exists (
      select 1 from public.conversation_participants
      where conversation_id = part.conversation_id and user_id = uid
    ) and (
      select count(*)::int from public.conversation_participants
      where conversation_id = part.conversation_id
    ) = 2 then
      existing_id := part.conversation_id;
      exit;
    end if;
  end loop;

  perform set_config('app.allow_request_status', '1', true);

  if existing_id is not null then
    update public.conversations
    set request_status = 'accepted',
        updated_at = now()
    where id = existing_id;

    update public.dm_invites
    set accepted_at = now(),
        accepted_by = uid,
        conversation_id = existing_id
    where id = inv.id;
    return existing_id;
  end if;

  new_id := gen_random_uuid();
  insert into public.conversations (id, is_group, created_by, request_status)
  values (new_id, false, inv.inviter_id, 'accepted');

  insert into public.conversation_participants (conversation_id, user_id, is_admin)
  values
    (new_id, inv.inviter_id, false),
    (new_id, uid, false);

  update public.dm_invites
  set accepted_at = now(),
      accepted_by = uid,
      conversation_id = new_id
  where id = inv.id;

  return new_id;
end;
$$;

revoke all on function public.accept_dm_invite(text) from public;
grant execute on function public.accept_dm_invite(text) to authenticated;
