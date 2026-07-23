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

function buildStunServers(): RTCIceServer[] {
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ]
}

/** STUN-only fallback. Prefer getIceConfiguration() for TURN. */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: buildStunServers(),
  iceCandidatePoolSize: 8,
}

let iceCache: { config: RTCConfiguration; expiresAtMs: number } | null = null

/**
 * Fetch ICE servers (STUN + short-lived TURN) from the authenticated API.
 * Falls back to public STUN if the endpoint is unavailable.
 */
export async function getIceConfiguration(): Promise<RTCConfiguration> {
  const now = Date.now()
  if (iceCache && iceCache.expiresAtMs > now + 30_000) {
    return iceCache.config
  }

  try {
    const res = await fetch("/api/webrtc/ice", { method: "GET", cache: "no-store" })
    if (!res.ok) return ICE_SERVERS
    const data = (await res.json()) as {
      iceServers?: RTCIceServer[]
      iceCandidatePoolSize?: number
      expiresAt?: number | null
    }
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) {
      return ICE_SERVERS
    }
    const config: RTCConfiguration = {
      iceServers: data.iceServers,
      iceCandidatePoolSize: data.iceCandidatePoolSize ?? 8,
    }
    const expiresAtMs =
      typeof data.expiresAt === "number" && data.expiresAt > 0
        ? data.expiresAt * 1000
        : now + 45 * 60_000
    iceCache = { config, expiresAtMs }
    return config
  } catch {
    return ICE_SERVERS
  }
}

export function userCallChannel(userId: string) {
  return `user-calls:${userId}`
}

export function roomCallChannel(callId: string) {
  return `call-room:${callId}`
}

/**
 * Private Realtime channels for call signaling.
 * Requires migration-fix-realtime-calls.sql (can_use_realtime_topic + call_sessions).
 * createCallSession must succeed before ringing so peer topics authorize.
 */
const channelConfig = {
  private: true,
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

  const { data: me } = await supabase
    .from("profiles")
    .select("blocked_user_ids")
    .eq("id", params.callerId)
    .maybeSingle()
  const { data: peer } = await supabase
    .from("profiles")
    .select("blocked_user_ids")
    .eq("id", params.calleeId)
    .maybeSingle()
  const myBlocked = (me?.blocked_user_ids as string[] | null) ?? []
  const peerBlocked = (peer?.blocked_user_ids as string[] | null) ?? []
  if (myBlocked.includes(params.calleeId) || peerBlocked.includes(params.callerId)) {
    throw new Error("לא ניתן להתקשר — אחד הצדדים חסום")
  }

  const { error } = await supabase.from("call_sessions").insert({
    id: params.callId,
    conversation_id: params.conversationId,
    caller_id: params.callerId,
    callee_id: params.calleeId,
    video: params.video,
  })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("call_sessions") || msg.includes("does not exist")) {
      throw new Error(
        "חסרה טבלת שיחות. הרץ את supabase/migration-fix-realtime-calls.sql ב־Supabase.",
      )
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
