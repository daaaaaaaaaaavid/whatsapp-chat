import { createClient } from "@/lib/supabase/server"
import { ensureProfileServer } from "@/lib/ensure-profile"
import { safeRedirectPath } from "@/lib/safe-redirect"
import { type NextRequest, NextResponse } from "next/server"

function clearNextCookie(response: NextResponse) {
  response.cookies.set("oauth_next", "", { path: "/", maxAge: 0 })
}

function readNextPath(request: NextRequest): string {
  const fromQuery = request.nextUrl.searchParams.get("next")
  if (fromQuery) return safeRedirectPath(fromQuery)

  const fromCookie = request.cookies.get("oauth_next")?.value
  if (fromCookie) {
    try {
      const decoded = decodeURIComponent(fromCookie)
      return safeRedirectPath(decoded)
    } catch {
      // ignore bad cookie
    }
  }
  return "/chat"
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const oauthError = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const next = readNextPath(request)

  if (oauthError) {
    const reason = encodeURIComponent(errorDescription || oauthError)
    const res = NextResponse.redirect(`${origin}/auth/error?reason=${reason}`)
    clearNextCookie(res)
    return res
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        if (data.user) {
          try {
            await ensureProfileServer(data.user)
          } catch {
            // profile optional at login
          }
        }
        const res = NextResponse.redirect(`${origin}${next}`)
        clearNextCookie(res)
        return res
      }
      const reason = encodeURIComponent(error.message || "exchange_failed")
      const res = NextResponse.redirect(`${origin}/auth/error?reason=${reason}`)
      clearNextCookie(res)
      return res
    } catch (e) {
      const msg = e instanceof Error ? e.message : "callback_failed"
      const res = NextResponse.redirect(`${origin}/auth/error?reason=${encodeURIComponent(msg)}`)
      clearNextCookie(res)
      return res
    }
  }

  const res = NextResponse.redirect(`${origin}/auth/error?reason=missing_code`)
  clearNextCookie(res)
  return res
}
