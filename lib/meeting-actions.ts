import { createClient } from "@/lib/supabase/client"
import type { MeetingSession } from "@/lib/types"
import { makeMeetingInviteToken, meetingInvitePageUrl } from "@/lib/meeting-invite"
import { insertMeetingSystemMessage } from "@/lib/meeting-system-message"

function migrationHint(err: { message?: string } | null): Error {
  const msg = (err?.message ?? "").toLowerCase()
  if (msg.includes("meeting_sessions") || msg.includes("does not exist")) {
    return new Error("יש להריץ את supabase/migration-meeting-sessions.sql ב-Supabase")
  }
  return new Error(err?.message || "שגיאה בפגישה")
}

export async function createMeeting(opts: {
  conversationId: string
  hostId: string
}): Promise<MeetingSession> {
  const supabase = createClient()

  // Reuse active meeting in this conversation if still valid
  const { data: existing } = await supabase
    .from("meeting_sessions")
    .select("*")
    .eq("conversation_id", opts.conversationId)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return existing as MeetingSession
  }

  const id = crypto.randomUUID()
  const inviteToken = makeMeetingInviteToken()
  const livekitRoom = `whachat-${opts.conversationId.slice(0, 8)}-${id.slice(0, 8)}`

  const { data, error } = await supabase
    .from("meeting_sessions")
    .insert({
      id,
      conversation_id: opts.conversationId,
      host_id: opts.hostId,
      livekit_room: livekitRoom,
      invite_token: inviteToken,
      active: true,
    })
    .select("*")
    .single()

  if (error || !data) {
    throw migrationHint(error)
  }

  const meeting = data as MeetingSession
  await insertMeetingSystemMessage({
    conversationId: opts.conversationId,
    senderId: opts.hostId,
    event: "started",
    meetingId: meeting.id,
    inviteToken: meeting.invite_token,
  })

  return meeting
}

export async function endMeeting(opts: {
  meetingId: string
  userId: string
}): Promise<void> {
  const supabase = createClient()
  const { data: meeting, error: fetchErr } = await supabase
    .from("meeting_sessions")
    .select("*")
    .eq("id", opts.meetingId)
    .maybeSingle()

  if (fetchErr) throw migrationHint(fetchErr)
  if (!meeting || !meeting.active) return

  const { error } = await supabase
    .from("meeting_sessions")
    .update({
      active: false,
      ended_at: new Date().toISOString(),
    })
    .eq("id", opts.meetingId)
    .eq("active", true)

  if (error) throw migrationHint(error)

  await insertMeetingSystemMessage({
    conversationId: meeting.conversation_id,
    senderId: opts.userId,
    event: "ended",
    meetingId: meeting.id,
    inviteToken: meeting.invite_token,
  })
}

export async function getMeetingById(meetingId: string): Promise<MeetingSession | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("meeting_sessions")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle()
  if (error) throw migrationHint(error)
  return (data as MeetingSession | null) ?? null
}

export async function getActiveMeeting(
  conversationId: string,
): Promise<MeetingSession | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("meeting_sessions")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw migrationHint(error)
  return (data as MeetingSession | null) ?? null
}

export async function joinMeetingByInvite(token: string): Promise<{
  meetingId: string
  conversationId: string
  livekitRoom: string
}> {
  const trimmed = token.trim()

  // Prefer HTTP join (avoids ambiguous conversation_id in older RPC).
  const res = await fetch("/api/meetings/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: trimmed }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    meetingId?: string
    conversationId?: string
    livekitRoom?: string
    message?: string
    error?: string
  }
  if (res.ok && data.meetingId && data.conversationId) {
    return {
      meetingId: data.meetingId,
      conversationId: data.conversationId,
      livekitRoom: data.livekitRoom ?? "",
    }
  }

  // Fallback to RPC if API unavailable
  const supabase = createClient()
  const { data: rpcData, error } = await supabase.rpc("join_meeting_by_invite", {
    p_token: trimmed,
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("join_meeting_by_invite") || msg.includes("does not exist")) {
      throw new Error("יש להריץ את supabase/migration-meeting-sessions.sql ב-Supabase")
    }
    throw new Error(data.message || error.message || "ההצטרפות לפגישה נכשלה")
  }
  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
  if (!row?.meeting_id || !row?.conversation_id) {
    throw new Error(data.message || "ההצטרפות לפגישה נכשלה")
  }
  return {
    meetingId: row.meeting_id as string,
    conversationId: row.conversation_id as string,
    livekitRoom: (row.livekit_room as string) ?? "",
  }
}

export function meetingInviteUrl(token: string): string {
  return meetingInvitePageUrl(token)
}
