import { NextResponse } from "next/server"
import { getSupabaseEnv } from "@/lib/supabase/env"

/**
 * Returns public Supabase config for the browser.
 * The anon/publishable key is safe to expose (designed for clients).
 */
export async function GET() {
  const { url, anonKey } = getSupabaseEnv()

  return NextResponse.json(
    {
      hasUrl: Boolean(url),
      hasAnonKey: Boolean(anonKey),
      url: url || null,
      anonKey: anonKey || null,
      urlHost: url
        ? (() => {
            try {
              return new URL(url).host
            } catch {
              return "invalid-url"
            }
          })()
        : null,
      hint:
        !url || !anonKey
          ? "Environment variables are empty on the server. Re-add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel (Production), without Sensitive, then Redeploy without cache."
          : "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  )
}
