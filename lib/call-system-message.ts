import { createClient } from "@/lib/supabase/client"
import type { CallSystemPayload } from "@/lib/types"
import { formatCallDuration } from "@/lib/format"

export function parseCallSystemPayload(content: string | null | undefined): CallSystemPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as CallSystemPayload
    if (parsed?.kind === "call" && parsed.event) return parsed
  } catch {
    // legacy plain-text system messages
  }
  return null
}

export function callSystemLabel(payload: CallSystemPayload): string {
  const media = payload.video ? "וידאו" : "קולית"
  switch (payload.event) {
    case "incoming":
      return `שיחה נכנסת · ${media}`
    case "outgoing":
      return `שיחה יוצאת · ${media}`
    case "ended": {
      const dur =
        typeof payload.durationSec === "number" && payload.durationSec > 0
          ? ` · ${formatCallDuration(payload.durationSec)}`
          : ""
      return `שיחה הסתיימה${dur}`
    }
    case "missed":
      return `שיחה שלא נענתה · ${media}`
    case "rejected":
      return `שיחה נדחתה · ${media}`
    default:
      return "שיחה"
  }
}

export async function insertCallSystemMessage(opts: {
  conversationId: string
  senderId: string
  event: CallSystemPayload["event"]
  video: boolean
  durationSec?: number
}) {
  const payload: CallSystemPayload = {
    kind: "call",
    event: opts.event,
    video: opts.video,
    ...(typeof opts.durationSec === "number" ? { durationSec: opts.durationSec } : {}),
  }

  const label = callSystemLabel(payload)
  const supabase = createClient()
  const { error } = await supabase.from("messages").insert({
    conversation_id: opts.conversationId,
    sender_id: opts.senderId,
    type: "system",
    content: JSON.stringify(payload),
  })

  if (error) {
    // Fallback if migration not applied — still store JSON so UI can parse, with text type
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
        content: label,
      })
    }
  }
}
