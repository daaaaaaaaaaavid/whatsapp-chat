-- Private media bucket + authenticated read (signed URLs) + drop SVG / octet-stream
-- Run in: Supabase → SQL Editor → Run

update storage.buckets
set
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/bmp', 'image/heic', 'image/heif', 'image/avif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/3gpp', 'video/x-matroska',
    'audio/mpeg', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/aac',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
where id = 'media';

drop policy if exists "media_public_read" on storage.objects;

drop policy if exists "media_auth_read" on storage.objects;
create policy "media_auth_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'media');
