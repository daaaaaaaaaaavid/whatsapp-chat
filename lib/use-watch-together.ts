"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import {
  broadcastWatchEnded,
  broadcastWatchReaction,
  broadcastWatchRequestSync,
  broadcastWatchSession,
  broadcastWatchSync,
  subscribeWatchTogether,
  whenWatchChannelReady,
  type WatchPlaybackState,
  type WatchReactionPayload,
  type WatchSessionPayload,
} from "@/lib/watch-together"
import { insertWatchSystemMessage } from "@/lib/watch-system-message"
import { isWatchSessionClosed, markWatchSessionClosed } from "@/lib/watch-closed"

export type ActiveWatch = {
  conversationId: string
  videoId: string
  hostName: string
  /** True if this client started the session */
  isHost: boolean
}

type FloatingReaction = WatchReactionPayload & { createdAt: number }

type Options = {
  currentUserId: string
  currentUserName: string
}

export function useWatchTogether({ currentUserId, currentUserName }: Options) {
  const [active, setActive] = useState<ActiveWatch | null>(null)
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const getPlaybackRef = useRef<(() => WatchPlaybackState | null) | null>(null)
  const applySyncRef = useRef<((state: WatchPlaybackState) => void) | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

  const detachChannel = useCallback(() => {
    if (channelRef.current) {
      void channelRef.current.unsubscribe()
      channelRef.current = null
    }
  }, [])

  const attachChannel = useCallback(
    (conversationId: string) => {
      if (channelRef.current) {
        void channelRef.current.unsubscribe()
      }
      channelRef.current = subscribeWatchTogether(conversationId, currentUserId, {
        onSession: (payload) => {
          // Another peer started — if we're idle in that chat UI they join via message;
          // if somehow we hear it while open elsewhere, ignore.
          void payload
        },
        onSync: (state) => {
          if (activeRef.current?.conversationId !== conversationId) return
          if (activeRef.current.videoId !== state.videoId) {
            setActive((prev) => (prev ? { ...prev, videoId: state.videoId } : prev))
          }
          applySyncRef.current?.(state)
        },
        onReaction: (payload) => {
          if (activeRef.current?.conversationId !== conversationId) return
          setFloatingReactions((prev) => [...prev.slice(-20), { ...payload, createdAt: Date.now() }])
        },
        onRequestSync: () => {
          if (activeRef.current?.conversationId !== conversationId) return
          const state = getPlaybackRef.current?.()
          if (state) void broadcastWatchSync(channelRef.current, state)
        },
        onEnded: ({ videoId }) => {
          markWatchSessionClosed(conversationId, videoId)
          if (activeRef.current?.conversationId !== conversationId) return
          setActive(null)
          detachChannel()
        },
      })
    },
    [currentUserId, detachChannel],
  )

  useEffect(() => {
    return () => detachChannel()
  }, [detachChannel])

  // Prune floating reactions
  useEffect(() => {
    if (!floatingReactions.length) return
    const t = window.setInterval(() => {
      const cutoff = Date.now() - 2800
      setFloatingReactions((prev) => prev.filter((r) => r.createdAt >= cutoff))
    }, 400)
    return () => window.clearInterval(t)
  }, [floatingReactions.length])

  const startWatch = useCallback(
    async (opts: { conversationId: string; videoId: string; title?: string }) => {
      const session: ActiveWatch = {
        conversationId: opts.conversationId,
        videoId: opts.videoId,
        hostName: currentUserName,
        isHost: true,
      }
      setActive(session)
      attachChannel(opts.conversationId)
      await whenWatchChannelReady(channelRef.current)

      const payload: WatchSessionPayload = {
        videoId: opts.videoId,
        hostId: currentUserId,
        hostName: currentUserName,
      }
      void broadcastWatchSession(channelRef.current, payload)
      void broadcastWatchSync(channelRef.current, {
        videoId: opts.videoId,
        playing: true,
        t: 0,
        at: Date.now(),
        by: currentUserId,
      })

      await insertWatchSystemMessage({
        conversationId: opts.conversationId,
        senderId: currentUserId,
        event: "started",
        videoId: opts.videoId,
        title: opts.title,
      })
    },
    [attachChannel, currentUserId, currentUserName],
  )

  const joinWatch = useCallback(
    async (opts: { conversationId: string; videoId: string; hostName?: string }) => {
      if (isWatchSessionClosed(opts.conversationId, opts.videoId)) {
        window.alert("הצפייה בסרטון הזה כבר הסתיימה")
        return false
      }
      setActive({
        conversationId: opts.conversationId,
        videoId: opts.videoId,
        hostName: opts.hostName ?? "משתמש",
        isHost: false,
      })
      attachChannel(opts.conversationId)
      await whenWatchChannelReady(channelRef.current)
      void broadcastWatchRequestSync(channelRef.current, currentUserId)
      return true
    },
    [attachChannel, currentUserId],
  )

  const endWatch = useCallback(async () => {
    const cur = activeRef.current
    if (!cur) return
    markWatchSessionClosed(cur.conversationId, cur.videoId)
    void broadcastWatchEnded(channelRef.current, {
      by: currentUserId,
      videoId: cur.videoId,
    })
    await insertWatchSystemMessage({
      conversationId: cur.conversationId,
      senderId: currentUserId,
      event: "ended",
      videoId: cur.videoId,
    })
    setActive(null)
    detachChannel()
  }, [currentUserId, detachChannel])

  const leaveWatch = useCallback(() => {
    setActive(null)
    detachChannel()
  }, [detachChannel])

  const sendReaction = useCallback(
    (emoji: string) => {
      const payload: WatchReactionPayload = {
        id: crypto.randomUUID(),
        emoji,
        by: currentUserId,
        byName: currentUserName,
      }
      setFloatingReactions((prev) => [...prev.slice(-20), { ...payload, createdAt: Date.now() }])
      void broadcastWatchReaction(channelRef.current, payload)
    },
    [currentUserId, currentUserName],
  )

  const publishSync = useCallback((state: Omit<WatchPlaybackState, "by">) => {
    void broadcastWatchSync(channelRef.current, { ...state, by: currentUserId })
  }, [currentUserId])

  const registerPlayerBridge = useCallback(
    (bridge: {
      getPlayback: () => WatchPlaybackState | null
      applySync: (state: WatchPlaybackState) => void
    } | null) => {
      getPlaybackRef.current = bridge?.getPlayback ?? null
      applySyncRef.current = bridge?.applySync ?? null
    },
    [],
  )

  return {
    active,
    floatingReactions,
    startWatch,
    joinWatch,
    endWatch,
    leaveWatch,
    sendReaction,
    publishSync,
    registerPlayerBridge,
  }
}
