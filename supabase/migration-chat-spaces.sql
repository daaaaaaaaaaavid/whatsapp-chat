-- Personal / Work spaces live in profiles.chat_prefs (JSONB).
-- No extra tables: conversations and messages are stored once.
--
-- chat_prefs keys used by the client:
--   workConversations: uuid[]     -- conversation IDs tagged as Work for this user
--   activeSpace: 'personal'|'work'
--   workQuietHoursEnabled: boolean
--   workQuietStart / workQuietEnd: 'HH:MM' (local)
--
-- Run nothing required if chat_prefs already exists (see schema.sql / migration-bugfixes.sql).
-- This file documents the storage-efficient space model only.

select 1;
