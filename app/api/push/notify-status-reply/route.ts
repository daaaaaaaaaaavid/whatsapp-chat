import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { configureVapid, sendWebPushToSubscriptions } from "@/lib/push-send"
import { pushStatusReplyBodySchema } from "@/lib/validation"

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

  const rate = checkRateLimit(`push-status-reply:${user.id}`, 20, 60_000)
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

  const parsed = pushStatusReplyBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const { statusId, replyId } = parsed.data

  const { data: status } = await admin
    .from("statuses")
    .select("id, user_id, expires_at")
    .eq("id", statusId)
    .maybeSingle()

  if (!status) {
    return NextResponse.json({ error: "status_not_found" }, { status: 404 })
  }

  if (status.user_id === user.id) {
    return NextResponse.json({ error: "cannot_notify_self" }, { status: 400 })
  }

  if (new Date(status.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "expired" })
  }

  const { data: visible } = await supabase
    .from("statuses")
    .select("id")
    .eq("id", statusId)
    .maybeSingle()

  if (!visible) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { data: reply } = await admin
    .from("status_replies")
    .select("content, user_id, status_id")
    .eq("id", replyId)
    .eq("status_id", statusId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!reply) {
    return NextResponse.json({ error: "reply_not_found" }, { status: 404 })
  }

  const body = (reply.content as string)?.trim() || "הגיב לסטטוס שלך"
  const ownerId = status.user_id as string

  const { data: owner } = await admin
    .from("profiles")
    .select("id, last_seen")
    .eq("id", ownerId)
    .maybeSingle()

  if (!owner) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_owner" })
  }

  const now = Date.now()
  const isOffline = !owner.last_seen || now - new Date(owner.last_seen).getTime() > OFFLINE_MS
  if (!isOffline) {
    return NextResponse.json({ ok: true, sent: 0, reason: "owner_online" })
  }

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle()

  const title = sender?.display_name || sender?.email || "תגובה לסטטוס"

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", ownerId)

  if (!subs?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscriptions" })
  }

  const pushPayload = JSON.stringify({
    title,
    body,
    url: "/chat?tab=status",
    type: "status-reply",
    statusId,
  })

  const sent = await sendWebPushToSubscriptions(admin, subs, pushPayload)
  return NextResponse.json({ ok: true, sent })
}
