"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Conversation, Profile } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { convAvatarUrl, convDisplayName } from "@/lib/conversation-display"
import {
  ensureNotificationPermission,
  showIncomingCallNotification,
} from "@/lib/browser-notifications"
import {
  sendMeetingRing,
  sendMeetingRingAccept,
  sendMeetingRingCancel,
  sendMeetingRingReject,
  subscribeMeetingInbox,
  type MeetingRingPayload,
} from "@/lib/meeting-ring"

export type MeetingRingPhase = "idle" | "outgoing" | "incoming"

export type MeetingRingInfo = {
  meetingId: string
  conversationId: string
  peerUserId: string
  peerName: string
  peerAvatar: string | null
  isCaller: boolean
}

const RING_TIMEOUT_MS = 45_000

type Opts = {
  currentUser: Profile
  conversations: Conversation[]
  /** True when already inside an active LiveKit meeting */
  inMeeting: boolean
  onAcceptJoin: (meetingId: string) => Promise<void>
  onCallerRejected?: () => void
}

function peerFromConversation(conv: Conversation, selfId: string) {
  const peer = conv.participants?.find((p) => p.user_id !== selfId)
  return {
    userId: peer?.user_id ?? "",
    name: convDisplayName(conv, selfId),
    avatar: convAvatarUrl(conv, selfId),
  }
}

export function useMeetingRing({
  currentUser,
  conversations,
  inMeeting,
  onAcceptJoin,
  onCallerRejected,
}: Opts) {
  const [phase, setPhase] = useState<MeetingRingPhase>("idle")
  const [ring, setRing] = useState<MeetingRingInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const phaseRef = useRef(phase)
  const ringRef = useRef(ring)
  const conversationsRef = useRef(conversations)
  const inMeetingRef = useRef(inMeeting)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onAcceptJoinRef = useRef(onAcceptJoin)
  const onCallerRejectedRef = useRef(onCallerRejected)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    ringRef.current = ring
  }, [ring])
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])
  useEffect(() => {
    inMeetingRef.current = inMeeting
  }, [inMeeting])
  useEffect(() => {
    onAcceptJoinRef.current = onAcceptJoin
  }, [onAcceptJoin])
  useEffect(() => {
    onCallerRejectedRef.current = onCallerRejected
  }, [onCallerRejected])

  const clearTimeoutSafe = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const clearRing = useCallback(() => {
    clearTimeoutSafe()
    setPhase("idle")
    setRing(null)
  }, [clearTimeoutSafe])

  const scheduleTimeout = useCallback(() => {
    clearTimeoutSafe()
    timeoutRef.current = setTimeout(() => {
      const cur = ringRef.current
      if (!cur) return
      if (phaseRef.current === "outgoing") {
        void sendMeetingRingCancel(
          { meetingId: cur.meetingId, fromUserId: currentUser.id },
          cur.peerUserId,
        )
        setError("אין מענה")
        clearRing()
        onCallerRejectedRef.current?.()
      } else if (phaseRef.current === "incoming") {
        clearRing()
      }
    }, RING_TIMEOUT_MS)
  }, [clearRing, clearTimeoutSafe, currentUser.id])

  /** Host: after creating a DM meeting, ring the peer. */
  const startOutgoingRing = useCallback(
    async (opts: {
      meetingId: string
      conversation: Conversation
    }) => {
      if (opts.conversation.is_group) return
      const peer = peerFromConversation(opts.conversation, currentUser.id)
      if (!peer.userId) return

      const info: MeetingRingInfo = {
        meetingId: opts.meetingId,
        conversationId: opts.conversation.id,
        peerUserId: peer.userId,
        peerName: peer.name,
        peerAvatar: peer.avatar,
        isCaller: true,
      }
      setError(null)
      setRing(info)
      setPhase("outgoing")
      scheduleTimeout()

      await sendMeetingRing(
        {
          meetingId: opts.meetingId,
          conversationId: opts.conversation.id,
          fromUserId: currentUser.id,
          fromName:
            currentUser.display_name?.trim() ||
            currentUser.email?.split("@")[0] ||
            "משתמש",
          fromAvatar: currentUser.avatar_url,
        },
        peer.userId,
      )
    },
    [currentUser, scheduleTimeout],
  )

  const acceptIncoming = useCallback(async () => {
    const cur = ringRef.current
    if (!cur || phaseRef.current !== "incoming") return
    clearTimeoutSafe()
    try {
      await sendMeetingRingAccept(
        { meetingId: cur.meetingId, fromUserId: currentUser.id },
        cur.peerUserId,
      )
      await onAcceptJoinRef.current(cur.meetingId)
      clearRing()
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההצטרפות נכשלה")
      clearRing()
    }
  }, [clearRing, clearTimeoutSafe, currentUser.id])

  const rejectIncoming = useCallback(() => {
    const cur = ringRef.current
    if (!cur || phaseRef.current !== "incoming") return
    void sendMeetingRingReject(
      { meetingId: cur.meetingId, fromUserId: currentUser.id },
      cur.peerUserId,
    )
    clearRing()
  }, [clearRing, currentUser.id])

  const cancelOutgoing = useCallback(() => {
    const cur = ringRef.current
    if (!cur || phaseRef.current !== "outgoing") return
    void sendMeetingRingCancel(
      { meetingId: cur.meetingId, fromUserId: currentUser.id },
      cur.peerUserId,
    )
    clearRing()
  }, [clearRing, currentUser.id])

  /** Host heard accept — stop the outgoing ring chrome (meeting already open). */
  const markPeerJoined = useCallback(() => {
    if (phaseRef.current === "outgoing") clearRing()
  }, [clearRing])

  useEffect(() => {
    const channel = subscribeMeetingInbox(currentUser.id, {
      onRing: (payload: MeetingRingPayload) => {
        if (phaseRef.current !== "idle" || inMeetingRef.current) {
          void sendMeetingRingReject(
            { meetingId: payload.meetingId, fromUserId: currentUser.id },
            payload.fromUserId,
          )
          return
        }
        const conv = conversationsRef.current.find((c) => c.id === payload.conversationId)
        if (!conv || conv.is_group) return
        if (!conv.participants?.some((p) => p.user_id === currentUser.id)) return

        const info: MeetingRingInfo = {
          meetingId: payload.meetingId,
          conversationId: payload.conversationId,
          peerUserId: payload.fromUserId,
          peerName:
            payload.fromName ||
            (conv ? convDisplayName(conv, currentUser.id) : "פגישה נכנסת"),
          peerAvatar:
            payload.fromAvatar ?? (conv ? convAvatarUrl(conv, currentUser.id) : null),
          isCaller: false,
        }
        setError(null)
        setRing(info)
        setPhase("incoming")
        scheduleTimeout()
        void ensureNotificationPermission().then(() => {
          void showIncomingCallNotification({
            title: "פגישת וידאו נכנסת",
            body: info.peerName,
            tag: `meeting-${payload.meetingId}`,
          })
        })
      },
      onAccept: (payload) => {
        const cur = ringRef.current
        if (!cur?.isCaller || cur.meetingId !== payload.meetingId) return
        clearRing()
      },
      onReject: (payload) => {
        const cur = ringRef.current
        if (!cur?.isCaller || cur.meetingId !== payload.meetingId) return
        setError("השיחה נדחתה")
        clearRing()
        onCallerRejectedRef.current?.()
      },
      onCancel: (payload) => {
        const cur = ringRef.current
        if (!cur || cur.isCaller || cur.meetingId !== payload.meetingId) return
        clearRing()
      },
    })

    return () => {
      clearTimeoutSafe()
      void createClient().removeChannel(channel)
    }
  }, [clearRing, clearTimeoutSafe, currentUser.id, scheduleTimeout])

  return {
    phase,
    ring,
    error,
    setError,
    startOutgoingRing,
    acceptIncoming,
    rejectIncoming,
    cancelOutgoing,
    markPeerJoined,
    clearRing,
  }
}
