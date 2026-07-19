"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Profile } from "@/lib/types"
import type { MeetingSession } from "@/lib/types"
import {
  createMeeting,
  endMeeting,
  getMeetingById,
  joinMeetingByInvite,
} from "@/lib/meeting-actions"
import { meetingInvitePageUrl } from "@/lib/meeting-invite"

export type ActiveMeeting = {
  meetingId: string
  conversationId: string
  livekitRoom: string
  inviteToken: string
  hostId: string
  token: string
  serverUrl: string
  isHost: boolean
}

async function fetchLivekitToken(meetingId: string): Promise<{
  token: string
  serverUrl: string
  roomName: string
  isHost: boolean
}> {
  const res = await fetch("/api/livekit/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ meetingId }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    token?: string
    serverUrl?: string
    roomName?: string
    isHost?: boolean
    message?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || "לא ניתן להתחבר לפגישה")
  }
  if (!data.token || !data.serverUrl) {
    throw new Error("תשובת LiveKit לא תקינה")
  }
  return {
    token: data.token,
    serverUrl: data.serverUrl,
    roomName: data.roomName ?? "",
    isHost: Boolean(data.isHost),
  }
}

async function sessionToActive(meeting: MeetingSession): Promise<ActiveMeeting> {
  const creds = await fetchLivekitToken(meeting.id)
  return {
    meetingId: meeting.id,
    conversationId: meeting.conversation_id,
    livekitRoom: meeting.livekit_room,
    inviteToken: meeting.invite_token,
    hostId: meeting.host_id,
    token: creds.token,
    serverUrl: creds.serverUrl,
    isHost: creds.isHost,
  }
}

export function useLivekitMeeting(currentUser: Profile) {
  const [active, setActive] = useState<ActiveMeeting | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeRef = useRef<ActiveMeeting | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  const startMeeting = useCallback(
    async (conversationId: string) => {
      setError(null)
      setConnecting(true)
      try {
        const meeting = await createMeeting({
          conversationId,
          hostId: currentUser.id,
        })
        const next = await sessionToActive(meeting)
        setActive(next)
        return next
      } catch (err) {
        const msg = err instanceof Error ? err.message : "יצירת הפגישה נכשלה"
        setError(msg)
        throw err
      } finally {
        setConnecting(false)
      }
    },
    [currentUser.id],
  )

  const joinMeeting = useCallback(async (meetingId: string) => {
    setError(null)
    setConnecting(true)
    try {
      const meeting = await getMeetingById(meetingId)
      if (!meeting || !meeting.active) {
        throw new Error("הפגישה כבר הסתיימה")
      }
      const next = await sessionToActive(meeting)
      setActive(next)
      return next
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ההצטרפות נכשלה"
      setError(msg)
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  const joinByInviteToken = useCallback(async (token: string) => {
    setError(null)
    setConnecting(true)
    try {
      const joined = await joinMeetingByInvite(token)
      const meeting = await getMeetingById(joined.meetingId)
      if (!meeting) throw new Error("הפגישה לא נמצאה")
      const next = await sessionToActive(meeting)
      setActive(next)
      return next
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ההצטרפות נכשלה"
      setError(msg)
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  const leaveMeeting = useCallback(() => {
    setActive(null)
    setError(null)
  }, [])

  const endMeetingForAll = useCallback(async () => {
    const cur = activeRef.current
    if (!cur) return
    try {
      await endMeeting({ meetingId: cur.meetingId, userId: currentUser.id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "סיום הפגישה נכשל"
      setError(msg)
    } finally {
      setActive(null)
    }
  }, [currentUser.id])

  const inviteUrl = active ? meetingInvitePageUrl(active.inviteToken) : null

  return {
    active,
    connecting,
    error,
    setError,
    startMeeting,
    joinMeeting,
    joinByInviteToken,
    leaveMeeting,
    endMeetingForAll,
    inviteUrl,
  }
}
