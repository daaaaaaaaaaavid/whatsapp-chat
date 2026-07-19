import { createClient } from "@/lib/supabase/client"
import { parseMediaStoragePath } from "@/lib/media-url"

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

export async function openViewOnceMessage(messageId: string): Promise<{
  ok: boolean
  alreadyOpened: boolean
  fileUrl: string | null
}> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc("open_view_once_message", {
    p_message_id: messageId,
  })
  if (error) throw error

  const result = data as {
    ok?: boolean
    already_opened?: boolean
    file_url?: string | null
  } | null

  const fileUrl = result?.file_url ?? null
  if (fileUrl) {
    const path = parseMediaStoragePath(fileUrl)
    if (path) {
      void supabase.storage.from("media").remove([path]).catch(() => {})
    }
  }

  return {
    ok: Boolean(result?.ok),
    alreadyOpened: Boolean(result?.already_opened),
    fileUrl,
  }
}
