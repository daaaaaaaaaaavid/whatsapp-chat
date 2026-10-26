import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { isDriveMediaUrl, parseDriveMediaRef } from "@/lib/google-drive"
import {
  deleteDriveMediaRefs,
  driveAccessTokenForUser,
  DriveAccountMissingError,
} from "@/lib/google-drive-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DRIVE_MEDIA = "https://www.googleapis.com/drive/v3/files"

type StatusRow = {
  id: string
  user_id: string
  media_url: string | null
  expires_at: string | null
}

async function loadVisibleStatus(statusId: string): Promise<StatusRow | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from("statuses")
    .select("id, user_id, media_url, expires_at")
    .eq("id", statusId)
    .maybeSingle()
  if (error || !data) return null
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null
  return data as StatusRow
}

function unavailable() {
  return NextResponse.json({ error: "unavailable" }, { status: 404 })
}

/** Stream the owner's file. Nothing is copied to the viewer, so a deleted file is gone. */
export async function GET(req: Request) {
  const statusId = new URL(req.url).searchParams.get("id")?.trim() ?? ""
  if (!UUID_RE.test(statusId)) return unavailable()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const limited = await checkRateLimitAsync(`status-media:${user.id}`, 240, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  const status = await loadVisibleStatus(statusId)
  if (!status?.media_url || !isDriveMediaUrl(status.media_url)) return unavailable()
  const ref = parseDriveMediaRef(status.media_url)
  if (!ref || ref.ownerId !== status.user_id) return unavailable()

  let accessToken: string
  try {
    accessToken = await driveAccessTokenForUser(ref.ownerId)
  } catch (err) {
    if (err instanceof DriveAccountMissingError) return unavailable()
    console.error("status media token:", err instanceof Error ? err.message : err)
    return unavailable()
  }

  const range = req.headers.get("range")
  const upstream = await fetch(`${DRIVE_MEDIA}/${encodeURIComponent(ref.fileId)}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(range ? { Range: range } : {}),
    },
  })

  if (upstream.status === 404 || upstream.status === 403 || upstream.status === 401) {
    return unavailable()
  }
  if (!upstream.ok && upstream.status !== 206) {
    console.error("status media stream:", upstream.status)
    return unavailable()
  }

  const headers = new Headers()
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream")
  headers.set("Content-Disposition", "inline")
  headers.set("Cache-Control", "private, no-store")
  headers.set("Accept-Ranges", "bytes")
  headers.set("X-Content-Type-Options", "nosniff")
  const length = upstream.headers.get("content-length")
  if (length) headers.set("Content-Length", length)
  const contentRange = upstream.headers.get("content-range")
  if (contentRange) headers.set("Content-Range", contentRange)

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}

/** Owner removes the status and the Drive file, including copies already saved by viewers. */
export async function DELETE(req: Request) {
  const statusId = new URL(req.url).searchParams.get("id")?.trim() ?? ""
  if (!UUID_RE.test(statusId)) return unavailable()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await supabase
    .from("statuses")
    .select("id, user_id, media_url")
    .eq("id", statusId)
    .maybeSingle()
  if (error || !data || data.user_id !== user.id) return unavailable()

  const mediaUrl = data.media_url as string | null
  if (mediaUrl && isDriveMediaUrl(mediaUrl)) {
    const ref = parseDriveMediaRef(mediaUrl)
    if (ref?.ownerId === user.id) {
      await deleteDriveMediaRefs([mediaUrl])
    }
  }

  const { error: deleteError } = await supabase
    .from("statuses")
    .delete()
    .eq("id", statusId)
    .eq("user_id", user.id)
  if (deleteError) {
    return NextResponse.json({ error: "delete_failed", message: deleteError.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
