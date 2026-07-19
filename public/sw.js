/* WhaChat service worker — Web Push + minimal fetch for PWA installability */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

/** Required by Chromium for installable PWA (controls the page). */
self.addEventListener("fetch", (event) => {
  // Network-only passthrough — keep push SW lightweight, no offline cache yet.
  event.respondWith(fetch(event.request))
})

self.addEventListener("push", (event) => {
  let data = {
    title: "הודעה חדשה",
    body: "",
    conversationId: null,
    url: "/chat",
    type: null,
    statusId: null,
  }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // ignore
  }

  const conversationId = data.conversationId
  const isStatusReply = data.type === "status-reply"
  const url = isStatusReply
    ? data.url || "/chat?tab=status"
    : conversationId
      ? `/chat?c=${conversationId}`
      : data.url || "/chat"

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const focused = clientsList.some((c) => c.focused)
      if (focused) {
        for (const client of clientsList) {
          client.postMessage({
            type: "push-message",
            ...data,
            url,
            openStatus: isStatusReply,
          })
        }
        return
      }

      await self.registration.showNotification(data.title || "הודעה חדשה", {
        body: data.body || "",
        tag: isStatusReply
          ? `wa-status-${data.statusId || "reply"}`
          : conversationId
            ? `wa-${conversationId}`
            : "wa-message",
        data: { url, conversationId, openStatus: isStatusReply, type: data.type },
        dir: "rtl",
        lang: "he",
        renotify: true,
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const raw = event.notification.data || {}
  const targetUrl = raw.url || "/chat"
  const openStatus = Boolean(raw.openStatus || raw.type === "status-reply")

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus()
          if (openStatus) {
            client.postMessage({ type: "open-status" })
          } else {
            client.postMessage({ type: "open-conversation", conversationId: raw.conversationId })
          }
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
