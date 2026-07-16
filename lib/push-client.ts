import { createClient } from "@/lib/supabase/client"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || ""
}

/** Register SW early so OS notifications work (even before push subscribe). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready
    return reg
  } catch {
    return null
  }
}

export async function registerPushSubscription(): Promise<boolean> {
  if (typeof window === "undefined") return false
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false

  const vapidKey = getVapidPublicKey()
  if (!vapidKey) {
    await ensureServiceWorker()
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") return false

    const reg = (await ensureServiceWorker()) ?? (await navigator.serviceWorker.ready)

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }

    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return false

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    )

    return !error
  } catch {
    return false
  }
}

/** Fire-and-forget: notify offline participants about a new message. */
export function notifyOfflineRecipients(opts: {
  conversationId: string
  messageId: string
}) {
  void fetch("/api/push/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: opts.conversationId,
      messageId: opts.messageId,
    }),
  }).catch((err) => {
    console.error("notifyOfflineRecipients failed:", err)
  })
}

/** Fire-and-forget: forward a Space channel message to Google Chat webhook (if configured). */
export function notifyGoogleChat(opts: {
  conversationId: string
  messageId: string
}) {
  void fetch("/api/google-chat/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: opts.conversationId,
      messageId: opts.messageId,
    }),
  }).catch((err) => {
    console.error("notifyGoogleChat failed:", err)
  })
}

/** Fire-and-forget: notify the status owner about a new reply. */
export function notifyStatusOwner(opts: {
  statusId: string
  replyId: string
}) {
  void fetch("/api/push/notify-status-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      statusId: opts.statusId,
      replyId: opts.replyId,
    }),
  }).catch((err) => {
    console.error("notifyStatusOwner failed:", err)
  })
}
