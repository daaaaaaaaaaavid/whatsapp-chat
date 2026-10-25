import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { DriveAccountMissingError, openDriveSession } from "@/lib/google-drive-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = await checkRateLimitAsync(`drive-token:${user.id}`, 40, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "יותר מדי בקשות. נסה שוב בעוד רגע." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  try {
    const session = await openDriveSession(user.id)
    return NextResponse.json({
      accessToken: session.accessToken,
      folderId: session.folderId,
      expiresAt: session.expiresAt,
      googleEmail: session.googleEmail,
    })
  } catch (err) {
    if (err instanceof DriveAccountMissingError) {
      return NextResponse.json(
        { error: "drive_not_connected", message: err.message },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        error: "token_failed",
        message: err instanceof Error ? err.message : "פתיחת דרייב נכשלה",
      },
      { status: 502 },
    )
  }
}
