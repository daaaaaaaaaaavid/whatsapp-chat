import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteDriveAccount } from "@/lib/google-drive-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    await deleteDriveAccount(user.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      {
        error: "disconnect_failed",
        message: err instanceof Error ? err.message : "ניתוק נכשל",
      },
      { status: 500 },
    )
  }
}
