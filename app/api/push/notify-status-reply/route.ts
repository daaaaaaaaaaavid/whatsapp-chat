import { NextResponse } from "next/server"
import webpush from "web-push"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"

const OFFLINE_MS = 5 * 60 * 1000

type Body = {
  statusId?: string
  replyId?: string
  body?: string
}

export async function POST(req: Request) {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim()
  const vapidSubject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@whachat.local"

  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ ok: false, reason: "vapid_not_configured" }, { status: 200 })
  }

  const admin = createServiceClient()
  if (!admin) {
    return NextResponse.json({ ok: false, reason: "service_role_missing" }, { status: 200 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let payload: Body
  try {
    payload = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const statusId = payload.statusId
  if (!statusId) {
    return NextResponse.json({ error: "missing_status" }, { status: 400 })
  }

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

  // Replier must be able to see the status (known contact)
  const { data: visible } = await supabase
    .from("statuses")
    .select("id")
    .eq("id", statusId)
    .maybeSingle()

  if (!visible) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body = payload.body?.trim() || "הגיב לסטטוס שלך"

  if (payload.replyId) {
    const { data: reply } = await admin
      .from("status_replies")
      .select("content, user_id, status_id")
      .eq("id", payload.replyId)
      .maybeSingle()
    if (reply && reply.status_id === statusId && reply.user_id === user.id) {
      body = (reply.content as string)?.trim() || body
    }
  }

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

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const pushPayload = JSON.stringify({
    title,
    body,
    url: "/chat?tab=status",
    type: "status-reply",
    statusId,
  })

  let sent = 0
  const staleEndpoints: string[] = []

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload,
          { TTL: 60 * 60 },
        )
        sent += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    }),
  )

  if (staleEndpoints.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints)
  }

  return NextResponse.json({ ok: true, sent })
}
