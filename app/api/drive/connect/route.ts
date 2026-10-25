import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { driveAbout, googleOAuthConfigured, saveDriveAccount } from "@/lib/google-drive-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Body = {
  provider_token?: string
  provider_refresh_token?: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "חסרים GOOGLE_OAUTH_CLIENT_ID ו־GOOGLE_OAUTH_CLIENT_SECRET בשרת",
      },
      { status: 503 },
    )
  }

  const limited = await checkRateLimitAsync(`drive-connect:${user.id}`, 8, 10 * 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "יותר מדי ניסיונות חיבור. נסה שוב בעוד כמה דקות." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  let payload: Body
  try {
    payload = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const accessToken = payload.provider_token?.trim()
  const refreshToken = payload.provider_refresh_token?.trim()
  if (!accessToken) {
    return NextResponse.json(
      { error: "missing_token", message: "חסר טוקן Google. נסה לחבר שוב." },
      { status: 400 },
    )
  }
  if (!refreshToken) {
    return NextResponse.json(
      {
        error: "needs_consent",
        message: "גוגל לא החזיר הרשאת קבע. לחץ שוב על חיבור דרייב ואשר את הגישה.",
      },
      { status: 403 },
    )
  }

  try {
    await driveAbout(accessToken)
    const saved = await saveDriveAccount({
      userId: user.id,
      refreshToken,
      accessToken,
    })
    return NextResponse.json({ ok: true, googleEmail: saved.googleEmail })
  } catch (err) {
    const message = err instanceof Error ? err.message : "חיבור דרייב נכשל"
    const needsReauth = /insufficient|scope|401|403|invalid/i.test(message)
    return NextResponse.json(
      {
        error: needsReauth ? "needs_reauth" : "connect_failed",
        message: needsReauth ? "נדרשת הרשאה מחדש לגוגל דרייב." : message,
      },
      { status: needsReauth ? 403 : 502 },
    )
  }
}
