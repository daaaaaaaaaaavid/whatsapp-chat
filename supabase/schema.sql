-- WhaChat chat schema for Supabase
-- Run this in: Supabase → SQL Editor → New query → Run

-- Profiles (contacts list reads from here)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  about text default 'זמין',
  last_seen timestamptz,
  chat_prefs jsonb not null default '{}'::jsonb,
  google_contacts_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists chat_prefs jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists google_contacts_synced_at timestamptz;

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  avatar_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Participants
create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text,
  type text not null default 'text' check (type in ('text', 'image', 'file', 'audio', 'video', 'system', 'poll')),
  file_url text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  edited_at timestamptz,
  reply_to_id uuid references public.messages (id) on delete set null,
  is_forwarded boolean not null default false
);

-- Soft-delete / edit / reply / forward support for existing DBs
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists reply_to_id uuid references public.messages (id) on delete set null;
alter table public.messages add column if not exists is_forwarded boolean not null default false;

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

-- Message reads
create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (message_id, user_id)
);

-- Poll votes
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, option_id)
);

create index if not exists poll_votes_message_idx on public.poll_votes (message_id);

-- Status updates
create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text,
  media_url text,
  background_color text not null default '#075E54',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  audience_mode text not null default 'contacts'
    check (audience_mode in ('contacts', 'contacts_except', 'selected_contacts')),
  audience_user_ids uuid[] not null default '{}'::uuid[],
  constraint statuses_max_12h_check check (expires_at <= created_at + interval '12 hours')
);

alter table public.statuses
  add column if not exists audience_mode text not null default 'contacts',
  add column if not exists audience_user_ids uuid[] not null default '{}'::uuid[];

alter table public.statuses
  alter column expires_at set default (now() + interval '12 hours');

update public.statuses
set expires_at = least(expires_at, created_at + interval '12 hours')
where expires_at > created_at + interval '12 hours';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'statuses_audience_mode_check'
      and conrelid = 'public.statuses'::regclass
  ) then
    alter table public.statuses
      add constraint statuses_audience_mode_check
      check (audience_mode in ('contacts', 'contacts_except', 'selected_contacts'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'statuses_max_12h_check'
      and conrelid = 'public.statuses'::regclass
  ) then
    alter table public.statuses
      add constraint statuses_max_12h_check
      check (expires_at <= created_at + interval '12 hours');
  end if;
end $$;

create table if not exists public.status_views (
  status_id uuid not null references public.statuses (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

create table if not exists public.status_replies (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.statuses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists status_replies_status_id_idx
  on public.status_replies (status_id, created_at);

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, about)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'זמין'
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist
insert into public.profiles (id, email, display_name, about)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  'זמין'
from auth.users u
on conflict (id) do nothing;

-- RLS
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.poll_votes enable row level security;
alter table public.statuses enable row level security;
alter table public.status_views enable row level security;
alter table public.status_replies enable row level security;

-- Helper: shared conversation OR Google contact matched to this profile
create or replace function public.is_known_contact(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = auth.uid()
    or exists (
      select 1
      from public.conversation_participants mine
      join public.conversation_participants theirs
        on mine.conversation_id = theirs.conversation_id
      where mine.user_id = auth.uid()
        and theirs.user_id = p_user_id
    )
    or exists (
      select 1
      from public.google_contacts gc
      where gc.user_id = auth.uid()
        and gc.matched_profile_id = p_user_id
    );
$$;

revoke all on function public.is_known_contact(uuid) from public;
grant execute on function public.is_known_contact(uuid) to authenticated;

-- Status audience check shared by status, view, and reply policies
create or replace function public.can_view_status(
  p_owner_id uuid,
  p_audience_mode text,
  p_audience_user_ids uuid[]
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = p_owner_id
    or (
      public.is_known_contact(p_owner_id)
      and case p_audience_mode
        when 'contacts_except' then not (auth.uid() = any(coalesce(p_audience_user_ids, '{}'::uuid[])))
        when 'selected_contacts' then auth.uid() = any(coalesce(p_audience_user_ids, '{}'::uuid[]))
        else true
      end
    );
$$;

revoke all on function public.can_view_status(uuid, text, uuid[]) from public;
grant execute on function public.can_view_status(uuid, text, uuid[]) to authenticated;

-- Exact email lookup for starting a chat with someone who is not yet a contact
create or replace function public.find_user_by_email(p_email text)
returns setof public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select p.*
  from public.profiles p
  where p.email is not null
    and lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

-- Profiles: own row + people you have interacted with (shared conversation)
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (public.is_known_contact(id));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Helper: membership check without RLS recursion (must exist before policies)
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

create or replace function public.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = p_conversation_id
      and user_id = auth.uid()
      and is_admin = true
  );
$$;

revoke all on function public.is_conversation_admin(uuid) from public;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

-- Conversations: only participants / creator
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_conversation_member(id)
  );

drop policy if exists "conversations_delete_creator" on public.conversations;
create policy "conversations_delete_creator"
  on public.conversations for delete
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "conversations_insert_authenticated" on public.conversations;
create policy "conversations_insert_authenticated"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "conversations_update_participant" on public.conversations;
drop policy if exists "conversations_update_admin" on public.conversations;
drop policy if exists "conversations_update_member" on public.conversations;
create policy "conversations_update_member"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

-- Participants
drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "participants_insert_authenticated" on public.conversation_participants;
drop policy if exists "participants_insert_creator_or_admin" on public.conversation_participants;
create policy "participants_insert_creator_or_admin"
  on public.conversation_participants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
    or public.is_conversation_admin(conversation_id)
  );

-- Messages
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
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

-- Reads: only within conversations you belong to
drop policy if exists "reads_select_participant" on public.message_reads;
create policy "reads_select_participant"
  on public.message_reads for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "reads_upsert_own" on public.message_reads;
create policy "reads_upsert_own"
  on public.message_reads for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "reads_update_own" on public.message_reads;
create policy "reads_update_own"
  on public.message_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Poll votes
drop policy if exists "poll_votes_select_participant" on public.poll_votes;
create policy "poll_votes_select_participant"
  on public.poll_votes for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "poll_votes_insert_own" on public.poll_votes;
create policy "poll_votes_insert_own"
  on public.poll_votes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and m.type in ('poll', 'text')
        and m.deleted_at is null
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "poll_votes_delete_own" on public.poll_votes;
create policy "poll_votes_delete_own"
  on public.poll_votes for delete
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

-- Statuses: own + contacts only
drop policy if exists "statuses_select_authenticated" on public.statuses;
create policy "statuses_select_authenticated"
  on public.statuses for select
  to authenticated
  using (
    expires_at > now()
    and public.can_view_status(user_id, audience_mode, audience_user_ids)
  );

drop policy if exists "statuses_insert_own" on public.statuses;
create policy "statuses_insert_own"
  on public.statuses for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and expires_at <= created_at + interval '12 hours'
  );

drop policy if exists "statuses_delete_own" on public.statuses;
create policy "statuses_delete_own"
  on public.statuses for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "status_views_all" on public.status_views;
drop policy if exists "status_views_select" on public.status_views;
drop policy if exists "status_views_insert" on public.status_views;
drop policy if exists "status_views_delete" on public.status_views;

create policy "status_views_select"
  on public.status_views for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.user_id = auth.uid()
    )
  );

create policy "status_views_insert"
  on public.status_views for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    )
  );

create policy "status_views_delete"
  on public.status_views for delete
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.user_id = auth.uid()
    )
  );

drop policy if exists "status_replies_select" on public.status_replies;
create policy "status_replies_select"
  on public.status_replies for select
  to authenticated
  using (
    exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    )
  );

drop policy if exists "status_replies_insert" on public.status_replies;
create policy "status_replies_insert"
  on public.status_replies for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.statuses s
      where s.id = status_id
        and s.expires_at > now()
        and s.user_id <> auth.uid()
        and public.can_view_status(s.user_id, s.audience_mode, s.audience_user_ids)
    )
  );

drop policy if exists "status_replies_delete_own" on public.status_replies;
create policy "status_replies_delete_own"
  on public.status_replies for delete
  to authenticated
  using (auth.uid() = user_id);

-- Realtime (ignore if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.message_reads;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversation_participants;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.status_replies;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.poll_votes;
  exception when duplicate_object then null;
  end;
end $$;

-- Path-aware media read authorization (chat / status / avatar)
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

  if owner_id = auth.uid()::text then
    return true;
  end if;

  if second like 'avatar-%' then
    return public.is_known_contact(owner_id::uuid);
  end if;

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

-- Storage bucket for chat media (images, files, voice) — private; use signed URLs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/bmp', 'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-matroska',
    'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Full path-aware media policies live in migration-security-hardening.sql
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
create policy "media_auth_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_auth_update" on storage.objects;
create policy "media_auth_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_auth_delete" on storage.objects;
create policy "media_auth_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
-- Google Contacts sync: private imported contacts + email match to WhaChat profiles.
-- Run in: Supabase ג†’ SQL Editor ג†’ Run
-- Also enable People API + contacts.readonly on the Google Cloud OAuth consent screen.

alter table public.profiles
  add column if not exists google_contacts_synced_at timestamptz;

create table if not exists public.google_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  google_resource_name text not null,
  display_name text,
  email text,
  photo_url text,
  matched_profile_id uuid references public.profiles (id) on delete set null,
  synced_at timestamptz not null default now(),
  unique (user_id, google_resource_name)
);

create index if not exists google_contacts_user_idx
  on public.google_contacts (user_id);

create index if not exists google_contacts_email_idx
  on public.google_contacts (user_id, lower(trim(email)))
  where email is not null;

create index if not exists google_contacts_matched_idx
  on public.google_contacts (matched_profile_id)
  where matched_profile_id is not null;

alter table public.google_contacts enable row level security;

drop policy if exists "google_contacts_select_own" on public.google_contacts;
create policy "google_contacts_select_own"
  on public.google_contacts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "google_contacts_insert_own" on public.google_contacts;
create policy "google_contacts_insert_own"
  on public.google_contacts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "google_contacts_update_own" on public.google_contacts;
create policy "google_contacts_update_own"
  on public.google_contacts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "google_contacts_delete_own" on public.google_contacts;
create policy "google_contacts_delete_own"
  on public.google_contacts for delete
  to authenticated
  using (user_id = auth.uid());

-- Match imported emails to registered profiles (exact, case-insensitive).
-- Does not expose the full user directory ג€” only emails the caller already imported.
create or replace function public.match_my_google_contacts()
returns setof public.profiles
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
    select distinct on (p.id) p.*
    from public.profiles p
    inner join public.google_contacts gc on gc.matched_profile_id = p.id
    where gc.user_id = auth.uid()
    order by p.id, p.display_name nulls last;
end;
$$;

revoke all on function public.match_my_google_contacts() from public;
grant execute on function public.match_my_google_contacts() to authenticated;
-- Push subscriptions for Web Push notifications when users are offline.
-- Run in: Supabase ג†’ SQL Editor

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- End of synced migrations (google_contacts + push_subscriptions)


-- Conversation inbox summaries (last message + unread)
create or replace function public.my_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_message_content text,
  last_message_type text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  last_message_file_name text,
  last_message_deleted_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with my_convs as (
    select cp.conversation_id
    from public.conversation_participants cp
    where cp.user_id = auth.uid()
  ),
  last_msgs as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.id as last_message_id,
      m.content as last_message_content,
      m.type as last_message_type,
      m.sender_id as last_message_sender_id,
      m.created_at as last_message_created_at,
      m.file_name as last_message_file_name,
      m.deleted_at as last_message_deleted_at
    from public.messages m
    inner join my_convs mc on mc.conversation_id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select
      m.conversation_id,
      count(*)::bigint as unread_count
    from public.messages m
    inner join my_convs mc on mc.conversation_id = m.conversation_id
    where m.sender_id <> auth.uid()
      and m.deleted_at is null
      and not exists (
        select 1
        from public.message_reads r
        where r.message_id = m.id
          and r.user_id = auth.uid()
      )
    group by m.conversation_id
  )
  select
    mc.conversation_id,
    lm.last_message_id,
    lm.last_message_content,
    lm.last_message_type,
    lm.last_message_sender_id,
    lm.last_message_created_at,
    lm.last_message_file_name,
    lm.last_message_deleted_at,
    coalesce(u.unread_count, 0) as unread_count
  from my_convs mc
  left join last_msgs lm on lm.conversation_id = mc.conversation_id
  left join unread u on u.conversation_id = mc.conversation_id;
$$;

revoke all on function public.my_conversation_summaries() from public;
grant execute on function public.my_conversation_summaries() to authenticated;
