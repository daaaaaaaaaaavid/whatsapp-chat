-- DM invites: invite someone by email who is not yet on WhaChat.
-- Run in: Supabase → SQL Editor → Run
--
-- Email sending is handled by the app (Supabase Auth invite and/or Resend).
-- To customize Supabase Auth "Invite user" template (Hebrew), see Dashboard →
-- Authentication → Email Templates → Invite user. Suggested body:
--   {{ .Data.inviter_name }} הזמין אותך לשיחה ב-WhaChat.
--   לכניסה לחץ כאן: {{ .ConfirmationURL }}

create table if not exists public.dm_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  invitee_email text not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dm_invites_email_nonempty check (length(trim(invitee_email)) > 3)
);

create index if not exists dm_invites_token_idx
  on public.dm_invites (token);

create index if not exists dm_invites_inviter_idx
  on public.dm_invites (inviter_id);

create index if not exists dm_invites_invitee_email_idx
  on public.dm_invites (lower(trim(invitee_email)));

-- One open invite per inviter → email
create unique index if not exists dm_invites_pending_unique
  on public.dm_invites (inviter_id, lower(trim(invitee_email)))
  where accepted_at is null;

alter table public.dm_invites enable row level security;

drop policy if exists "dm_invites_select_own" on public.dm_invites;
create policy "dm_invites_select_own"
  on public.dm_invites for select
  to authenticated
  using (inviter_id = auth.uid());

drop policy if exists "dm_invites_insert_own" on public.dm_invites;
create policy "dm_invites_insert_own"
  on public.dm_invites for insert
  to authenticated
  with check (inviter_id = auth.uid());

-- Accept invite: email must match the signed-in user; create/reuse DM.
create or replace function public.accept_dm_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.dm_invites%rowtype;
  uid uuid := auth.uid();
  user_email text;
  existing_id uuid;
  new_id uuid;
  part record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from public.dm_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if inv.expires_at < now() then
    raise exception 'Invite expired';
  end if;

  if inv.accepted_at is not null then
    if inv.accepted_by = uid and inv.conversation_id is not null then
      return inv.conversation_id;
    end if;
    raise exception 'Invite already used';
  end if;

  if inv.inviter_id = uid then
    raise exception 'Cannot accept your own invite';
  end if;

  select lower(trim(email)) into user_email
  from auth.users
  where id = uid;

  if user_email is null or user_email <> lower(trim(inv.invitee_email)) then
    raise exception 'Invite email mismatch';
  end if;

  -- Find existing 1:1 between inviter and acceptor (not a group, exactly 2 participants)
  for part in
    select cp.conversation_id
    from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.user_id = inv.inviter_id
      and c.is_group = false
  loop
    if exists (
      select 1 from public.conversation_participants
      where conversation_id = part.conversation_id and user_id = uid
    ) and (
      select count(*)::int from public.conversation_participants
      where conversation_id = part.conversation_id
    ) = 2 then
      existing_id := part.conversation_id;
      exit;
    end if;
  end loop;

  if existing_id is not null then
    update public.dm_invites
    set accepted_at = now(),
        accepted_by = uid,
        conversation_id = existing_id
    where id = inv.id;
    return existing_id;
  end if;

  new_id := gen_random_uuid();
  insert into public.conversations (id, is_group, created_by)
  values (new_id, false, inv.inviter_id);

  insert into public.conversation_participants (conversation_id, user_id, is_admin)
  values
    (new_id, inv.inviter_id, false),
    (new_id, uid, false);

  update public.dm_invites
  set accepted_at = now(),
      accepted_by = uid,
      conversation_id = new_id
  where id = inv.id;

  return new_id;
end;
$$;

revoke all on function public.accept_dm_invite(text) from public;
grant execute on function public.accept_dm_invite(text) to authenticated;
