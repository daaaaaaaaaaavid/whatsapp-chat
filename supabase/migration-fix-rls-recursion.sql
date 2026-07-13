-- Fix infinite recursion in conversation_participants RLS
-- Run this entire file in Supabase → SQL Editor → Run

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

-- Participants: no self-referencing subquery
drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "participants_insert_authenticated" on public.conversation_participants;
create policy "participants_insert_authenticated"
  on public.conversation_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or public.is_conversation_member(conversation_id)
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

-- Conversations
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_conversation_member(id)
  );

drop policy if exists "conversations_update_participant" on public.conversations;
create policy "conversations_update_participant"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "conversations_delete_creator" on public.conversations;
create policy "conversations_delete_creator"
  on public.conversations for delete
  to authenticated
  using (created_by = auth.uid());

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
