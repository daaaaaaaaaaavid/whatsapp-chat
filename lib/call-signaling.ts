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
  | { type: "reject"; callId: string; fromUserId: string; reason?: "busy" | "declined" }
  | { type: "hangup"; callId: string; fromUserId: string }
  | { type: "offer"; callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; callId: string; fromUserId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; callId: string; fromUserId: string; candidate: RTCIceCandidateInit }

/** STUN + public TURN so calls work behind restrictive NAT/firewalls. */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
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
    config: { broadcast: { self: false, ack: true } },
  })

  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    if (payload && typeof payload === "object" && "type" in payload) {
      onSignal(payload as CallSignal)
    }
  })

  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("חיבור לשיחה נכשל")), 12000)
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
  const result = await channel.send({
    type: "broadcast",
    event: "signal",
    payload: signal,
  })
  if (result !== "ok") {
    throw new Error("שליחת אות נכשלה")
  }
}

/** Deliver a signal to a user's inbox channel. Keeps channel briefly so broadcast flushes. */
export async function sendToUser(userId: string, signal: CallSignal) {
  const supabase = createClient()
  const channel = supabase.channel(userCallChannel(userId), {
    config: { broadcast: { self: false, ack: true } },
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("שליחת אות נכשלה")), 10000)
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(t)
          try {
            await sendSignal(channel, signal)
            // Give Realtime a moment to flush before tearing down
            await new Promise((r) => setTimeout(r, 200))
            resolve()
          } catch (e) {
            reject(e)
          }
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(t)
          reject(new Error("שליחת אות נכשלה"))
        }
      })
    })
  } finally {
    await supabase.removeChannel(channel)
  }
}
