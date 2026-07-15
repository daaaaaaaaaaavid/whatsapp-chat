import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

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

function buildIceServers(): RTCIceServer[] {
  // Public STUN only — static TURN credentials must never ship in the browser.
  // Configure short-lived TURN via a future authenticated server endpoint if needed.
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ]
}

/** STUN servers (TURN credentials are not embedded client-side). */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: buildIceServers(),
  iceCandidatePoolSize: 8,
}

export function userCallChannel(userId: string) {
  return `user-calls:${userId}`
}

export function roomCallChannel(callId: string) {
  return `call-room:${callId}`
}

/**
 * Use public Realtime channels for signaling.
 * Private channels require working realtime.messages RLS for *every* client;
 * a mixed private/public pair drops signals. Topics include UUIDs (hard to guess).
 * call_sessions still gates who may start a call in the app layer.
 */
const channelConfig = {
  private: false,
  broadcast: { self: false, ack: true },
} as const

async function ensureRealtimeAuth(supabase: SupabaseClient): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.access_token) {
    await supabase.realtime.setAuth(session.access_token)
  }
}

export async function createCallSession(params: {
  callId: string
  conversationId: string
  callerId: string
  calleeId: string
  video: boolean
}): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from("call_sessions").insert({
    id: params.callId,
    conversation_id: params.conversationId,
    caller_id: params.callerId,
    callee_id: params.calleeId,
    video: params.video,
  })
  if (error) {
    const msg = error.message.toLowerCase()
    // Soft-fail: older DBs without the table can still signal over Realtime.
    if (msg.includes("call_sessions") || msg.includes("does not exist")) {
      console.warn("[calls] call_sessions missing — signaling continues without session row")
      return
    }
    throw new Error(error.message || "יצירת שיחה נכשלה")
  }
}

export async function endCallSession(callId: string): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from("call_sessions").delete().eq("id", callId)
  } catch {
    // best-effort
  }
}

export async function subscribeChannel(
  name: string,
  onSignal: (signal: CallSignal) => void,
): Promise<RealtimeChannel> {
  const supabase = createClient()
  await ensureRealtimeAuth(supabase)

  const channel = supabase.channel(name, {
    config: { ...channelConfig },
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
  await ensureRealtimeAuth(supabase)

  const channel = supabase.channel(userCallChannel(userId), {
    config: { ...channelConfig },
  })

  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("שליחת אות נכשלה")), 12000)
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(t)
          try {
            await sendSignal(channel, signal)
            await new Promise((r) => setTimeout(r, 450))
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
