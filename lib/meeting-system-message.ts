import { createClient } from "@/lib/supabase/client"
import type { MeetingSystemPayload } from "@/lib/types"

export function parseMeetingSystemPayload(
  content: string | null | undefined,
): MeetingSystemPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as MeetingSystemPayload
    if (
      parsed?.kind === "meeting" &&
      (parsed.event === "started" || parsed.event === "ended") &&
      parsed.meetingId
    ) {
      return parsed
    }
  } catch {
    // not JSON
  }
  return null
}

export function meetingSystemLabel(
  payload: MeetingSystemPayload,
  opts?: { isGroup?: boolean },
): string {
  const isGroup = opts?.isGroup !== false
  switch (payload.event) {
    case "started":
      return isGroup ? "התחילה פגישה קבוצתית" : "שיחת וידאו · פגישה משותפת"
    case "ended":
      return isGroup ? "הפגישה הסתיימה" : "שיחת הווידאו הסתיימה"
    default:
      return "פגישה"
  }
}

export async function insertMeetingSystemMessage(opts: {
  conversationId: string
  senderId: string
  event: MeetingSystemPayload["event"]
  meetingId: string
  isGroup?: boolean
}): Promise<string | null> {
  // Do not embed inviteToken — any chat member could extract a live invite.
  const payload: MeetingSystemPayload = {
    kind: "meeting",
    event: opts.event,
    meetingId: opts.meetingId,
  }

  const label = meetingSystemLabel(payload, { isGroup: opts.isGroup })
  const supabase = createClient()
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      type: "system",
      content: JSON.stringify(payload),
    })
    .select("id")
    .single()

  if (!error && data?.id) return data.id as string

  const { data: data2, error: err2 } = await supabase
    .from("messages")
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      type: "text",
      content: JSON.stringify(payload),
    })
    .select("id")
    .single()

  if (!err2 && data2?.id) return data2.id as string

  await supabase.from("messages").insert({
    conversation_id: opts.conversationId,
    sender_id: opts.senderId,
    type: "text",
    content: label,
  })
  return null
}
