import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { parseDriveMediaRef } from "@/lib/google-drive"
import {
  copyDriveFileToUser,
  DriveAccountMissingError,
  findDriveCopy,
  grantDriveView,
  recordDriveCopy,
} from "@/lib/google-drive-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Body = {
  kind?: "message" | "status"
  id?: string
  mode?: "copy" | "view"
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = await checkRateLimitAsync(`drive-copy:${user.id}`, 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "יותר מדי הורדות. נסה שוב בעוד רגע." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  let payload: Body
  try {
    payload = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const kind = payload.kind
  const id = payload.id?.trim()
  const mode = payload.mode === "view" ? "view" : "copy"
  if ((kind !== "message" && kind !== "status") || !id) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const media = kind === "message" ? await loadMessageMedia(supabase, id) : await loadStatusMedia(supabase, id)
    if (!media) {
      return NextResponse.json(
        { error: "not_found", message: "הקובץ לא נמצא או שאין לך הרשאה אליו" },
        { status: 404 },
      )
    }
    const ref = parseDriveMediaRef(media.fileUrl)
    if (!ref) {
      return NextResponse.json(
        { error: "not_drive", message: "הקובץ הזה לא שמור בדרייב" },
        { status: 400 },
      )
    }

    if (ref.ownerId === user.id) {
      return NextResponse.json({ destFileId: ref.fileId, alreadyHad: true })
    }

    const existing = await findDriveCopy(user.id, ref.ownerId, ref.fileId)
    if (existing) {
      return NextResponse.json({ destFileId: existing, alreadyHad: true })
    }

    if (mode === "view") {
      await grantDriveView({
        sourceOwnerId: ref.ownerId,
        sourceFileId: ref.fileId,
        viewerUserId: user.id,
      })
      return NextResponse.json({ destFileId: ref.fileId, alreadyHad: false })
    }

    const destFileId = await copyDriveFileToUser({
      sourceOwnerId: ref.ownerId,
      sourceFileId: ref.fileId,
      destUserId: user.id,
      fileName: media.fileName,
      mimeType: media.mimeType,
    })
    await recordDriveCopy({
      userId: user.id,
      sourceOwnerId: ref.ownerId,
      sourceFileId: ref.fileId,
      destFileId,
      kind,
      sourceRowId: id,
    })
    return NextResponse.json({ destFileId, alreadyHad: false })
  } catch (err) {
    if (err instanceof DriveAccountMissingError) {
      return NextResponse.json(
        { error: "drive_not_connected", message: err.message },
        { status: 409 },
      )
    }
    return NextResponse.json(
      {
        error: "copy_failed",
        message: err instanceof Error ? err.message : "ההורדה לחשבון שלך נכשלה",
      },
      { status: 502 },
    )
  }
}

type MediaRow = { fileUrl: string; fileName: string; mimeType: string | null }

async function loadMessageMedia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageId: string,
): Promise<MediaRow | null> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, file_url, file_name, type, deleted_at, view_once, view_once_opened_at")
    .eq("id", messageId)
    .maybeSingle()
  if (error || !data || data.deleted_at || !data.file_url) return null
  if (data.view_once && data.view_once_opened_at) return null
  return {
    fileUrl: data.file_url as string,
    fileName: (data.file_name as string | null) || defaultName(data.type as string),
    mimeType: mimeFromType(data.type as string),
  }
}

async function loadStatusMedia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  statusId: string,
): Promise<MediaRow | null> {
  const { data, error } = await supabase
    .from("statuses")
    .select("id, media_url, expires_at")
    .eq("id", statusId)
    .maybeSingle()
  if (error || !data?.media_url) return null
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null
  const isVideo = /#(?:.*&)?(?:whachat=)?video\b/i.test(data.media_url)
  return {
    fileUrl: data.media_url as string,
    fileName: isVideo ? "status.mp4" : "status.jpg",
    mimeType: isVideo ? "video/mp4" : "image/jpeg",
  }
}

function defaultName(type: string) {
  if (type === "video") return "video.mp4"
  if (type === "image") return "image.jpg"
  if (type === "audio") return "audio.webm"
  return "file"
}

function mimeFromType(type: string) {
  if (type === "video") return "video/mp4"
  if (type === "image") return "image/jpeg"
  if (type === "audio") return "audio/webm"
  return null
}
