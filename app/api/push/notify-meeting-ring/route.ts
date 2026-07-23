import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { configureVapid, sendWebPushToSubscriptions } from "@/lib/push-send"
import { pushMeetingRingBodySchema } from "@/lib/validation"

/** Call rings must wake devices even if last_seen looks "online". */
const RING_TTL_SEC = 60

export async function POST(req: Request) {
  const vapid = configureVapid()
  if (!vapid.ok) {
    return NextResponse.json({ ok: false, reason: vapid.reason }, { status: 503 })
  }

  const admin = createServiceClient()
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "service_role_missing" }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const rate = await checkRateLimitAsync(`push-meeting-ring:${user.id}`, 20, 60_000)
  if (!rate.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    )
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = pushMeetingRingBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const { conversationId, meetingId } = parsed.data

  const idempotency = await checkRateLimitAsync(`push-meeting:${meetingId}`, 1, 2 * 60_000)
  if (!idempotency.ok) {
    return NextResponse.json({ ok: true, sent: 0, reason: "already_notified" })
  }

  const { data: membership } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { data: meeting } = await admin
    .from("meeting_sessions")
    .select("id, conversation_id, host_id, active, expires_at")
    .eq("id", meetingId)
    .eq("conversation_id", conversationId)
    .maybeSingle()

  if (!meeting || !meeting.active) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  if (new Date(meeting.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "expired" })
  }
  if (meeting.host_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { data: participants } = await admin
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId)

  const recipientIds = (participants ?? [])
    .map((p) => p.user_id as string)
    .filter((id) => id !== user.id)

  if (!recipientIds.length) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle()

  const { data: conv } = await admin
    .from("conversations")
    .select("is_group, name")
    .eq("id", conversationId)
    .maybeSingle()

  const isGroup = Boolean(conv?.is_group)
  const senderName = sender?.display_name || sender?.email?.split("@")[0] || "משתמש"
  const groupName = conv?.name?.trim() || null

  const title = isGroup ? "פגישה קבוצתית התחילה" : "פגישת וידאו נכנסת"
  const body = isGroup
    ? `${senderName} מתחיל/ה פגישה${groupName ? ` ב${groupName}` : ""}`
    : senderName

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", recipientIds)

  if (!subs?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscriptions" })
  }

  const url = `/chat?c=${conversationId}&meeting=${meetingId}`
  const pushPayload = JSON.stringify({
    title,
    body,
    type: "meeting-ring",
    conversationId,
    meetingId,
    fromUserId: user.id,
    fromName: senderName,
    fromAvatar: sender?.avatar_url ?? null,
    isGroup,
    groupName,
    url,
  })

  const sent = await sendWebPushToSubscriptions(admin, subs, pushPayload, {
    ttl: RING_TTL_SEC,
    urgency: "high",
  })
  return NextResponse.json({ ok: true, sent })
}
