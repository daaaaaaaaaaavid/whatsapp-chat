import type { SupabaseClient } from "@supabase/supabase-js"
import { MEDIA_RETENTION_DAYS, mediaRetentionCutoffIso } from "@/lib/media-retention"

const BATCH_SIZE = 200
const MEDIA_BUCKET = "media"

export type MediaCleanupResult = {
  expiredMessages: number
  storageDeleted: number
  storageSkipped: number
  storageErrors: number
  statusesCleaned: number
}

/** Extract `{userId}/{...}` path from a Supabase public media URL. */
export function parseMediaStoragePath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl)
    const marker = "/storage/v1/object/public/media/"
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    return decodeURIComponent(url.pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}

/** Only delete chat uploads: `{userId}/{conversationId}/{file}` — not avatars or status folders. */
export function isChatMediaStoragePath(path: string): boolean {
  const parts = path.split("/").filter(Boolean)
  if (parts.length < 3) return false
  if (parts[1] === "status") return false
  if (parts[1].startsWith("avatar-")) return false
  return true
}

async function urlStillReferenced(
  admin: SupabaseClient,
  fileUrl: string,
  cutoffIso: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("messages")
    .select("id")
    .eq("file_url", fileUrl)
    .gte("created_at", cutoffIso)
    .is("deleted_at", null)
    .limit(1)

  if (error) throw error
  return (data?.length ?? 0) > 0
}

async function cleanupExpiredChatMedia(
  admin: SupabaseClient,
  cutoffIso: string,
): Promise<Pick<MediaCleanupResult, "expiredMessages" | "storageDeleted" | "storageSkipped" | "storageErrors">> {
  let expiredMessages = 0
  let storageDeleted = 0
  let storageSkipped = 0
  let storageErrors = 0

  while (true) {
    const { data: rows, error } = await admin
      .from("messages")
      .select("id, file_url")
      .in("type", ["image", "video"])
      .not("file_url", "is", null)
      .lt("created_at", cutoffIso)
      .is("deleted_at", null)
      .limit(BATCH_SIZE)

    if (error) throw error
    if (!rows?.length) break

    const messageIds = rows.map((r) => r.id)
    const urls = [...new Set(rows.map((r) => r.file_url).filter(Boolean) as string[])]

    const pathsToDelete: string[] = []
    for (const fileUrl of urls) {
      const path = parseMediaStoragePath(fileUrl)
      if (!path || !isChatMediaStoragePath(path)) {
        storageSkipped += 1
        continue
      }

      const stillReferenced = await urlStillReferenced(admin, fileUrl, cutoffIso)
      if (stillReferenced) {
        storageSkipped += 1
        continue
      }

      pathsToDelete.push(path)
    }

    const { error: updateError } = await admin
      .from("messages")
      .update({ file_url: null, file_name: null, file_size: null })
      .in("id", messageIds)

    if (updateError) throw updateError
    expiredMessages += messageIds.length

    if (pathsToDelete.length > 0) {
      const uniquePaths = [...new Set(pathsToDelete)]
      const { error: removeError } = await admin.storage.from(MEDIA_BUCKET).remove(uniquePaths)
      if (removeError) {
        storageErrors += uniquePaths.length
        console.error("[media-cleanup] storage remove failed:", removeError.message)
      } else {
        storageDeleted += uniquePaths.length
      }
    }
  }

  return { expiredMessages, storageDeleted, storageSkipped, storageErrors }
}

async function cleanupExpiredStatusMedia(admin: SupabaseClient): Promise<number> {
  let statusesCleaned = 0
  const nowIso = new Date().toISOString()

  while (true) {
    const { data: rows, error } = await admin
      .from("statuses")
      .select("id, media_url")
      .lt("expires_at", nowIso)
      .not("media_url", "is", null)
      .limit(BATCH_SIZE)

    if (error) throw error
    if (!rows?.length) break

    const paths = rows
      .map((row) => (row.media_url ? parseMediaStoragePath(row.media_url) : null))
      .filter((path): path is string => Boolean(path))

    const ids = rows.map((row) => row.id)
    const { error: updateError } = await admin.from("statuses").update({ media_url: null }).in("id", ids)
    if (updateError) throw updateError

    if (paths.length > 0) {
      const uniquePaths = [...new Set(paths)]
      const { error: removeError } = await admin.storage.from(MEDIA_BUCKET).remove(uniquePaths)
      if (removeError) {
        console.error("[media-cleanup] status storage remove failed:", removeError.message)
      }
    }

    statusesCleaned += ids.length
  }

  return statusesCleaned
}

export async function runMediaCleanup(admin: SupabaseClient): Promise<MediaCleanupResult> {
  const cutoffIso = mediaRetentionCutoffIso()
  const chat = await cleanupExpiredChatMedia(admin, cutoffIso)
  const statusesCleaned = await cleanupExpiredStatusMedia(admin)

  return {
    ...chat,
    statusesCleaned,
  }
}

export function mediaCleanupSummary(result: MediaCleanupResult): string {
  return [
    `retention=${MEDIA_RETENTION_DAYS}d`,
    `messages=${result.expiredMessages}`,
    `storageDeleted=${result.storageDeleted}`,
    `storageSkipped=${result.storageSkipped}`,
    `storageErrors=${result.storageErrors}`,
    `statuses=${result.statusesCleaned}`,
  ].join(", ")
}
