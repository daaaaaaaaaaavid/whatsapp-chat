-- Google Chat incoming webhook (one-way: WhaChat → Google Chat)
-- Run after migration-work-spaces.sql
-- WhaChat never reads Google Chat; only POSTs to a user-provided webhook URL.

alter table public.work_spaces
  add column if not exists google_chat_webhook_url text,
  add column if not exists google_chat_forward_enabled boolean not null default false;

-- Optional: reject obviously wrong URLs at DB level (admins still validated in app)
alter table public.work_spaces
  drop constraint if exists work_spaces_google_chat_webhook_url_check;

alter table public.work_spaces
  add constraint work_spaces_google_chat_webhook_url_check
  check (
    google_chat_webhook_url is null
    or (
      length(google_chat_webhook_url) <= 2000
      and google_chat_webhook_url like 'https://chat.googleapis.com/%'
    )
  );

comment on column public.work_spaces.google_chat_webhook_url is
  'Incoming webhook URL for Google Chat Space. Only admins should set/read in UI.';

comment on column public.work_spaces.google_chat_forward_enabled is
  'When true, channel messages in this Work Space are POSTed to the webhook.';
