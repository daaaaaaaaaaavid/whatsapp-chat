-- Treat Google-matched profiles as known contacts (even without a shared chat).
-- After syncing Google contacts, matched users appear in contacts / statuses.
-- Run in: Supabase → SQL Editor → Run

create or replace function public.is_known_contact(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user_id = auth.uid()
    or exists (
      select 1
      from public.conversation_participants mine
      join public.conversation_participants theirs
        on mine.conversation_id = theirs.conversation_id
      where mine.user_id = auth.uid()
        and theirs.user_id = p_user_id
    )
    or exists (
      select 1
      from public.google_contacts gc
      where gc.user_id = auth.uid()
        and gc.matched_profile_id = p_user_id
    );
$$;

revoke all on function public.is_known_contact(uuid) from public;
grant execute on function public.is_known_contact(uuid) to authenticated;
