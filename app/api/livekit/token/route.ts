import { NextResponse } from "next/server"
import { AccessToken } from "livekit-server-sdk"
import { createClient } from "@/lib/supabase/server"
import { checkRateLimitAsync } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

type TokenBody = {
  meetingId?: string
}

export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json(
      {
        error: "livekit_not_configured",
        message:
          "חסרים מפתחות LiveKit. צור פרויקט ב־https://cloud.livekit.io והגדר LIVEKIT_API_KEY, LIVEKIT_API_SECRET, NEXT_PUBLIC_LIVEKIT_URL",
      },
      { status: 503 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = await checkRateLimitAsync(`livekit-token:${user.id}`, 60, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  let body: TokenBody
  try {
    body = (await req.json()) as TokenBody
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const meetingId = typeof body.meetingId === "string" ? body.meetingId.trim() : ""
  if (!meetingId) {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 })
  }

  const { data: meeting, error } = await supabase
    .from("meeting_sessions")
    .select("id, conversation_id, livekit_room, active, expires_at, host_id")
    .eq("id", meetingId)
    .maybeSingle()

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("meeting_sessions") || msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error: "migration_required",
          message: "הרץ את supabase/migration-meeting-sessions.sql",
        },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
  }

  if (!meeting || !meeting.active || new Date(meeting.expires_at) <= new Date()) {
    return NextResponse.json({ error: "meeting_inactive" }, { status: 410 })
  }

  const { data: blocked, error: blockErr } = await supabase.rpc("dm_messaging_blocked", {
    p_conversation_id: meeting.conversation_id,
  })
  if (!blockErr && blocked === true) {
    return NextResponse.json(
      { error: "blocked", message: "לא ניתן להצטרף — אחד הצדדים חסום" },
      { status: 403 },
    )
  }

  const { data: membership } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", meeting.conversation_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle()

  const displayName =
    profile?.display_name?.trim() ||
    profile?.email ||
    user.email ||
    "משתמש"

  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: displayName,
    ttl: "2h",
  })
  at.addGrant({
    roomJoin: true,
    room: meeting.livekit_room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()

  return NextResponse.json({
    token,
    serverUrl: livekitUrl,
    roomName: meeting.livekit_room,
    meetingId: meeting.id,
    isHost: meeting.host_id === user.id,
  })
}
