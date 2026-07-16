-- Allow users to leave chats / groups (and admins to remove members).
-- Without a DELETE policy, leaveConversation silently deletes 0 rows under RLS.
-- Run in: Supabase → SQL Editor → Run

drop policy if exists "participants_delete_own" on public.conversation_participants;
drop policy if exists "participants_delete_self_or_admin" on public.conversation_participants;
create policy "participants_delete_self_or_admin"
  on public.conversation_participants for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_conversation_admin(conversation_id)
  );
