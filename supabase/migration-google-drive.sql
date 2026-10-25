-- Per-user Google Drive media. Tokens stay service-role only.
-- Also add drive.file on the Google Cloud OAuth consent screen,
-- and set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET on the host.
-- Run in Supabase → SQL Editor → Run

alter table public.profiles
  add column if not exists google_drive_connected_at timestamptz;

create table if not exists public.google_drive_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  google_email text,
  folder_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_drive_accounts enable row level security;

create table if not exists public.drive_media_copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_owner_id uuid not null,
  source_file_id text not null,
  dest_file_id text not null,
  kind text not null check (kind in ('message', 'status')),
  source_row_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, source_owner_id, source_file_id)
);

create index if not exists drive_media_copies_user_idx
  on public.drive_media_copies (user_id);

create index if not exists drive_media_copies_source_idx
  on public.drive_media_copies (source_owner_id, source_file_id);

alter table public.drive_media_copies enable row level security;

drop policy if exists "drive_copies_select_own" on public.drive_media_copies;
create policy "drive_copies_select_own"
  on public.drive_media_copies for select
  to authenticated
  using (user_id = auth.uid());
