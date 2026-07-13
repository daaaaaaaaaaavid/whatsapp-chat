"use client"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"

const NEXT_COOKIE = "oauth_next"

function setNextPath(nextPath: string) {
  const safe = nextPath.startsWith("/") ? nextPath : "/chat"
  document.cookie = `${NEXT_COOKIE}=${encodeURIComponent(safe)}; path=/; max-age=600; SameSite=Lax`
}

export async function signInWithGoogle(nextPath = "/chat") {
  await ensureSupabaseConfig()
  const supabase = createClient()

  // Store destination in a cookie — do NOT put ?next= on redirectTo.
  // Supabase Redirect allow-list often rejects URLs with query strings, which
  // makes Google OAuth appear to hang after picking an account.
  setNextPath(nextPath)
  const redirectTo = `${window.location.origin}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      // Avoid access_type=offline + prompt=select_account — they often hang
      // Google's account chooser when the OAuth client / consent screen
      // isn't fully configured (Testing mode, missing redirect URI, etc.).
      skipBrowserRedirect: false,
    },
  })

  if (error) throw error
  if (data.url) {
    window.location.assign(data.url)
    return
  }
  throw new Error("לא התקבלה כתובת התחברות מ־Google. בדוק שהפעלת Google ב־Supabase.")
}

const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly"

/**
 * Incremental Google consent for People API (contacts.readonly).
 * After redirect, session.provider_token can be used to sync contacts once.
 * Destination is /chat?google_contacts=1 by default (via oauth_next cookie).
 */
export async function connectGoogleContacts(nextPath = "/chat?google_contacts=1") {
  await ensureSupabaseConfig()
  const supabase = createClient()

  setNextPath(nextPath)
  const redirectTo = `${window.location.origin}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: CONTACTS_SCOPE,
      queryParams: {
        include_granted_scopes: "true",
      },
      skipBrowserRedirect: false,
    },
  })

  if (error) throw error
  if (data.url) {
    window.location.assign(data.url)
    return
  }
  throw new Error("לא התקבלה כתובת הרשאה ל־Google Contacts. בדוק שהוספת contacts.readonly ב־Google Cloud.")
}
