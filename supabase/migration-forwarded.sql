-- Forwarded message indicator
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.

alter table public.messages
  add column if not exists is_forwarded boolean not null default false;
