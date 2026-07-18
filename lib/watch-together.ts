"use client"

import { createClient } from "@/lib/supabase/client"
import type { RealtimeChannel } from "@supabase/supabase-js"

export type WatchPlaybackState = {
  videoId: string
  playing: boolean
  /** Playback position in seconds at `at` */
  t: number
  /** Client timestamp (ms) when this state was captured */
  at: number
  by: string
}

export type WatchSessionPayload = {
  videoId: string
  hostId: string
  hostName: string
}

export type WatchReactionPayload = {
  id: string
  emoji: string
  by: string
  byName: string
}

type WatchHandlers = {
  onSession?: (payload: WatchSessionPayload) => void
  onSync?: (payload: WatchPlaybackState) => void
  onReaction?: (payload: WatchReactionPayload) => void
  onRequestSync?: (by: string) => void
  onEnded?: (by: string) => void
}

export function subscribeWatchTogether(
  conversationId: string,
  currentUserId: string,
  handlers: WatchHandlers,
): RealtimeChannel {
  const supabase = createClient()
  const channel = supabase.channel(`watch:${conversationId}`, {
    config: {
      private: false,
      broadcast: { self: false },
    },
  })

  channel
    .on("broadcast", { event: "session" }, ({ payload }) => {
      const data = payload as WatchSessionPayload
      if (!data?.videoId || !data.hostId) return
      handlers.onSession?.(data)
    })
    .on("broadcast", { event: "sync" }, ({ payload }) => {
      const data = payload as WatchPlaybackState
      if (!data?.videoId || data.by === currentUserId) return
      handlers.onSync?.(data)
    })
    .on("broadcast", { event: "reaction" }, ({ payload }) => {
      const data = payload as WatchReactionPayload
      if (!data?.emoji || !data.id) return
      handlers.onReaction?.(data)
    })
    .on("broadcast", { event: "request-sync" }, ({ payload }) => {
      const data = payload as { by?: string }
      if (!data?.by || data.by === currentUserId) return
      handlers.onRequestSync?.(data.by)
    })
    .on("broadcast", { event: "ended" }, ({ payload }) => {
      const data = payload as { by?: string }
      if (!data?.by) return
      handlers.onEnded?.(data.by)
    })
    .subscribe()

  return channel
}

/** Resolves when the channel is subscribed (or after a short timeout). */
export function whenWatchChannelReady(channel: RealtimeChannel | null, timeoutMs = 2500): Promise<void> {
  if (!channel) return Promise.resolve()
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      // RealtimeChannel.state: 'joined' when subscribed
      if (channel.state === "joined") {
        resolve()
        return
      }
      if (Date.now() - start >= timeoutMs) {
        resolve()
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

async function send(channel: RealtimeChannel | null, event: string, payload: unknown) {
  if (!channel) return
  await channel.send({ type: "broadcast", event, payload })
}

export async function broadcastWatchSession(
  channel: RealtimeChannel | null,
  payload: WatchSessionPayload,
) {
  await send(channel, "session", payload)
}

export async function broadcastWatchSync(
  channel: RealtimeChannel | null,
  payload: WatchPlaybackState,
) {
  await send(channel, "sync", payload)
}

export async function broadcastWatchReaction(
  channel: RealtimeChannel | null,
  payload: WatchReactionPayload,
) {
  await send(channel, "reaction", payload)
}

export async function broadcastWatchRequestSync(channel: RealtimeChannel | null, by: string) {
  await send(channel, "request-sync", { by })
}

export async function broadcastWatchEnded(channel: RealtimeChannel | null, by: string) {
  await send(channel, "ended", { by })
}

/** Expected media time given a sync snapshot. */
export function expectedWatchTime(state: WatchPlaybackState, now = Date.now()): number {
  if (!state.playing) return Math.max(0, state.t)
  return Math.max(0, state.t + (now - state.at) / 1000)
}
