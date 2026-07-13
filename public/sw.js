/* WhaChat service worker — Web Push for offline recipients */
self.addEventListener("push", (event) => {
  let data = { title: "הודעה חדשה", body: "", conversationId: null, url: "/chat" }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // ignore
  }

  const conversationId = data.conversationId
  const url = conversationId ? `/chat?c=${conversationId}` : data.url || "/chat"

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const focused = clientsList.some((c) => c.focused)
      if (focused) {
        for (const client of clientsList) {
          client.postMessage({ type: "push-message", ...data })
        }
        return
      }

      await self.registration.showNotification(data.title || "הודעה חדשה", {
        body: data.body || "",
        tag: conversationId ? `wa-${conversationId}` : "wa-message",
        data: { url, conversationId },
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

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus()
          client.postMessage({ type: "open-conversation", conversationId: raw.conversationId })
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
