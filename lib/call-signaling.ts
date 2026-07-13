import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

export type CallSignal =
  | {
      type: "ring"
      callId: string
      fromUserId: string
      fromName: string
      fromAvatar: string | null
      video: boolean
      conversationId: string
    }
  | { type: "accept"; callId: string; fromUserId: string }
  | { type: "reject"; callId: string; fromUserId: string }
  | { type: "hangup"; callId: string; fromUserId: string }
  | { type: "offer"; callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; callId: string; fromUserId: string; candidate: RTCIceCandidateInit }

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
}

export function userCallChannel(userId: string) {
  return `user-calls:${userId}`
}

export function roomCallChannel(callId: string) {
  return `call-room:${callId}`
}

export async function subscribeChannel(
  name: string,
  onSignal: (signal: CallSignal) => void,
): Promise<RealtimeChannel> {
  const supabase = createClient()
  const channel = supabase.channel(name, {
    config: { broadcast: { self: false } },
  })

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    if (payload && typeof payload === "object" && "type" in payload) {
      onSignal(payload as CallSignal)
    }
  })

  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("חיבור לשיחה נכשל")), 10000)
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(t)
        resolve()
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(t)
        reject(new Error("חיבור לשיחה נכשל"))
      }
    })
  })

  return channel
}

export async function sendSignal(channel: RealtimeChannel, signal: CallSignal) {
  await channel.send({
    type: "broadcast",
    event: "signal",
    payload: signal,
  })
}

export async function sendToUser(userId: string, signal: CallSignal) {
  const supabase = createClient()
  const channel = supabase.channel(userCallChannel(userId), {
    config: { broadcast: { self: false } },
  })

  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("שליחת אות נכשלה")), 8000)
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(t)
        try {
          await sendSignal(channel, signal)
          resolve()
        } catch (e) {
          reject(e)
        } finally {
          supabase.removeChannel(channel)
        }
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        window.clearTimeout(t)
        supabase.removeChannel(channel)
        reject(new Error("שליחת אות נכשלה"))
      }
    })
  })
}
