import { createBrowserClient, type SupabaseClient } from "@supabase/ssr"

function readConfig() {
  const fromEnvUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const fromEnvKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  const fromWindowUrl = typeof window !== "undefined" ? window.__SUPABASE_URL__?.trim() : undefined
  const fromWindowKey = typeof window !== "undefined" ? window.__SUPABASE_ANON_KEY__?.trim() : undefined

  return {
    url: fromEnvUrl || fromWindowUrl || "",
    key: fromEnvKey || fromWindowKey || "",
  }
}

let browserClient: SupabaseClient | null = null

export function createClient() {
  const { url, key } = readConfig()

  if (!url || !key) {
    throw new Error("חסרים מפתחות Supabase. בדוק Environment Variables ב־Vercel ו־Redeploy.")
  }

  // Reuse one client in the browser
  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createBrowserClient(url, key)
    }
    return browserClient
  }

  return createBrowserClient(url, key)
}

declare global {
  interface Window {
    __SUPABASE_URL__?: string
    __SUPABASE_ANON_KEY__?: string
  }
}
