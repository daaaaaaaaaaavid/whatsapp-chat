import { NextResponse } from "next/server"
import { getSupabaseEnv } from "@/lib/supabase/env"

/** Debug helper: confirms whether Vercel has Supabase env at runtime. */
export async function GET() {
  const { url, anonKey } = getSupabaseEnv()
  return NextResponse.json({
    hasUrl: Boolean(url),
    hasAnonKey: Boolean(anonKey),
    urlHost: url ? (() => {
      try {
        return new URL(url).host
      } catch {
        return "invalid-url"
      }
    })() : null,
  })
}
