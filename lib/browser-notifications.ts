/** Ask for notification permission and show a browser notification for an incoming message. */
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

export function showIncomingMessageNotification(opts: {
  title: string
  body: string
  tag?: string
  onClick?: () => void
}) {
  if (typeof window === "undefined" || !("Notification" in window)) return
  if (Notification.permission !== "granted") return
  if (document.visibilityState === "visible") return

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
