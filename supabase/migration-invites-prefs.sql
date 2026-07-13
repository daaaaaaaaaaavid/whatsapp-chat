-- Invites, chat prefs sync, optional reply_to
-- Run in: Supabase → SQL Editor → Run

-- Structured reply (optional; UI still quotes text for compatibility)
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null;

-- Sync archive/favorite/pin/mute across devices
alter table public.profiles
  add column if not exists chat_prefs jsonb not null default '{}'::jsonb;

-- Invite links to join a conversation / group
create table if not exists public.conversation_invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses int,
  use_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists conversation_invites_token_idx
  on public.conversation_invites (token);

create index if not exists conversation_invites_conversation_idx
  on public.conversation_invites (conversation_id);

alter table public.conversation_invites enable row level security;

drop policy if exists "invites_select_member" on public.conversation_invites;
create policy "invites_select_member"
  on public.conversation_invites for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "invites_insert_member" on public.conversation_invites;
create policy "invites_insert_member"
  on public.conversation_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "invites_delete_creator" on public.conversation_invites;
create policy "invites_delete_creator"
  on public.conversation_invites for delete
  to authenticated
  using (created_by = auth.uid() or public.is_conversation_member(conversation_id));

-- Join a conversation by invite token
create or replace function public.join_conversation_by_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.conversation_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.conversation_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    raise exception 'Invite already used up';
  end if;

  insert into public.conversation_participants (conversation_id, user_id, is_admin)
  values (inv.conversation_id, auth.uid(), false)
  on conflict (conversation_id, user_id) do nothing;

  update public.conversation_invites
  set use_count = use_count + 1
  where id = inv.id;

  return inv.conversation_id;
end;
$$;

revoke all on function public.join_conversation_by_invite(text) from public;
grant execute on function public.join_conversation_by_invite(text) to authenticated;

-- Blocked contacts (simple list on profile)
alter table public.profiles
  add column if not exists blocked_user_ids uuid[] not null default '{}'::uuid[];
