/** Chat image/video retention window (days). Avatars and other files are not affected. */
export const MEDIA_RETENTION_DAYS = 4

/** When false, chat media cleanup is skipped (statuses still expire via expires_at). */
export const MEDIA_RETENTION_ENABLED = true

export const MEDIA_EXPIRED_LABEL = "הקובץ לא זמין יותר"

export function mediaRetentionCutoffIso(now = new Date()): string {
  const cutoff = new Date(now.getTime())
  // Use UTC day math so server timezone / DST cannot shrink the window.
  cutoff.setUTCDate(cutoff.getUTCDate() - MEDIA_RETENTION_DAYS)
  return cutoff.toISOString()
}

/** True when a message timestamp is older than the retention window. */
export function isOlderThanRetention(
  createdAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!createdAt) return false
  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  const minAgeMs = MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return createdMs <= now.getTime() - minAgeMs
}

export function isExpiredChatMedia(message: {
  type: string
  file_url: string | null
  deleted_at?: string | null
}): boolean {
  return (
    (message.type === "image" || message.type === "video") &&
    !message.file_url &&
    !message.deleted_at
  )
}
