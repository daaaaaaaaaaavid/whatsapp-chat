import { NextResponse } from "next/server"
import webpush from "web-push"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { messagePreview } from "@/lib/conversation-display"
import type { Message } from "@/lib/types"

const OFFLINE_MS = 5 * 60 * 1000

type Body = {
  conversationId?: string
  messageId?: string
  title?: string
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

  const conversationId = payload.conversationId
  if (!conversationId) {
    return NextResponse.json({ error: "missing_conversation" }, { status: 400 })
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

  let title = payload.title?.trim() || "הודעה חדשה"
  let body = payload.body?.trim() || "יש לך הודעה חדשה"

  if (payload.messageId) {
    const { data: msg } = await admin
      .from("messages")
      .select("*")
      .eq("id", payload.messageId)
      .maybeSingle()
    if (msg) {
      body = messagePreview(msg as Message) || body
    }
  }

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
  } else if (!payload.title) {
    title = sender?.display_name || sender?.email || "הודעה חדשה"
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", offlineIds)

  if (!subs?.length) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no_subscriptions" })
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const pushPayload = JSON.stringify({
    title,
    body,
    conversationId,
    url: `/chat?c=${conversationId}`,
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
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
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
