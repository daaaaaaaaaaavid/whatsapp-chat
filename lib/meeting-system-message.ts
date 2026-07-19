import { createClient } from "@/lib/supabase/client"
import type { MeetingSystemPayload } from "@/lib/types"
import { meetingInvitePageUrl } from "@/lib/meeting-invite"

export function parseMeetingSystemPayload(
  content: string | null | undefined,
): MeetingSystemPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as MeetingSystemPayload
    if (
      parsed?.kind === "meeting" &&
      (parsed.event === "started" || parsed.event === "ended") &&
      parsed.meetingId &&
      parsed.inviteToken
    ) {
      return parsed
    }
  } catch {
    // not JSON
  }
  return null
}

export function meetingSystemLabel(payload: MeetingSystemPayload): string {
  switch (payload.event) {
    case "started":
      return "התחילה פגישה קבוצתית"
    case "ended":
      return "הפגישה הסתיימה"
    default:
      return "פגישה"
  }
}

export async function insertMeetingSystemMessage(opts: {
  conversationId: string
  senderId: string
  event: MeetingSystemPayload["event"]
  meetingId: string
  inviteToken: string
}) {
  const payload: MeetingSystemPayload = {
    kind: "meeting",
    event: opts.event,
    meetingId: opts.meetingId,
    inviteToken: opts.inviteToken,
  }

  const label = meetingSystemLabel(payload)
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
      const link =
        opts.event === "started" ? `\n${meetingInvitePageUrl(opts.inviteToken)}` : ""
      await supabase.from("messages").insert({
        conversation_id: opts.conversationId,
        sender_id: opts.senderId,
        type: "text",
        content: `${label}${link}`,
      })
    }
  }
}
