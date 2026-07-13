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
