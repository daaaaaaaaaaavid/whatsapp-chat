import { createClient } from "@/lib/supabase/client"
import type { WatchSystemPayload } from "@/lib/types"
import { youtubeWatchUrl } from "@/lib/youtube"

export function parseWatchSystemPayload(content: string | null | undefined): WatchSystemPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as WatchSystemPayload
    if (parsed?.kind === "watch" && parsed.event && parsed.videoId) return parsed
  } catch {
    // not JSON
  }
  return null
}

export function watchSystemLabel(payload: WatchSystemPayload): string {
  switch (payload.event) {
    case "started":
      return payload.title
        ? `התחילה צפייה משותפת · ${payload.title}`
        : "התחילה צפייה משותפת"
    case "ended":
      return "הצפייה המשותפת הסתיימה"
    default:
      return "צפייה משותפת"
  }
}

export async function insertWatchSystemMessage(opts: {
  conversationId: string
  senderId: string
  event: WatchSystemPayload["event"]
  videoId: string
  title?: string
}) {
  const payload: WatchSystemPayload = {
    kind: "watch",
    event: opts.event,
    videoId: opts.videoId,
    ...(opts.title ? { title: opts.title } : {}),
  }

  const label = watchSystemLabel(payload)
  const supabase = createClient()
  const { error } = await supabase.from("messages").insert({
    conversation_id: opts.conversationId,
    sender_id: opts.senderId,
    type: "system",
    content: JSON.stringify(payload),
  })

  if (error) {
    const { error: err2 } = await supabase.from("messages").insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      type: "text",
      content: JSON.stringify(payload),
    })
    if (err2) {
      await supabase.from("messages").insert({
        conversation_id: opts.conversationId,
        sender_id: opts.senderId,
        type: "text",
        content: `${label}\n${youtubeWatchUrl(opts.videoId)}`,
      })
    }
  }
}
