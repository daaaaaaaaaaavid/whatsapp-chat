-- View once images/videos (WhatsApp-style)
-- Run in: Supabase → SQL Editor → Run
-- Safe to re-run.

alter table public.messages
  add column if not exists view_once boolean not null default false;

alter table public.messages
  add column if not exists view_once_opened_at timestamptz;

alter table public.messages
  add column if not exists view_once_opened_by uuid references public.profiles (id) on delete set null;

create index if not exists messages_view_once_open_idx
  on public.messages (created_at)
  where view_once = true
    and file_url is not null
    and deleted_at is null;

-- Recipient opens view-once media: clear file for everyone (first open wins).
create or replace function public.open_view_once_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  msg public.messages%rowtype;
  uid uuid := auth.uid();
  old_url text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into msg
  from public.messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found';
  end if;

  if not public.is_conversation_member(msg.conversation_id) then
    raise exception 'Not a member';
  end if;

  if coalesce(msg.view_once, false) is not true then
    raise exception 'Not a view-once message';
  end if;

  if msg.type not in ('image', 'video') then
    raise exception 'Unsupported media type';
  end if;

  if msg.deleted_at is not null then
    raise exception 'Message deleted';
  end if;

  if msg.file_url is null then
    return jsonb_build_object(
      'ok', true,
      'already_opened', true,
      'file_url', null
    );
  end if;

  -- Sender previews client-side without burning; only recipients open.
  if msg.sender_id = uid then
    raise exception 'Sender cannot burn view-once';
  end if;

  old_url := msg.file_url;

  update public.messages
  set
    file_url = null,
    file_name = null,
    file_size = null,
    view_once_opened_at = coalesce(view_once_opened_at, now()),
    view_once_opened_by = coalesce(view_once_opened_by, uid)
  where id = p_message_id;

  return jsonb_build_object(
    'ok', true,
    'already_opened', false,
    'file_url', old_url
  );
end;
$$;

revoke all on function public.open_view_once_message(uuid) from public;
grant execute on function public.open_view_once_message(uuid) to authenticated;
