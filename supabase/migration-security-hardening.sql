-- Canonical security hardening for WhaChat
-- Run ONCE in: Supabase → SQL Editor → Run
-- Do NOT re-run older media migrations after this (they can reopen the bucket).

-- =============================================================================
-- 1) Profile email integrity — always mirror verified auth.users.email
-- =============================================================================
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
begin
  select email into auth_email from auth.users where id = new.id;
  if auth_email is not null then
    new.email := auth_email;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_email_from_auth on public.profiles;
create trigger profiles_email_from_auth
  before insert or update of email on public.profiles
  for each row
  execute function public.sync_profile_email_from_auth();

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and u.email is not null
  and p.email is distinct from u.email;

-- =============================================================================
-- 2) Public profile projection + private self profile RPC
-- =============================================================================
create or replace view public.public_profiles
with (security_invoker = true)
as
select
  id,
  display_name,
  avatar_url,
  about,
  last_seen
from public.profiles;

grant select on public.public_profiles to authenticated;

create or replace function public.get_my_profile_private()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  about text,
  last_seen timestamptz,
  created_at timestamptz,
  chat_prefs jsonb,
  blocked_user_ids uuid[],
  google_contacts_synced_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.email,
    p.display_name,
    p.avatar_url,
    p.about,
    p.last_seen,
    p.created_at,
    p.chat_prefs,
    p.blocked_user_ids,
    p.google_contacts_synced_at
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_profile_private() from public;
grant execute on function public.get_my_profile_private() to authenticated;

-- Safe email lookup (minimal columns)
drop function if exists public.find_user_by_email_safe(text);
create or replace function public.find_user_by_email_safe(p_email text)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  about text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.display_name, p.avatar_url, p.about
  from public.profiles p
  where p.email is not null
    and lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_by_email_safe(text) from public;
grant execute on function public.find_user_by_email_safe(text) to authenticated;

-- Keep legacy RPC but strip sensitive columns via reduced projection
drop function if exists public.find_user_by_email(text);
create function public.find_user_by_email(p_email text)
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  about text,
  last_seen timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    null::text as email,
    p.display_name,
    p.avatar_url,
    p.about,
    p.last_seen,
    p.created_at
  from public.profiles p
  where p.email is not null
    and lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.google_contacts
  set matched_profile_id = null
  where user_id = auth.uid();

  update public.google_contacts gc
  set matched_profile_id = p.id
  from public.profiles p
  where gc.user_id = auth.uid()
    and gc.email is not null
    and p.email is not null
    and lower(trim(gc.email)) = lower(trim(p.email))
    and p.id is distinct from auth.uid();

  update public.profiles
  set google_contacts_synced_at = now()
  where id = auth.uid();

  return query
    select distinct on (p.id)
      p.id,
      null::text as email,
      p.display_name,
      p.avatar_url,
      p.about,
      p.last_seen,
      p.created_at
    from public.profiles p
    inner join public.google_contacts gc on gc.matched_profile_id = p.id
    where gc.user_id = auth.uid()
    order by p.id, p.display_name nulls last;
end;
$$;

revoke all on function public.match_my_google_contacts() from public;
grant execute on function public.match_my_google_contacts() to authenticated;

-- =============================================================================
-- 3) Participants — no arbitrary self-join (invite RPC remains SECURITY DEFINER)
-- =============================================================================
drop policy if exists "participants_insert_authenticated" on public.conversation_participants;
create policy "participants_insert_creator_or_admin"
  on public.conversation_participants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.created_by = auth.uid()
    )
    or public.is_conversation_admin(conversation_id)
  );

-- =============================================================================
-- 4) Conversations — only admins/creator can mutate metadata; ownership locked
-- =============================================================================
create or replace function public.guard_conversation_immutable_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable';
  end if;
  if new.is_group is distinct from old.is_group then
    raise exception 'is_group is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;

  -- Name / avatar may only be changed by creator or admin.
  if new.name is distinct from old.name
     or new.avatar_url is distinct from old.avatar_url then
    is_admin := (
      old.created_by = auth.uid()
      or exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = old.id
          and cp.user_id = auth.uid()
          and cp.is_admin = true
      )
    );
    if not is_admin then
      raise exception 'only admins can change conversation metadata';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_immutable_cols on public.conversations;
create trigger conversations_immutable_cols
  before update on public.conversations
  for each row
  execute function public.guard_conversation_immutable_cols();

-- Members may update (e.g. updated_at); trigger blocks ownership/metadata abuse.
drop policy if exists "conversations_update_participant" on public.conversations;
drop policy if exists "conversations_update_admin" on public.conversations;
create policy "conversations_update_member"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

-- =============================================================================
-- 5) Messages — lock identity/location columns
-- =============================================================================
create or replace function public.guard_message_immutable_cols()
returns trigger
language plpgsql
as $$
begin
  if new.sender_id is distinct from old.sender_id then
    raise exception 'sender_id is immutable';
  end if;
  if new.conversation_id is distinct from old.conversation_id then
    raise exception 'conversation_id is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;
  -- system messages cannot be edited into other types by clients
  if old.type = 'system' and new.type is distinct from old.type then
    raise exception 'system messages are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_immutable_cols on public.messages;
create trigger messages_immutable_cols
  before update on public.messages
  for each row
  execute function public.guard_message_immutable_cols();

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

-- =============================================================================
-- 6) Invites — group admins only, stronger tokens, no double-count, no DMs
-- =============================================================================
drop policy if exists "invites_insert_member" on public.conversation_invites;
create policy "invites_insert_admin"
  on public.conversation_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_conversation_admin(conversation_id)
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.is_group = true
    )
  );

drop policy if exists "invites_delete_creator" on public.conversation_invites;
create policy "invites_delete_admin"
  on public.conversation_invites for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_conversation_admin(conversation_id)
  );

create or replace function public.join_conversation_by_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.conversation_invites%rowtype;
  already_member boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.conversation_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    raise exception 'Invite already used up';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = inv.conversation_id and c.is_group = true
  ) then
    raise exception 'Invite invalid for this conversation';
  end if;

  select exists (
    select 1 from public.conversation_participants
    where conversation_id = inv.conversation_id
      and user_id = auth.uid()
  ) into already_member;

  if already_member then
    return inv.conversation_id;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, is_admin)
  values (inv.conversation_id, auth.uid(), false);

  update public.conversation_invites
  set use_count = use_count + 1
  where id = inv.id;

  return inv.conversation_id;
end;
$$;

revoke all on function public.join_conversation_by_invite(text) from public;
grant execute on function public.join_conversation_by_invite(text) to authenticated;

-- =============================================================================
-- 7) Media storage — private bucket + path-aware authorization
-- =============================================================================
update storage.buckets
set
  public = false,
  file_size_limit = 52428800
where id = 'media';

create or replace function public.can_read_media_object(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  parts text[];
  owner_id text;
  second text;
begin
  if auth.uid() is null or p_name is null or length(trim(p_name)) = 0 then
    return false;
  end if;

  parts := string_to_array(p_name, '/');
  if array_length(parts, 1) is null or array_length(parts, 1) < 2 then
    return false;
  end if;

  owner_id := parts[1];
  second := parts[2];

  -- Own uploads always readable
  if owner_id = auth.uid()::text then
    return true;
  end if;

  -- Avatar: {userId}/avatar-*
  if second like 'avatar-%' then
    return public.is_known_contact(owner_id::uuid);
  end if;

  -- Status: {userId}/status/{file}
  if second = 'status' then
    return exists (
      select 1
      from public.statuses s
      where s.user_id = owner_id::uuid
        and s.expires_at > now()
        and s.media_url is not null
        and position(p_name in s.media_url) > 0
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    );
  end if;

  -- Chat media: {userId}/{conversationId}/{file}
  if array_length(parts, 1) >= 3 then
    begin
      return public.is_conversation_member(second::uuid);
    exception when others then
      return false;
    end;
  end if;

  return false;
end;
$$;

revoke all on function public.can_read_media_object(text) from public;
grant execute on function public.can_read_media_object(text) to authenticated;

drop policy if exists "media_public_read" on storage.objects;
drop policy if exists "media_auth_read" on storage.objects;
drop policy if exists "media_authorized_read" on storage.objects;
create policy "media_authorized_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and public.can_read_media_object(name)
  );

drop policy if exists "media_auth_upload" on storage.objects;
drop policy if exists "media_owner_upload" on storage.objects;
create policy "media_owner_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_auth_update" on storage.objects;
drop policy if exists "media_owner_update" on storage.objects;
create policy "media_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_auth_delete" on storage.objects;
drop policy if exists "media_owner_delete" on storage.objects;
create policy "media_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =============================================================================
-- 8) Call sessions + private Realtime authorization
-- =============================================================================
create table if not exists public.call_sessions (
  id uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  caller_id uuid not null references auth.users (id) on delete cascade,
  callee_id uuid not null references auth.users (id) on delete cascade,
  video boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create index if not exists call_sessions_expires_idx on public.call_sessions (expires_at);
create index if not exists call_sessions_participants_idx
  on public.call_sessions (caller_id, callee_id);

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
    -- Own inbox, or sender ringing into a live call session where they are caller/callee
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

-- Realtime private channel authorization (no-op if extension/schema missing)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'realtime' and table_name = 'messages'
  ) then
    execute 'alter table realtime.messages enable row level security';

    execute 'drop policy if exists "whachat_realtime_select" on realtime.messages';
    execute $pol$
      create policy "whachat_realtime_select"
        on realtime.messages for select
        to authenticated
        using (public.can_use_realtime_topic(realtime.topic()))
    $pol$;

    execute 'drop policy if exists "whachat_realtime_insert" on realtime.messages';
    execute $pol$
      create policy "whachat_realtime_insert"
        on realtime.messages for insert
        to authenticated
        with check (public.can_use_realtime_topic(realtime.topic()))
    $pol$;
  end if;
exception when others then
  raise notice 'Realtime policies skipped: %', sqlerrm;
end $$;
