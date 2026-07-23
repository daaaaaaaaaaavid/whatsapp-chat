import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/admin"
import { messagePreview } from "@/lib/conversation-display"
import { checkRateLimitAsync } from "@/lib/rate-limit"
import { pushNotifyBodySchema } from "@/lib/validation"
import { getSiteUrl } from "@/lib/site-config"
import {
  buildGoogleChatWebhookBody,
  isValidGoogleChatWebhookUrl,
  postGoogleChatWebhook,
} from "@/lib/google-chat-webhook"
import type { Message } from "@/lib/types"

export async function POST(req: Request) {
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

  const rate = await checkRateLimitAsync(`gchat-notify:${user.id}`, 40, 60_000)
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

  const idempotency = await checkRateLimitAsync(`gchat-msg:${messageId}`, 1, 10 * 60_000)
  if (!idempotency.ok) {
    return NextResponse.json({ ok: true, sent: false, reason: "already_notified" })
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
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const message = msg as Message
  if (message.type === "system") {
    return NextResponse.json({ ok: true, sent: false, reason: "system_skipped" })
  }

  const { data: conv } = await admin
    .from("conversations")
    .select("id, name, work_space_id, is_group")
    .eq("id", conversationId)
    .maybeSingle()

  if (!conv?.work_space_id || !conv.is_group) {
    return NextResponse.json({ ok: true, sent: false, reason: "not_a_space_channel" })
  }

  const { data: space } = await admin
    .from("work_spaces")
    .select("id, name, google_chat_forward_enabled")
    .eq("id", conv.work_space_id)
    .maybeSingle()

  if (!space?.google_chat_forward_enabled) {
    return NextResponse.json({ ok: true, sent: false, reason: "forward_disabled" })
  }

  const { data: hook } = await admin
    .from("work_space_webhooks")
    .select("webhook_url")
    .eq("space_id", conv.work_space_id)
    .maybeSingle()

  // Fallback to legacy column if security migration not applied yet
  let webhookUrl = hook?.webhook_url as string | undefined
  if (!webhookUrl) {
    const { data: legacy } = await admin
      .from("work_spaces")
      .select("google_chat_webhook_url")
      .eq("id", conv.work_space_id)
      .maybeSingle()
    webhookUrl = legacy?.google_chat_webhook_url ?? undefined
  }

  if (!webhookUrl) {
    return NextResponse.json({ ok: true, sent: false, reason: "forward_disabled" })
  }

  if (!isValidGoogleChatWebhookUrl(webhookUrl)) {
    return NextResponse.json({ ok: true, sent: false, reason: "invalid_webhook" })
  }

  const { data: sender } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .maybeSingle()

  const senderName = sender?.display_name || sender?.email || "משתמש"
  const openUrl = `${getSiteUrl()}/chat?c=${conversationId}`
  const body = buildGoogleChatWebhookBody({
    senderName,
    spaceName: space.name || "Space",
    channelName: conv.name || "ערוץ",
    preview: messagePreview(message),
    openUrl,
  })

  const result = await postGoogleChatWebhook(webhookUrl, body)
  if (!result.ok) {
    // Best-effort: do not fail the user's send path; log server-side only
    console.error("google-chat webhook failed", result.status, result.error)
    return NextResponse.json({ ok: true, sent: false, reason: "webhook_failed" })
  }

  return NextResponse.json({ ok: true, sent: true })
}
