# Security hardening — apply once

## What to run

1. Open **Supabase → SQL Editor**.
2. Paste and run the entire file:
   `supabase/migration-security-hardening.sql`
3. Confirm success (no errors).
4. Deploy / wait for Vercel with the matching app commit.

Do **not** re-run older files after this:
- `migration-media-storage.sql`
- `migration-bugfixes.sql` (media public section)

Those can reopen the media bucket to the public.

## What it fixes

- No arbitrary self-join into conversations (invite RPC only)
- Path-aware private media reads
- Profile email locked to `auth.users`
- Safer profile / email lookup projections
- Immutable message / conversation identity columns
- Hardened group invites
- `call_sessions` + private Realtime topic authorization

## After migrate

Smoke-test with two accounts:
- Direct chat + group invite
- Image / voice upload and playback
- Status media
- Voice/video call + typing indicator
- Start chat by email
