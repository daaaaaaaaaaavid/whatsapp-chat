"use client"

import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

export type MeetingRingPayload = {
  meetingId: string
  conversationId: string
  fromUserId: string
  fromName: string
  fromAvatar: string | null
  /** Group meeting invite (popup) vs 1:1 call ring */
  isGroup?: boolean
  groupName?: string | null
}

export type MeetingRingResponse = {
  meetingId: string
  fromUserId: string
}

function inboxTopic(userId: string) {
  return `meeting-inbox:${userId}`
}

type RingHandlers = {
  onRing?: (payload: MeetingRingPayload) => void
  onAccept?: (payload: MeetingRingResponse) => void
  onReject?: (payload: MeetingRingResponse) => void
  onCancel?: (payload: MeetingRingResponse) => void
}

export function subscribeMeetingInbox(
  userId: string,
  handlers: RingHandlers,
): RealtimeChannel {
  const supabase = createClient()
  const channel = supabase.channel(inboxTopic(userId), {
    config: {
      private: false,
      broadcast: { self: false },
    },
  })

  channel
    .on("broadcast", { event: "ring" }, ({ payload }) => {
      const data = payload as MeetingRingPayload
      if (!data?.meetingId || !data.fromUserId || data.fromUserId === userId) return
      handlers.onRing?.(data)
    })
    .on("broadcast", { event: "accept" }, ({ payload }) => {
      const data = payload as MeetingRingResponse
      if (!data?.meetingId || !data.fromUserId || data.fromUserId === userId) return
      handlers.onAccept?.(data)
    })
    .on("broadcast", { event: "reject" }, ({ payload }) => {
      const data = payload as MeetingRingResponse
      if (!data?.meetingId || !data.fromUserId || data.fromUserId === userId) return
      handlers.onReject?.(data)
    })
    .on("broadcast", { event: "cancel" }, ({ payload }) => {
      const data = payload as MeetingRingResponse
      if (!data?.meetingId || !data.fromUserId || data.fromUserId === userId) return
      handlers.onCancel?.(data)
    })
    .subscribe()

  return channel
}

async function sendToInbox(
  targetUserId: string,
  event: "ring" | "accept" | "reject" | "cancel",
  payload: MeetingRingPayload | MeetingRingResponse,
) {
  const supabase = createClient()
  const channel = supabase.channel(inboxTopic(targetUserId), {
    config: { private: false, broadcast: { self: false } },
  })

  await new Promise<void>((resolve) => {
    const t = window.setTimeout(() => resolve(), 2500)
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(t)
        resolve()
      }
    })
  })

  try {
    await channel.send({ type: "broadcast", event, payload })
  } finally {
    void supabase.removeChannel(channel)
  }
}

export async function sendMeetingRing(payload: MeetingRingPayload, toUserId: string) {
  await sendToInbox(toUserId, "ring", payload)
}

export async function sendMeetingRingAccept(
  payload: MeetingRingResponse,
  toUserId: string,
) {
  await sendToInbox(toUserId, "accept", payload)
}

export async function sendMeetingRingReject(
  payload: MeetingRingResponse,
  toUserId: string,
) {
  await sendToInbox(toUserId, "reject", payload)
}

export async function sendMeetingRingCancel(
  payload: MeetingRingResponse,
  toUserId: string,
) {
  await sendToInbox(toUserId, "cancel", payload)
}
