import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { googleOAuthConfigured, loadDriveAccount } from "@/lib/google-drive-server"

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

  try {
    const row = await loadDriveAccount(user.id)
    return NextResponse.json({
      connected: Boolean(row),
      configured: googleOAuthConfigured(),
      googleEmail: row?.google_email ?? null,
      folderId: row?.folder_id ?? null,
    })
  } catch (err) {
    return NextResponse.json(
      { error: "status_failed", message: err instanceof Error ? err.message : "status_failed" },
      { status: 500 },
    )
  }
}
