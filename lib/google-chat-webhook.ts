/** Google Chat Incoming Webhook helpers (one-way WhaChat → Google Chat). */

const WEBHOOK_PREFIX = "https://chat.googleapis.com/"
const MAX_TEXT_CHARS = 3500

export function isValidGoogleChatWebhookUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false
  const trimmed = url.trim()
  if (trimmed.length < WEBHOOK_PREFIX.length || trimmed.length > 2000) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === "https:" && parsed.hostname === "chat.googleapis.com"
  } catch {
    return false
  }
}

export function truncateGoogleChatText(text: string, max = MAX_TEXT_CHARS): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export type GoogleChatForwardPayloadInput = {
  senderName: string
  spaceName: string
  channelName: string
  preview: string
  openUrl: string
}

/** Plain-text body for Google Chat incoming webhooks. */
export function buildGoogleChatWebhookBody(input: GoogleChatForwardPayloadInput): {
  text: string
} {
  const sender = truncateGoogleChatText(input.senderName || "משתמש", 80)
  const space = truncateGoogleChatText(input.spaceName || "Space", 80)
  const channel = truncateGoogleChatText(input.channelName || "ערוץ", 80)
  const preview = truncateGoogleChatText(input.preview || "(הודעה)", MAX_TEXT_CHARS - 200)
  const openUrl = input.openUrl.trim()

  const text = truncateGoogleChatText(
    `*WhaChat* · ${space} · #${channel}\n*${sender}:*\n${preview}\n${openUrl}`,
  )

  return { text }
}

export async function postGoogleChatWebhook(
  webhookUrl: string,
  body: { text: string },
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!isValidGoogleChatWebhookUrl(webhookUrl)) {
    return { ok: false, status: 0, error: "invalid_webhook_url" }
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return {
        ok: false,
        status: res.status,
        error: detail.slice(0, 200) || `http_${res.status}`,
      }
    }
    return { ok: true, status: res.status }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "fetch_failed",
    }
  }
}
