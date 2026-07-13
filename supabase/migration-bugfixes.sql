-- Bugfix hardening: status delete, status_views RLS, expanded media MIME types.
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.

-- Owners can delete their own statuses
drop policy if exists "statuses_delete_own" on public.statuses;
create policy "statuses_delete_own"
  on public.statuses for delete
  to authenticated
  using (auth.uid() = user_id);

-- Tighten status_views (replaces open-all policy)
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
        and public.is_known_contact(s.user_id)
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

-- Expand media bucket MIME allow-list to match client uploads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'image/bmp', 'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-matroska',
    'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Ensure edited_at / reply_to_id exist
alter table public.messages
  add column if not exists edited_at timestamptz;

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

alter table public.profiles
  add column if not exists chat_prefs jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists google_contacts_synced_at timestamptz;
