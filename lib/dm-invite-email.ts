import { APP_NAME, getSiteUrl } from "@/lib/site-config"

export type DmInviteEmailInput = {
  inviterName: string
  inviteeEmail: string
  inviteUrl: string
}

export function buildDmInviteEmail(input: DmInviteEmailInput): {
  subject: string
  text: string
  html: string
} {
  const name = input.inviterName.trim() || "מישהו"
  const subject = `${name} הזמין אותך לשיחה ב-${APP_NAME}`
  const text =
    `${name} הזמין אותך לשיחה ב-${APP_NAME}.\n\n` +
    `לכניסה והצטרפות לשיחה לחץ כאן:\n${input.inviteUrl}\n\n` +
    `הקישור תקף ל־7 ימים.`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8" /></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f0f2f5;margin:0;padding:24px;color:#111b21;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 24px;">
    <p style="margin:0 0 8px;font-size:13px;color:#667781;">${APP_NAME}</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.4;">
      ${escapeHtml(name)} הזמין אותך לשיחה
    </h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3b4a54;">
      נפתחה עבורך הזמנה לשיחה ב-${APP_NAME}. לכניסה והצטרפות לשיחה לחץ על הכפתור למטה.
    </p>
    <p style="margin:0 0 28px;text-align:center;">
      <a href="${escapeHtml(input.inviteUrl)}"
         style="display:inline-block;background:#00a884;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px;">
        לכניסה לחץ כאן
      </a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#8696a0;">
      אם הכפתור לא עובד, העתק את הקישור:<br />
      <a href="${escapeHtml(input.inviteUrl)}" style="color:#008069;word-break:break-all;">${escapeHtml(input.inviteUrl)}</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#8696a0;">הקישור תקף ל־7 ימים.</p>
  </div>
</body>
</html>`

  return { subject, text, html }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Optional Resend (free tier). Returns true if sent. */
export async function sendDmInviteViaResend(input: DmInviteEmailInput): Promise<{
  sent: boolean
  error?: string
}> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return { sent: false }

  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    `${APP_NAME} <onboarding@resend.dev>`

  const { subject, text, html } = buildDmInviteEmail(input)

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.inviteeEmail],
        subject,
        text,
        html,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return { sent: false, error: detail.slice(0, 200) || `http_${res.status}` }
    }
    return { sent: true }
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "resend_failed",
    }
  }
}

export function dmInviteRedirectTo(token: string): string {
  const site = getSiteUrl()
  const next = encodeURIComponent(`/invite/${token}`)
  return `${site}/auth/callback?next=${next}`
}

export function dmInvitePageUrl(token: string): string {
  return `${getSiteUrl()}/invite/${token}`
}
