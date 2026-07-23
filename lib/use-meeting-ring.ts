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
  isGroup: boolean
  groupName: string | null
}

const DM_RING_TIMEOUT_MS = 45_000
const GROUP_INVITE_TIMEOUT_MS = 90_000

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

function memberIds(conv: Conversation, selfId: string): string[] {
  return (conv.participants ?? [])
    .map((p) => p.user_id)
    .filter((id) => id && id !== selfId)
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

  const scheduleTimeout = useCallback(
    (ms: number) => {
      clearTimeoutSafe()
      timeoutRef.current = setTimeout(() => {
        const cur = ringRef.current
        if (!cur) return
        if (phaseRef.current === "outgoing" && !cur.isGroup) {
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
      }, ms)
    },
    [clearRing, clearTimeoutSafe, currentUser.id],
  )

  const buildRingPayload = useCallback(
    (opts: {
      meetingId: string
      conversation: Conversation
      isGroup: boolean
    }): MeetingRingPayload => ({
      meetingId: opts.meetingId,
      conversationId: opts.conversation.id,
      fromUserId: currentUser.id,
      fromName:
        currentUser.display_name?.trim() ||
        currentUser.email?.split("@")[0] ||
        "משתמש",
      fromAvatar: currentUser.avatar_url,
      isGroup: opts.isGroup,
      groupName: opts.isGroup
        ? opts.conversation.name?.trim() || convDisplayName(opts.conversation, currentUser.id)
        : null,
    }),
    [currentUser],
  )

  /** Host: after creating a meeting, ring DM peer or notify all group members. */
  const startOutgoingRing = useCallback(
    async (opts: {
      meetingId: string
      conversation: Conversation
    }) => {
      const isGroup = opts.conversation.is_group
      const payload = buildRingPayload({
        meetingId: opts.meetingId,
        conversation: opts.conversation,
        isGroup,
      })

      if (isGroup) {
        const targets = memberIds(opts.conversation, currentUser.id)
        await Promise.all(targets.map((uid) => sendMeetingRing(payload, uid)))
        return
      }

      const peer = peerFromConversation(opts.conversation, currentUser.id)
      if (!peer.userId) return

      const info: MeetingRingInfo = {
        meetingId: opts.meetingId,
        conversationId: opts.conversation.id,
        peerUserId: peer.userId,
        peerName: peer.name,
        peerAvatar: peer.avatar,
        isCaller: true,
        isGroup: false,
        groupName: null,
      }
      setError(null)
      setRing(info)
      setPhase("outgoing")
      scheduleTimeout(DM_RING_TIMEOUT_MS)

      await sendMeetingRing(payload, peer.userId)
    },
    [buildRingPayload, currentUser.id, scheduleTimeout],
  )

  /** Host ended meeting — dismiss invites for remaining members. */
  const cancelInvitesForConversation = useCallback(
    async (opts: { meetingId: string; conversation: Conversation }) => {
      const targets = memberIds(opts.conversation, currentUser.id)
      const payload = { meetingId: opts.meetingId, fromUserId: currentUser.id }
      await Promise.all(targets.map((uid) => sendMeetingRingCancel(payload, uid)))
    },
    [currentUser.id],
  )

  const acceptIncoming = useCallback(async () => {
    const cur = ringRef.current
    if (!cur || phaseRef.current !== "incoming") return
    clearTimeoutSafe()
    try {
      if (!cur.isGroup) {
        await sendMeetingRingAccept(
          { meetingId: cur.meetingId, fromUserId: currentUser.id },
          cur.peerUserId,
        )
      }
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
    if (!cur.isGroup) {
      void sendMeetingRingReject(
        { meetingId: cur.meetingId, fromUserId: currentUser.id },
        cur.peerUserId,
      )
    }
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

  /** Host heard accept / remote joined — stop the outgoing DM ring chrome. */
  const markPeerJoined = useCallback(() => {
    if (phaseRef.current === "outgoing") clearRing()
  }, [clearRing])

  useEffect(() => {
    const channel = subscribeMeetingInbox(currentUser.id, {
      onRing: (payload: MeetingRingPayload) => {
        const conv = conversationsRef.current.find((c) => c.id === payload.conversationId)
        if (!conv) return
        if (!conv.participants?.some((p) => p.user_id === currentUser.id)) return

        const isGroup = Boolean(payload.isGroup || conv.is_group)

        if (phaseRef.current !== "idle" || inMeetingRef.current) {
          // DM: tell caller we're busy. Group: ignore (host keeps meeting).
          if (!isGroup) {
            void sendMeetingRingReject(
              { meetingId: payload.meetingId, fromUserId: currentUser.id },
              payload.fromUserId,
            )
          }
          return
        }

        const groupName = isGroup
          ? payload.groupName?.trim() ||
            conv.name?.trim() ||
            convDisplayName(conv, currentUser.id)
          : null

        const info: MeetingRingInfo = {
          meetingId: payload.meetingId,
          conversationId: payload.conversationId,
          peerUserId: payload.fromUserId,
          peerName:
            payload.fromName ||
            (isGroup ? groupName || "פגישה קבוצתית" : convDisplayName(conv, currentUser.id)),
          peerAvatar: isGroup
            ? conv.avatar_url
            : (payload.fromAvatar ?? convAvatarUrl(conv, currentUser.id)),
          isCaller: false,
          isGroup,
          groupName,
        }
        setError(null)
        setRing(info)
        setPhase("incoming")
        scheduleTimeout(isGroup ? GROUP_INVITE_TIMEOUT_MS : DM_RING_TIMEOUT_MS)
        void ensureNotificationPermission().then(() => {
          void showIncomingCallNotification({
            title: isGroup ? "פגישה קבוצתית התחילה" : "פגישת וידאו נכנסת",
            body: isGroup
              ? `${payload.fromName} מתחיל פגישה ב${groupName ?? "קבוצה"}`
              : info.peerName,
            tag: `meeting-${payload.meetingId}`,
          })
        })
      },
      onAccept: (payload) => {
        const cur = ringRef.current
        if (!cur?.isCaller || cur.isGroup || cur.meetingId !== payload.meetingId) return
        clearRing()
      },
      onReject: (payload) => {
        const cur = ringRef.current
        if (!cur?.isCaller || cur.isGroup || cur.meetingId !== payload.meetingId) return
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
    cancelInvitesForConversation,
    acceptIncoming,
    rejectIncoming,
    cancelOutgoing,
    markPeerJoined,
    clearRing,
  }
}
