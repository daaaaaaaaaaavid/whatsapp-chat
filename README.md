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
NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app
NEXT_PUBLIC_SUPPORT_EMAIL=your-group@googlegroups.com
```

Then in **Google Cloud Console → OAuth consent screen**:

1. **User support email** → your Google Group address
2. **App home page** → `https://your-app.vercel.app/about`
3. **Privacy policy** → `https://your-app.vercel.app/privacy`
4. **Terms of service** → `https://your-app.vercel.app/terms`
5. **Scopes** → include `https://www.googleapis.com/auth/contacts.readonly`
6. **Publish App** → submit for **Google verification** (required for sensitive scopes)

In **Supabase → Authentication → URL Configuration**:

- **Site URL** → `https://your-app.vercel.app`
- **Redirect URLs** → `https://your-app.vercel.app/auth/callback`

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
