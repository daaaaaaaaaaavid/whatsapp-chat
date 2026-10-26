import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { isDriveMediaUrl, parseDriveMediaRef } from "@/lib/google-drive"
import {
  deleteDriveMediaRefs,
  driveAccessTokenForUser,
  DriveAccountMissingError,
} from "@/lib/google-drive-server"
import { driveMediaUnavailable, proxyDriveMedia } from "@/lib/drive-media-stream"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type MessageRow = {
  id: string
  sender_id: string
  file_url: string | null
  deleted_at: string | null
  view_once: boolean | null
  view_once_opened_at: string | null
  is_forwarded: boolean | null
}

async function loadMessage(messageId: string): Promise<{ userId: string; message: MessageRow } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from("messages")
    .select("id, sender_id, file_url, deleted_at, view_once, view_once_opened_at, is_forwarded")
    .eq("id", messageId)
    .maybeSingle()
  if (error || !data) return null
  return { userId: user.id, message: data as MessageRow }
}

function canStream(message: MessageRow): boolean {
  if (message.deleted_at || !message.file_url || !isDriveMediaUrl(message.file_url)) return false
  if (message.view_once && message.view_once_opened_at) return false
  const ref = parseDriveMediaRef(message.file_url)
  if (!ref) return false
  return ref.ownerId === message.sender_id || Boolean(message.is_forwarded)
}

/** Stream the sender's file to conversation members. A deleted file is not served. */
export async function GET(req: Request) {
  const messageId = new URL(req.url).searchParams.get("id")?.trim() ?? ""
  if (!UUID_RE.test(messageId)) return driveMediaUnavailable()

  const loaded = await loadMessage(messageId)
  if (!loaded) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const limited = await checkRateLimitAsync(`message-media:${loaded.userId}`, 240, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  if (!canStream(loaded.message) || !loaded.message.file_url) return driveMediaUnavailable()
  const ref = parseDriveMediaRef(loaded.message.file_url)
  if (!ref) return driveMediaUnavailable()

  let accessToken: string
  try {
    accessToken = await driveAccessTokenForUser(ref.ownerId)
  } catch (err) {
    if (err instanceof DriveAccountMissingError) return driveMediaUnavailable()
    console.error("message media token:", err instanceof Error ? err.message : err)
    return driveMediaUnavailable()
  }

  return proxyDriveMedia(req, accessToken, ref.fileId)
}

/**
 * Sender deletes the message for everyone.
 * The Drive file and saved copies are removed when no other message still uses them.
 */
export async function DELETE(req: Request) {
  const messageId = new URL(req.url).searchParams.get("id")?.trim() ?? ""
  if (!UUID_RE.test(messageId)) return driveMediaUnavailable()

  const loaded = await loadMessage(messageId)
  if (!loaded) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (loaded.message.sender_id !== loaded.userId) return driveMediaUnavailable()

  const limited = await checkRateLimitAsync(`message-media-del:${loaded.userId}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const fileUrl = loaded.message.file_url
  const ref = fileUrl ? parseDriveMediaRef(fileUrl) : null
  if (!loaded.message.deleted_at && fileUrl && ref && ref.ownerId === loaded.userId) {
    const admin = createServiceClient()
    let otherUses = 1
    if (admin) {
      const { count, error: countError } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("file_url", fileUrl)
        .is("deleted_at", null)
        .neq("id", messageId)
      otherUses = countError ? 1 : (count ?? 0)
    }
    if (admin && otherUses === 0) {
      try {
        await deleteDriveMediaRefs([fileUrl])
      } catch (err) {
        console.error("message media delete:", err instanceof Error ? err.message : err)
      }
    }
  }

  if (!loaded.message.deleted_at) {
    const supabase = await createClient()
    const { error } = await supabase
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
        content: null,
        file_url: null,
      })
      .eq("id", messageId)
      .eq("sender_id", loaded.userId)
    if (error) {
      return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
