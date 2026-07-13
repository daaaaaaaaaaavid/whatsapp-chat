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
