import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

type SupabaseConfig = { url: string; key: string }

function readInlineConfig(): SupabaseConfig {
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

/** Load config from the server API into window (needed when build-time env is empty). */
export async function ensureSupabaseConfig(): Promise<SupabaseConfig> {
  const inline = readInlineConfig()
  if (inline.url && inline.key) return inline

  const res = await fetch("/api/supabase-config", { cache: "no-store" })
  const data = (await res.json()) as {
    url?: string | null
    anonKey?: string | null
    hint?: string
  }

  const url = data.url?.trim() || ""
  const key = data.anonKey?.trim() || ""

  if (!url || !key) {
    throw new Error(
      data.hint ||
        "חסרים מפתחות Supabase ב־Vercel. מחק והוסף מחדש את Environment Variables (בלי Sensitive), ואז Redeploy.",
    )
  }

  if (typeof window !== "undefined") {
    window.__SUPABASE_URL__ = url
    window.__SUPABASE_ANON_KEY__ = key
  }

  browserClient = null
  return { url, key }
}

export function createClient() {
  const { url, key } = readInlineConfig()

  if (!url || !key) {
    throw new Error("חסרים מפתחות Supabase. בדוק Environment Variables ב־Vercel ו־Redeploy.")
  }

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
