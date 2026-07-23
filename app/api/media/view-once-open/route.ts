import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { parseMediaStoragePath } from "@/lib/media-url"
import { isChatMediaStoragePath } from "@/lib/media-cleanup"

export const dynamic = "force-dynamic"

/**
 * Burn a view-once message and delete the storage object with the service role
 * (recipients cannot delete the sender's upload via Storage RLS).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = await checkRateLimitAsync(`view-once-open:${user.id}`, 40, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  let body: { messageId?: string }
  try {
    body = (await req.json()) as { messageId?: string }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : ""
  if (!messageId) {
    return NextResponse.json({ error: "message_id_required" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("open_view_once_message", {
    p_message_id: messageId,
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("open_view_once_message") || msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error: "migration_required",
          message: "הרץ את supabase/migration-view-once.sql",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: "open_failed", message: error.message }, { status: 400 })
  }

  const result = data as {
    ok?: boolean
    already_opened?: boolean
    file_url?: string | null
  } | null

  const fileUrl = result?.file_url ?? null
  let storageDeleted = false

  if (fileUrl && !result?.already_opened) {
    const path = parseMediaStoragePath(fileUrl)
    if (path && isChatMediaStoragePath(path)) {
      const admin = createServiceClient()
      if (admin) {
        const { error: removeErr } = await admin.storage.from("media").remove([path])
        storageDeleted = !removeErr
        if (removeErr) {
          console.error("view-once storage delete failed", removeErr.message)
        }
      }
    }
  }

  return NextResponse.json({
    ok: Boolean(result?.ok),
    alreadyOpened: Boolean(result?.already_opened),
    fileUrl,
    storageDeleted,
  })
}
