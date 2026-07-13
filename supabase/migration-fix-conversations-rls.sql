-- Fix: allow conversation creator to SELECT/DELETE before participants exist
-- Run in Supabase SQL Editor

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "conversations_delete_creator" on public.conversations;
create policy "conversations_delete_creator"
  on public.conversations for delete
  to authenticated
  using (created_by = auth.uid());
