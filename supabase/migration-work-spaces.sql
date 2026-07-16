-- Work Spaces (team hubs) + channels linked to conversations
-- Run in: Supabase → SQL Editor → Run
-- Storage-efficient: channels reuse conversations/messages (no duplicate message store).

-- Spaces
create table if not exists public.work_spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  avatar_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Members
create table if not exists public.work_space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.work_spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (space_id, user_id)
);

create index if not exists work_space_members_user_idx
  on public.work_space_members (user_id);

create index if not exists work_space_members_space_idx
  on public.work_space_members (space_id);

-- Invite links
create table if not exists public.work_space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.work_spaces (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '14 days'),
  max_uses int,
  use_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists work_space_invites_token_idx
  on public.work_space_invites (token);

-- Link group conversations as channels of a space
alter table public.conversations
  add column if not exists work_space_id uuid references public.work_spaces (id) on delete set null;

create index if not exists conversations_work_space_idx
  on public.conversations (work_space_id)
  where work_space_id is not null;

-- Membership helper (security definer — avoids RLS recursion)
create or replace function public.is_work_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_space_members
    where space_id = p_space_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_work_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_space_members
    where space_id = p_space_id
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_work_space_member(uuid) from public;
grant execute on function public.is_work_space_member(uuid) to authenticated;

revoke all on function public.is_work_space_admin(uuid) from public;
grant execute on function public.is_work_space_admin(uuid) to authenticated;

-- RLS
alter table public.work_spaces enable row level security;
alter table public.work_space_members enable row level security;
alter table public.work_space_invites enable row level security;

drop policy if exists "work_spaces_select_member" on public.work_spaces;
create policy "work_spaces_select_member"
  on public.work_spaces for select
  to authenticated
  using (public.is_work_space_member(id));

drop policy if exists "work_spaces_insert_authenticated" on public.work_spaces;
create policy "work_spaces_insert_authenticated"
  on public.work_spaces for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "work_spaces_update_admin" on public.work_spaces;
create policy "work_spaces_update_admin"
  on public.work_spaces for update
  to authenticated
  using (public.is_work_space_admin(id))
  with check (public.is_work_space_admin(id));

drop policy if exists "work_spaces_delete_admin" on public.work_spaces;
create policy "work_spaces_delete_admin"
  on public.work_spaces for delete
  to authenticated
  using (public.is_work_space_admin(id));

drop policy if exists "work_space_members_select" on public.work_space_members;
create policy "work_space_members_select"
  on public.work_space_members for select
  to authenticated
  using (public.is_work_space_member(space_id));

-- Creator can add self as first admin; admins can add others
drop policy if exists "work_space_members_insert" on public.work_space_members;
create policy "work_space_members_insert"
  on public.work_space_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or public.is_work_space_admin(space_id)
  );

drop policy if exists "work_space_members_delete" on public.work_space_members;
create policy "work_space_members_delete"
  on public.work_space_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_work_space_admin(space_id)
  );

drop policy if exists "work_space_invites_select" on public.work_space_invites;
create policy "work_space_invites_select"
  on public.work_space_invites for select
  to authenticated
  using (public.is_work_space_member(space_id));

drop policy if exists "work_space_invites_insert" on public.work_space_invites;
create policy "work_space_invites_insert"
  on public.work_space_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.is_work_space_member(space_id)
  );

drop policy if exists "work_space_invites_delete" on public.work_space_invites;
create policy "work_space_invites_delete"
  on public.work_space_invites for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_work_space_admin(space_id)
  );

-- Join space by invite: add member + add to all channel conversations
create or replace function public.join_work_space_by_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.work_space_invites%rowtype;
  uid uuid := auth.uid();
  chan record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.work_space_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if inv.max_uses is not null and inv.use_count >= inv.max_uses then
    raise exception 'Invite exhausted';
  end if;

  insert into public.work_space_members (space_id, user_id, role)
  values (inv.space_id, uid, 'member')
  on conflict (space_id, user_id) do nothing;

  -- Add to every channel conversation in this space
  for chan in
    select id from public.conversations
    where work_space_id = inv.space_id and is_group = true
  loop
    insert into public.conversation_participants (conversation_id, user_id, is_admin)
    values (chan.id, uid, false)
    on conflict (conversation_id, user_id) do nothing;
  end loop;

  update public.work_space_invites
  set use_count = use_count + 1
  where id = inv.id;

  return inv.space_id;
end;
$$;

revoke all on function public.join_work_space_by_invite(text) from public;
grant execute on function public.join_work_space_by_invite(text) to authenticated;
