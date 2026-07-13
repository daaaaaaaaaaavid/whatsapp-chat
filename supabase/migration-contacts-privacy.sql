-- Contact privacy: users only see profiles of people they share a conversation with.
-- New chats with strangers require exact email lookup via RPC.
-- Run in: Supabase → SQL Editor → Run

-- Helper: true if the other user shares at least one conversation with auth.uid()
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
    );
$$;

revoke all on function public.is_known_contact(uuid) from public;
grant execute on function public.is_known_contact(uuid) to authenticated;

-- Exact email lookup (case-insensitive). Returns at most one profile.
-- Used to start a chat with someone who is not yet a contact.
create or replace function public.find_user_by_email(p_email text)
returns setof public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select p.*
  from public.profiles p
  where p.email is not null
    and lower(trim(p.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

-- Profiles: own row + people you have interacted with (shared conversation)
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (public.is_known_contact(id));

-- Statuses: own + contacts only
drop policy if exists "statuses_select_authenticated" on public.statuses;
create policy "statuses_select_authenticated"
  on public.statuses for select
  to authenticated
  using (
    expires_at > now()
    and public.is_known_contact(user_id)
  );

-- Message reads: only within conversations you belong to
drop policy if exists "reads_select_participant" on public.message_reads;
create policy "reads_select_participant"
  on public.message_reads for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );
