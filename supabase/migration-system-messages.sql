-- Allow system messages (call events, etc.) in the messages table
alter table public.messages drop constraint if exists messages_type_check;

alter table public.messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'audio', 'video', 'system'));
