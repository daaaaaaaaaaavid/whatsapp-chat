-- Attachment menu message types: contact, event, sticker

alter table public.messages drop constraint if exists messages_type_check;

alter table public.messages
  add constraint messages_type_check
  check (type in (
    'text', 'image', 'file', 'audio', 'video', 'system', 'poll',
    'contact', 'event', 'sticker'
  ));
