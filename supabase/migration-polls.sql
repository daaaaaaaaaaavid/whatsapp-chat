-- Polls: message type + votes table (WhatsApp-style surveys)

alter table public.messages drop constraint if exists messages_type_check;

alter table public.messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'audio', 'video', 'system', 'poll'));

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, option_id)
);

create index if not exists poll_votes_message_idx on public.poll_votes (message_id);

alter table public.poll_votes enable row level security;

drop policy if exists "poll_votes_select_participant" on public.poll_votes;
create policy "poll_votes_select_participant"
  on public.poll_votes for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "poll_votes_insert_own" on public.poll_votes;
create policy "poll_votes_insert_own"
  on public.poll_votes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and m.type in ('poll', 'text')
        and m.deleted_at is null
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists "poll_votes_delete_own" on public.poll_votes;
create policy "poll_votes_delete_own"
  on public.poll_votes for delete
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.poll_votes;
exception
  when duplicate_object then null;
end $$;
