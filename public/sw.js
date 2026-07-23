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
    meetingId: null,
    url: "/chat",
    type: null,
    statusId: null,
    fromUserId: null,
    fromName: null,
    fromAvatar: null,
    isGroup: false,
    groupName: null,
  }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // ignore
  }

  const conversationId = data.conversationId
  const meetingId = data.meetingId
  const isStatusReply = data.type === "status-reply"
  const isMeetingRing = data.type === "meeting-ring"
  const url = isMeetingRing
    ? data.url ||
      (conversationId && meetingId
        ? `/chat?c=${conversationId}&meeting=${meetingId}`
        : "/chat")
    : isStatusReply
      ? data.url || "/chat?tab=status"
      : conversationId
        ? `/chat?c=${conversationId}`
        : data.url || "/chat"

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      const focused = clientsList.some((c) => c.focused)

      // Always wake open tabs with ring payload (Realtime may have missed it).
      if (isMeetingRing) {
        for (const client of clientsList) {
          client.postMessage({
            type: "meeting-ring",
            meetingId,
            conversationId,
            fromUserId: data.fromUserId,
            fromName: data.fromName,
            fromAvatar: data.fromAvatar,
            isGroup: Boolean(data.isGroup),
            groupName: data.groupName,
            url,
          })
        }
        // If a tab is focused, the app shows the in-app ring UI — skip OS banner.
        if (focused && clientsList.length) return
      } else if (focused) {
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
        tag: isMeetingRing
          ? `meeting-${meetingId || "ring"}`
          : isStatusReply
            ? `wa-status-${data.statusId || "reply"}`
            : conversationId
              ? `wa-${conversationId}`
              : "wa-message",
        data: {
          url,
          conversationId,
          meetingId,
          openStatus: isStatusReply,
          type: data.type,
        },
        dir: "rtl",
        lang: "he",
        renotify: true,
        requireInteraction: isMeetingRing,
        vibrate: isMeetingRing ? [200, 100, 200, 100, 200] : undefined,
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const raw = event.notification.data || {}
  const targetUrl = raw.url || "/chat"
  const openStatus = Boolean(raw.openStatus || raw.type === "status-reply")
  const isMeetingRing = raw.type === "meeting-ring"

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus()
          if (isMeetingRing && raw.meetingId) {
            client.postMessage({
              type: "join-meeting",
              meetingId: raw.meetingId,
              conversationId: raw.conversationId,
            })
          } else if (openStatus) {
            client.postMessage({ type: "open-status" })
          } else {
            client.postMessage({
              type: "open-conversation",
              conversationId: raw.conversationId,
            })
          }
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
