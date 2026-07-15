/**
 * Chat image/video auto-deletion is disabled — media stays with the conversation.
 * Status media still expires via `expires_at` (see status privacy migration).
 */
export const MEDIA_RETENTION_ENABLED = false

/** Kept for scripts/tests; unused while `MEDIA_RETENTION_ENABLED` is false. */
export const MEDIA_RETENTION_DAYS = 3650

export const MEDIA_EXPIRED_LABEL = "הקובץ לא זמין יותר"

export function mediaRetentionCutoffIso(now = new Date()): string {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - MEDIA_RETENTION_DAYS)
  return cutoff.toISOString()
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
