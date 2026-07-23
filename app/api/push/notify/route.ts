import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { messagePreview } from "@/lib/conversation-display"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { configureVapid, sendWebPushToSubscriptions } from "@/lib/push-send"
import { pushNotifyBodySchema } from "@/lib/validation"
import type { Message } from "@/lib/types"

const OFFLINE_MS = 5 * 60 * 1000

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

  const rate = await checkRateLimitAsync(`push-notify:${user.id}`, 30, 60_000)
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

  const parsed = pushNotifyBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const { conversationId, messageId } = parsed.data

  // Per-message idempotency (best-effort within a single instance)
  const idempotency = await checkRateLimitAsync(`push-msg:${messageId}`, 1, 10 * 60_000)
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

  const { data: msg } = await admin
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .maybeSingle()

  if (!msg) {
    // Avoid leaking whether the message exists
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

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, last_seen, chat_prefs")
    .in("id", recipientIds)

  const now = Date.now()
  const offlineIds = (profiles ?? [])
    .filter((p) => {
      if (!p.last_seen) return true
      return now - new Date(p.last_seen).getTime() > OFFLINE_MS
    })
    .filter((p) => {
      const muted = (p.chat_prefs as { muted?: string[] } | null)?.muted
      if (Array.isArray(muted) && muted.includes(conversationId)) return false
      return true
    })
    .map((p) => p.id as string)

  if (!offlineIds.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: "all_online" })
  }

  let body = messagePreview(msg as Message) || "יש לך הודעה חדשה"
  let title = "הודעה חדשה"

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle()

  const { data: conv } = await admin
    .from("conversations")
    .select("is_group, name")
    .eq("id", conversationId)
    .maybeSingle()

  if (conv?.is_group && conv.name) {
    title = conv.name
    const senderName = sender?.display_name || sender?.email || "מישהו"
    body = `${senderName}: ${body}`
  } else {
    title = sender?.display_name || sender?.email || "הודעה חדשה"
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", offlineIds)

  if (!subs?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscriptions" })
  }

  const pushPayload = JSON.stringify({
    title,
    body,
    conversationId,
    url: `/chat?c=${conversationId}`,
  })

  const sent = await sendWebPushToSubscriptions(admin, subs, pushPayload)
  return NextResponse.json({ ok: true, sent })
}
