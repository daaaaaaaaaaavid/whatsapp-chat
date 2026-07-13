# WhaChat

WhatsApp-style chat app (Next.js + Supabase).

## Google Contacts sync

To let users import contacts from their Google account and start chats with people already on WhaChat:

1. In **Google Cloud Console** → APIs & Services:
   - Enable **People API**
   - OAuth consent screen → add scope `https://www.googleapis.com/auth/contacts.readonly`
2. Use the same OAuth client credentials already configured in **Supabase → Authentication → Google**.
3. In Supabase SQL Editor, run [`supabase/migration-google-contacts.sql`](supabase/migration-google-contacts.sql).

Users sync from **צ'אט חדש → סנכרן אנשי קשר מגוגל**. Matching is by email only; contacts not registered on WhaChat appear as unavailable.

## Voice / video calls (TURN)

Calls use WebRTC with public STUN. For reliable calls behind NAT/firewalls, add a TURN provider (e.g. Metered, Twilio) and set:

```
NEXT_PUBLIC_TURN_URLS=turn:your.turn.host:443?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=your-username
NEXT_PUBLIC_TURN_CREDENTIAL=your-credential
```

`NEXT_PUBLIC_TURN_URLS` accepts a comma-separated list of URLs.
