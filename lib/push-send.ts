import webpush from "web-push"
import type { SupabaseClient } from "@supabase/supabase-js"

export type PushSubscriptionRow = {
  endpoint: string
  p256dh: string
  auth: string
}

export function configureVapid():
  | { ok: true; publicKey: string; privateKey: string; subject: string }
  | { ok: false; reason: string } {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@whachat.local"
  if (!publicKey || !privateKey) {
    return { ok: false, reason: "vapid_not_configured" }
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return { ok: true, publicKey, privateKey, subject }
}

export async function sendWebPushToSubscriptions(
  admin: SupabaseClient,
  subs: PushSubscriptionRow[],
  payload: string,
): Promise<number> {
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
          payload,
          { TTL: 60 * 60 },
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          staleEndpoints.push(sub.endpoint)
        } else {
          console.error("web-push send failed:", status ?? (err as Error)?.message)
        }
      }
    }),
  )

  if (staleEndpoints.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints)
  }

  return sent
}
