import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { mediaCleanupSummary, runMediaCleanup } from "@/lib/media-cleanup"

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const auth = req.headers.get("authorization")
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createServiceClient()
  if (!admin) {
    return NextResponse.json({ error: "service_role_missing" }, { status: 500 })
  }

  try {
    const result = await runMediaCleanup(admin)
    return NextResponse.json({
      ok: true,
      summary: mediaCleanupSummary(result),
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "cleanup_failed"
    console.error("[cleanup-media]", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
