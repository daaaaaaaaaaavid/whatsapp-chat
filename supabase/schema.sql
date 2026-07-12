-- WhatsApp-like chat schema for Supabase
-- Run this in: Supabase → SQL Editor → New query → Run

-- Profiles (contacts list reads from here)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  about text default 'זמין',
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

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
  type text not null default 'text' check (type in ('text', 'image', 'file', 'audio', 'video')),
  file_url text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now()
);

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

-- Status updates
create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content text,
  media_url text,
  background_color text not null default '#075E54',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create table if not exists public.status_views (
  status_id uuid not null references public.statuses (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

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
alter table public.statuses enable row level security;
alter table public.status_views enable row level security;

-- Profiles: everyone authenticated can read contacts; users update themselves
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

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

-- Conversations: only participants
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "conversations_insert_authenticated" on public.conversations;
create policy "conversations_insert_authenticated"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "conversations_update_participant" on public.conversations;
create policy "conversations_update_participant"
  on public.conversations for update
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = id and cp.user_id = auth.uid()
    )
  );

-- Participants
drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants me
      where me.conversation_id = conversation_id and me.user_id = auth.uid()
    )
  );

drop policy if exists "participants_insert_authenticated" on public.conversation_participants;
create policy "participants_insert_authenticated"
  on public.conversation_participants for insert
  to authenticated
  with check (true);

-- Messages
drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversation_id and cp.user_id = auth.uid()
    )
  );

-- Reads
drop policy if exists "reads_select_participant" on public.message_reads;
create policy "reads_select_participant"
  on public.message_reads for select
  to authenticated
  using (true);

drop policy if exists "reads_upsert_own" on public.message_reads;
create policy "reads_upsert_own"
  on public.message_reads for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "reads_update_own" on public.message_reads;
create policy "reads_update_own"
  on public.message_reads for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Statuses
drop policy if exists "statuses_select_authenticated" on public.statuses;
create policy "statuses_select_authenticated"
  on public.statuses for select
  to authenticated
  using (expires_at > now());

drop policy if exists "statuses_insert_own" on public.statuses;
create policy "statuses_insert_own"
  on public.statuses for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "status_views_all" on public.status_views;
create policy "status_views_all"
  on public.status_views for all
  to authenticated
  using (true)
  with check (true);

-- Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reads;
alter publication supabase_realtime add table public.conversation_participants;
alter publication supabase_realtime add table public.conversations;
