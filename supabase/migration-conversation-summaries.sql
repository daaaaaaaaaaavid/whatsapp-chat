-- Conversation inbox summary: last message preview + unread count in one RPC
-- Run in: Supabase → SQL Editor → Run

create or replace function public.my_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_message_content text,
  last_message_type text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  last_message_file_name text,
  last_message_deleted_at timestamptz,
  unread_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with my_convs as (
    select cp.conversation_id
    from public.conversation_participants cp
    where cp.user_id = auth.uid()
  ),
  last_msgs as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.id as last_message_id,
      m.content as last_message_content,
      m.type as last_message_type,
      m.sender_id as last_message_sender_id,
      m.created_at as last_message_created_at,
      m.file_name as last_message_file_name,
      m.deleted_at as last_message_deleted_at
    from public.messages m
    inner join my_convs mc on mc.conversation_id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select
      m.conversation_id,
      count(*)::bigint as unread_count
    from public.messages m
    inner join my_convs mc on mc.conversation_id = m.conversation_id
    where m.sender_id <> auth.uid()
      and m.deleted_at is null
      and not exists (
        select 1
        from public.message_reads r
        where r.message_id = m.id
          and r.user_id = auth.uid()
      )
    group by m.conversation_id
  )
  select
    mc.conversation_id,
    lm.last_message_id,
    lm.last_message_content,
    lm.last_message_type,
    lm.last_message_sender_id,
    lm.last_message_created_at,
    lm.last_message_file_name,
    lm.last_message_deleted_at,
    coalesce(u.unread_count, 0) as unread_count
  from my_convs mc
  left join last_msgs lm on lm.conversation_id = mc.conversation_id
  left join unread u on u.conversation_id = mc.conversation_id;
$$;

revoke all on function public.my_conversation_summaries() from public;
grant execute on function public.my_conversation_summaries() to authenticated;
