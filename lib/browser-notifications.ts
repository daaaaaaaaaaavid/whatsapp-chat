/** Ask for notification permission and show browser / OS notifications. */

export async function ensureNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

async function showViaServiceWorker(opts: {
  title: string
  body: string
  tag?: string
  conversationId?: string
  requireInteraction?: boolean
}): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(opts.title, {
      body: opts.body,
      tag: opts.tag ?? "wa-message",
      silent: true,
      dir: "rtl",
      lang: "he",
      requireInteraction: opts.requireInteraction ?? false,
      data: {
        url: opts.conversationId ? `/chat?c=${opts.conversationId}` : "/chat",
        conversationId: opts.conversationId ?? null,
      },
    } as NotificationOptions)
    return true
  } catch {
    return false
  }
}

export async function showIncomingMessageNotification(opts: {
  title: string
  body: string
  tag?: string
  conversationId?: string
  onClick?: () => void
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return

  // Prefer Service Worker (required on many mobile browsers)
  const viaSw = await showViaServiceWorker({
    title: opts.title,
    body: opts.body,
    tag: opts.tag ?? opts.conversationId ?? "wa-message",
    conversationId: opts.conversationId ?? opts.tag,
  })
  if (viaSw) return

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag ?? "wa-message",
      silent: true,
    })
    n.onclick = () => {
      window.focus()
      opts.onClick?.()
      n.close()
    }
  } catch {
    // ignore
  }
}

/** Incoming call alert — shown even when the tab is visible (ringtone may be blocked). */
export async function showIncomingCallNotification(opts: {
  title: string
  body: string
  tag?: string
  onClick?: () => void
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return

  const viaSw = await showViaServiceWorker({
    title: opts.title,
    body: opts.body,
    tag: opts.tag ?? "wa-call",
    requireInteraction: true,
  })
  if (viaSw) return

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag ?? "wa-call",
      requireInteraction: true,
      silent: false,
    })
    n.onclick = () => {
      window.focus()
      opts.onClick?.()
      n.close()
    }
  } catch {
    // ignore
  }
}
