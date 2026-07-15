-- Tighten RLS: restrict participant adds + require membership for message_reads insert
-- Run in: Supabase → SQL Editor → Run

-- Helper: conversation admin check without RLS recursion
create or replace function public.is_conversation_admin(p_conversation_id uuid)
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
      and is_admin = true
  );
$$;

revoke all on function public.is_conversation_admin(uuid) from public;
grant execute on function public.is_conversation_admin(uuid) to authenticated;

-- Participants: self-join, or creator/admin adding others (not any member)
drop policy if exists "participants_insert_authenticated" on public.conversation_participants;
create policy "participants_insert_authenticated"
  on public.conversation_participants for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
    or public.is_conversation_admin(conversation_id)
  );

-- message_reads: must be own row AND message in a conversation you belong to
drop policy if exists "reads_upsert_own" on public.message_reads;
create policy "reads_upsert_own"
  on public.message_reads for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );
