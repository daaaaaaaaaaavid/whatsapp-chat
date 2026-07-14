-- Index to speed up scheduled chat media cleanup (image/video older than retention window)
-- Run in Supabase → SQL Editor

create index if not exists messages_media_retention_idx
  on public.messages (created_at)
  where type in ('image', 'video')
    and file_url is not null
    and deleted_at is null;

create index if not exists statuses_expired_media_idx
  on public.statuses (expires_at)
  where media_url is not null;
