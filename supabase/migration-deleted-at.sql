-- Optional migration: soft-delete for messages
-- Run in Supabase SQL Editor if the column is missing

alter table public.messages add column if not exists deleted_at timestamptz;

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own"
  on public.messages for update
  to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);
