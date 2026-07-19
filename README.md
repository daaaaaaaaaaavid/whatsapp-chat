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

### Remove the Google "unverified app" warning (production)

The app ships public legal pages required for Google OAuth verification:

| Page | URL |
|------|-----|
| About / home | `/about` |
| Privacy policy | `/privacy` |
| Terms of service | `/terms` |

Set in `.env.local` (and Vercel → Environment Variables):

```
NEXT_PUBLIC_SITE_URL=https://whatsapp-chat-beta.vercel.app
NEXT_PUBLIC_SUPPORT_EMAIL=whachat-support@googlegroups.com
```

Then in **Google Cloud Console → OAuth consent screen**:

1. **User support email** → `whachat-support@googlegroups.com`
2. **App home page** → `https://whatsapp-chat-beta.vercel.app/about`
3. **Privacy policy** → `https://whatsapp-chat-beta.vercel.app/privacy`
4. **Terms of service** → `https://whatsapp-chat-beta.vercel.app/terms`
5. **Scopes** → include `https://www.googleapis.com/auth/contacts.readonly`
6. **Publish App** → submit for **Google verification** (required for sensitive scopes)

In **Supabase → Authentication → URL Configuration**:

- **Site URL** → `https://whatsapp-chat-beta.vercel.app`
- **Redirect URLs** → `https://whatsapp-chat-beta.vercel.app/auth/callback`

In **Google Cloud → Credentials → OAuth client → Authorized redirect URIs**:

- `https://YOUR_PROJECT.supabase.co/auth/v1/callback`

For verification, Google may ask for a short YouTube demo showing: login → sync Google contacts → how contacts are used to start chats.

## Voice / video calls (TURN)

Calls use WebRTC with public STUN. For reliable calls behind NAT/firewalls, add a TURN provider (e.g. Metered, Twilio) and set:

```
NEXT_PUBLIC_TURN_URLS=turn:your.turn.host:443?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=your-username
NEXT_PUBLIC_TURN_CREDENTIAL=your-credential
```

`NEXT_PUBLIC_TURN_URLS` accepts a comma-separated list of URLs.

## Group meetings (LiveKit)

Zoom-style group video/audio with invite links. 1:1 calls stay on WebRTC; group meetings use LiveKit.

1. Create a **free** project at [LiveKit Cloud](https://cloud.livekit.io) (no credit card required for the free tier).
2. Copy **WebSocket URL**, **API Key**, and **API Secret**.
3. Set in `.env.local` and **Vercel → Environment Variables**:

```
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

4. In Supabase SQL Editor, run [`supabase/migration-meeting-sessions.sql`](supabase/migration-meeting-sessions.sql).

In a chat, tap the **people** icon to start a meeting, copy the invite link (`/invite/meet_…`), or join from the system message. Works in groups and during Watch Together.
