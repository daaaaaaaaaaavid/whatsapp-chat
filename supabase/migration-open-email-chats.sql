-- Open a direct chat with any email, including people who are not on WhaChat yet.
-- Also replaces match_my_google_contacts so Google contact sync does not hit
-- "column reference id is ambiguous".
-- Run in: Supabase → SQL Editor → Run

alter table public.conversations
  add column if not exists pending_email text;

create index if not exists conversations_pending_email_idx
  on public.conversations (created_by, lower(trim(pending_email)))
  where pending_email is not null;

do $$
begin
  if to_regclass('public.dm_invites') is not null then
    execute 'drop policy if exists "dm_invites_update_own" on public.dm_invites';
    execute $policy$
      create policy "dm_invites_update_own"
        on public.dm_invites for update
        to authenticated
        using (inviter_id = auth.uid())
        with check (inviter_id = auth.uid())
    $policy$;
  end if;
end $$;

-- When the invited person signs in, attach them to the waiting chat.
-- The chat stays pending until they reply or close it.
create or replace function public.claim_pending_email_chats()
returns integer
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid;
  user_email text;
  added integer := 0;
  inv record;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(trim(u.email)) into user_email
  from auth.users as u
  where u.id = uid;

  if user_email is null or length(user_email) < 3 then
    return 0;
  end if;

  for inv in
    select i.conversation_id, i.inviter_id
    from public.dm_invites as i
    where i.accepted_at is null
      and i.conversation_id is not null
      and i.inviter_id is distinct from uid
      and lower(trim(i.invitee_email)) = user_email
  loop
    if not exists (
      select 1
      from public.conversations as c
      where c.id = inv.conversation_id
        and c.is_group = false
        and c.created_by = inv.inviter_id
        and (
          lower(trim(coalesce(c.pending_email, ''))) = user_email
          or lower(trim(coalesce(c.name, ''))) = user_email
        )
    ) then
      continue;
    end if;

    insert into public.conversation_participants (conversation_id, user_id, is_admin)
    values (inv.conversation_id, uid, false)
    on conflict (conversation_id, user_id) do nothing;

    if found then
      added := added + 1;
    end if;
  end loop;

  return added;
end;
$$;

revoke all on function public.claim_pending_email_chats() from public;
grant execute on function public.claim_pending_email_chats() to authenticated;

-- A reply from the recipient accepts the chat. Closing still uses respond_to_chat_request.
create or replace function public.chat_request_allows_send(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversations as c
    where c.id = p_conversation_id
      and (
        c.is_group
        or c.request_status = 'accepted'
        or c.request_status = 'pending'
      )
  );
$$;

revoke all on function public.chat_request_allows_send(uuid) from public;
grant execute on function public.chat_request_allows_send(uuid) to authenticated;

create or replace function public.accept_chat_on_recipient_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  select * into conv
  from public.conversations
  where id = new.conversation_id;

  if not found or conv.is_group or conv.request_status is distinct from 'pending' then
    return new;
  end if;

  if conv.created_by is not distinct from new.sender_id then
    return new;
  end if;

  perform set_config('app.allow_request_status', '1', true);
  update public.conversations
  set request_status = 'accepted',
      updated_at = now()
  where id = conv.id;

  return new;
end;
$$;

drop trigger if exists messages_accept_chat_on_reply on public.messages;
create trigger messages_accept_chat_on_reply
  after insert on public.messages
  for each row
  execute function public.accept_chat_on_recipient_reply();

drop function if exists public.match_my_google_contacts();

create function public.match_my_google_contacts()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  about text,
  last_seen timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.google_contacts as gc
  set matched_profile_id = null
  where gc.user_id = uid;

  update public.google_contacts as gc
  set matched_profile_id = prof.id
  from public.profiles as prof
  where gc.user_id = uid
    and gc.email is not null
    and prof.email is not null
    and lower(trim(gc.email)) = lower(trim(prof.email))
    and prof.id is distinct from uid;

  update public.profiles as prof
  set google_contacts_synced_at = now()
  where prof.id = uid;

  return query
    select distinct on (prof.id)
      prof.id,
      null::text,
      prof.display_name,
      prof.avatar_url,
      prof.about,
      prof.last_seen,
      prof.created_at
    from public.profiles as prof
    inner join public.google_contacts as gc
      on gc.matched_profile_id = prof.id
     and gc.user_id = uid
    order by prof.id, prof.display_name nulls last;
end;
$$;

revoke all on function public.match_my_google_contacts() from public;
grant execute on function public.match_my_google_contacts() to authenticated;
