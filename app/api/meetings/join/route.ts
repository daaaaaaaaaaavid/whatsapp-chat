import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimitAsync } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/**
 * Join a meeting by invite token.
 * Groups: may add the user as a participant.
 * DMs: existing members only — never permanently add outsiders.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const limited = await checkRateLimitAsync(`meeting-join:${user.id}`, 40, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    )
  }

  let body: { token?: string }
  try {
    body = (await req.json()) as { token?: string }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const token = typeof body.token === "string" ? body.token.trim() : ""
  if (!token.startsWith("meet_")) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 })
  }

  const admin = createServiceClient()
  if (!admin) {
    return NextResponse.json({ error: "service_role_missing" }, { status: 503 })
  }

  const { data: meeting, error } = await admin
    .from("meeting_sessions")
    .select("id, conversation_id, livekit_room, active, expires_at")
    .eq("invite_token", token)
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
    return NextResponse.json({ error: "lookup_failed", message: error.message }, { status: 500 })
  }

  if (!meeting || !meeting.active || new Date(meeting.expires_at) <= new Date()) {
    return NextResponse.json({ error: "meeting_inactive", message: "הפגישה הסתיימה" }, { status: 410 })
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("id, is_group")
    .eq("id", meeting.conversation_id)
    .maybeSingle()

  if (!conv) {
    return NextResponse.json({ error: "conversation_missing" }, { status: 404 })
  }

  const { data: membership } = await admin
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", meeting.conversation_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (conv.is_group) {
    if (!membership) {
      const { error: partErr } = await admin.from("conversation_participants").upsert(
        {
          conversation_id: meeting.conversation_id,
          user_id: user.id,
          is_admin: false,
        },
        { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
      )
      if (partErr) {
        return NextResponse.json({ error: "join_failed", message: partErr.message }, { status: 500 })
      }
    }
  } else if (!membership) {
    return NextResponse.json(
      {
        error: "members_only",
        message: "הזמנת פגישה בשיחה פרטית מיועדת למשתתפים בלבד",
      },
      { status: 403 },
    )
  }

  // DM block check (service role has no auth.uid for RPC helpers)
  if (!conv.is_group) {
    const { data: peers } = await admin
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", meeting.conversation_id)
    const otherId = (peers ?? []).map((p) => p.user_id).find((id) => id !== user.id)
    if (otherId) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, blocked_user_ids")
        .in("id", [user.id, otherId])
      const me = profiles?.find((p) => p.id === user.id)
      const peer = profiles?.find((p) => p.id === otherId)
      const myBlocked = (me?.blocked_user_ids as string[] | null) ?? []
      const peerBlocked = (peer?.blocked_user_ids as string[] | null) ?? []
      if (myBlocked.includes(otherId) || peerBlocked.includes(user.id)) {
        return NextResponse.json(
          { error: "blocked", message: "לא ניתן להצטרף — אחד הצדדים חסום" },
          { status: 403 },
        )
      }
    }
  }

  return NextResponse.json({
    meetingId: meeting.id,
    conversationId: meeting.conversation_id,
    livekitRoom: meeting.livekit_room,
  })
}
