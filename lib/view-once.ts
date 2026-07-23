export const VIEW_ONCE_LABEL = "צפייה חד־פעמית"
export const VIEW_ONCE_OPENED_LABEL = "נצפה"
export const VIEW_ONCE_PHOTO_LABEL = "תמונה לצפייה חד־פעמית"
export const VIEW_ONCE_VIDEO_LABEL = "סרטון לצפייה חד־פעמית"

export function isViewOnceMessage(message: {
  view_once?: boolean | null
}): boolean {
  return Boolean(message.view_once)
}

/** Media was view-once and has already been opened (or cleared). */
export function isViewOnceOpened(message: {
  view_once?: boolean | null
  file_url: string | null
  deleted_at?: string | null
}): boolean {
  return Boolean(message.view_once) && !message.file_url && !message.deleted_at
}

export function viewOncePreviewLabel(message: {
  type: string
  view_once?: boolean | null
  file_url: string | null
  deleted_at?: string | null
}): string | null {
  if (!message.view_once) return null
  if (isViewOnceOpened(message)) return `👁 ${VIEW_ONCE_OPENED_LABEL}`
  if (message.type === "video") return `👁 ${VIEW_ONCE_VIDEO_LABEL}`
  return `👁 ${VIEW_ONCE_PHOTO_LABEL}`
}

/**
 * Burn view-once via server route so Storage is deleted with the service role
 * (client Storage RLS only allows deleting own uploads).
 */
export async function openViewOnceMessage(messageId: string): Promise<{
  ok: boolean
  alreadyOpened: boolean
  fileUrl: string | null
}> {
  const res = await fetch("/api/media/view-once-open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    alreadyOpened?: boolean
    fileUrl?: string | null
    message?: string
    error?: string
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || "פתיחת המדיה נכשלה")
  }

  return {
    ok: Boolean(data.ok),
    alreadyOpened: Boolean(data.alreadyOpened),
    fileUrl: data.fileUrl ?? null,
  }
}
