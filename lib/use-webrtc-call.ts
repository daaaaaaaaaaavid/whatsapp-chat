"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Conversation, Profile } from "@/lib/types"
import { convAvatarUrl, convDisplayName, otherParticipantId } from "@/lib/conversation-display"
import {
  createCallSession,
  endCallSession,
  getIceConfiguration,
  roomCallChannel,
  sendSignal,
  sendToUser,
  subscribeChannel,
  userCallChannel,
  type CallSignal,
} from "@/lib/call-signaling"
import { insertCallSystemMessage } from "@/lib/call-system-message"
import { createClient } from "@/lib/supabase/client"
import {
  stopAllCallSounds,
  unlockNotificationSound,
} from "@/lib/notification-sound"
import {
  ensureNotificationPermission,
  showIncomingCallNotification,
} from "@/lib/browser-notifications"
import type { RealtimeChannel } from "@supabase/supabase-js"

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "connected"

export type ActiveCallInfo = {
  callId: string
  conversationId: string
  peerUserId: string
  peerName: string
  peerAvatar: string | null
  video: boolean
  isCaller: boolean
}

type Options = {
  currentUser: Profile
  conversations: Conversation[]
}

const RING_TIMEOUT_MS = 45_000
const DISCONNECT_GRACE_MS = 4_000

export function useWebRtcCall({ currentUser, conversations }: Options) {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [call, setCall] = useState<ActiveCallInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const roomChannelRef = useRef<RealtimeChannel | null>(null)
  const inboxChannelRef = useRef<RealtimeChannel | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const callRef = useRef<ActiveCallInfo | null>(null)
  const phaseRef = useRef<CallPhase>("idle")
  const wasConnectedRef = useRef(false)
  const secondsRef = useRef(0)
  const startLoggedRef = useRef(false)
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endingRef = useRef(false)
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conversationsRef = useRef(conversations)
  const onPeerAcceptedRef = useRef<() => Promise<void>>(async () => {})
  const scheduleRingTimeoutRef = useRef<() => void>(() => {})
  const endLocalRef = useRef<() => Promise<void>>(async () => {})
  const logCallEventRef = useRef<
    (
      event: "incoming" | "outgoing" | "ended" | "missed" | "rejected",
      info?: ActiveCallInfo | null,
      durationSec?: number,
    ) => Promise<void>
  >(async () => {})

  conversationsRef.current = conversations

  useEffect(() => {
    callRef.current = call
  }, [call])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    secondsRef.current = seconds
  }, [seconds])

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }, [])

  const clearDisconnectTimer = useCallback(() => {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
  }, [])

  const logCallEvent = useCallback(
    async (
      event: "incoming" | "outgoing" | "ended" | "missed" | "rejected",
      info?: ActiveCallInfo | null,
      durationSec?: number,
    ) => {
      const active = info ?? callRef.current
      if (!active) return
      try {
        await insertCallSystemMessage({
          conversationId: active.conversationId,
          senderId: currentUser.id,
          event,
          video: active.video,
          durationSec,
        })
      } catch {
        // chat should keep working even if system message fails
      }
    },
    [currentUser.id],
  )
  logCallEventRef.current = logCallEvent

  const markConnected = useCallback(async () => {
    clearRingTimeout()
    clearDisconnectTimer()
    stopAllCallSounds()
    if (wasConnectedRef.current) {
      setPhase("connected")
      return
    }
    wasConnectedRef.current = true
    setPhase("connected")
    if (!startLoggedRef.current) {
      startLoggedRef.current = true
      const active = callRef.current
      if (active) {
        await logCallEvent(active.isCaller ? "outgoing" : "incoming", active)
      }
    }
  }, [clearDisconnectTimer, clearRingTimeout, logCallEvent])

  const attachRemoteMedia = useCallback(() => {
    const stream = remoteStreamRef.current
    const active = callRef.current
    if (!stream) return
    const hasVid = stream.getVideoTracks().some((t) => t.readyState === "live" || t.enabled)
    setHasRemoteVideo(hasVid && stream.getVideoTracks().length > 0)

    // Video element already plays audio — attach stream to only one element to avoid double playback.
    if (active?.video) {
      if (remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== stream) {
          remoteVideoRef.current.srcObject = stream
        }
        void remoteVideoRef.current.play().catch(() => {})
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null
      }
    } else {
      if (remoteAudioRef.current) {
        if (remoteAudioRef.current.srcObject !== stream) {
          remoteAudioRef.current.srcObject = stream
        }
        void remoteAudioRef.current.play().catch(() => {})
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null
      }
    }
  }, [])

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    pcRef.current?.close()
    pcRef.current = null
    pendingIceRef.current = []
    setHasRemoteVideo(false)
  }, [])

  const leaveRoom = useCallback(async () => {
    const supabase = createClient()
    if (roomChannelRef.current) {
      await supabase.removeChannel(roomChannelRef.current)
      roomChannelRef.current = null
    }
  }, [])

  const endLocal = useCallback(async () => {
    const active = callRef.current
    clearRingTimeout()
    clearDisconnectTimer()
    stopAllCallSounds()
    cleanupMedia()
    await leaveRoom()
    if (active?.callId) void endCallSession(active.callId)
    setCall(null)
    setPhase("idle")
    setMuted(false)
    setCamOff(false)
    setSeconds(0)
    wasConnectedRef.current = false
    startLoggedRef.current = false
    endingRef.current = false
  }, [cleanupMedia, clearDisconnectTimer, clearRingTimeout, leaveRoom])
  endLocalRef.current = endLocal

  const hangup = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    const active = callRef.current
    const phaseNow = phaseRef.current
    const connected = wasConnectedRef.current
    const duration = secondsRef.current

    if (active) {
      try {
        await sendToUser(active.peerUserId, {
          type: "hangup",
          callId: active.callId,
          fromUserId: currentUser.id,
        })
      } catch {
        // ignore
      }
      if (roomChannelRef.current) {
        try {
          await sendSignal(roomChannelRef.current, {
            type: "hangup",
            callId: active.callId,
            fromUserId: currentUser.id,
          })
        } catch {
          // ignore
        }
      }

      if (connected) {
        await logCallEvent("ended", active, duration)
      }
      // Caller cancel / timeout: do not log "missed" here — only the callee logs missed on hangup.
      // Incoming side should use rejectCall; if hangup while incoming, treat as missed for self.
      else if (phaseNow === "incoming" && !active.isCaller) {
        await logCallEvent("missed", active)
      }
    }
    await endLocal()
  }, [currentUser.id, endLocal, logCallEvent])

  const scheduleRingTimeout = useCallback(() => {
    clearRingTimeout()
    ringTimeoutRef.current = setTimeout(() => {
      const phaseNow = phaseRef.current
      if (phaseNow === "outgoing" || phaseNow === "incoming") {
        setError("אין מענה")
        void hangup()
      }
    }, RING_TIMEOUT_MS)
  }, [clearRingTimeout, hangup])
  scheduleRingTimeoutRef.current = scheduleRingTimeout

  const attachLocalStream = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: video
        ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
    })
    localStreamRef.current = stream
    if (localVideoRef.current && video) {
      localVideoRef.current.srcObject = stream
      void localVideoRef.current.play().catch(() => {})
    }
    return stream
  }, [])

  const ensurePeer = useCallback(
    async (info: ActiveCallInfo) => {
      if (pcRef.current) return pcRef.current

      const ice = await getIceConfiguration()
      const pc = new RTCPeerConnection(ice)
      pcRef.current = pc
      remoteStreamRef.current = new MediaStream()

      pc.onicecandidate = (ev) => {
        if (!ev.candidate || !roomChannelRef.current) return
        void sendSignal(roomChannelRef.current, {
          type: "ice",
          callId: info.callId,
          fromUserId: currentUser.id,
          candidate: ev.candidate.toJSON(),
        })
      }

      pc.ontrack = (ev) => {
        const remote = remoteStreamRef.current ?? new MediaStream()
        remoteStreamRef.current = remote
        if (!remote.getTracks().some((t) => t.id === ev.track.id)) {
          remote.addTrack(ev.track)
        }
        attachRemoteMedia()
        void markConnected()
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          clearDisconnectTimer()
          void markConnected()
          return
        }

        if (pc.connectionState === "failed") {
          if (endingRef.current) return
          endingRef.current = true
          clearDisconnectTimer()
          setError("השיחה התנתקה")
          const active = callRef.current
          if (active && wasConnectedRef.current) {
            void logCallEvent("ended", active, secondsRef.current)
            void sendToUser(active.peerUserId, {
              type: "hangup",
              callId: active.callId,
              fromUserId: currentUser.id,
            }).catch(() => {})
          }
          void endLocal()
          return
        }

        // Brief ICE blips — wait before ending so temporary disconnects don't kill the call
        if (pc.connectionState === "disconnected") {
          if (endingRef.current || disconnectTimerRef.current) return
          disconnectTimerRef.current = setTimeout(() => {
            disconnectTimerRef.current = null
            const state = pcRef.current?.connectionState
            if (state === "connected" || state === "connecting") return
            if (endingRef.current) return
            endingRef.current = true
            setError("השיחה התנתקה")
            const active = callRef.current
            if (active && wasConnectedRef.current) {
              void logCallEvent("ended", active, secondsRef.current)
              void sendToUser(active.peerUserId, {
                type: "hangup",
                callId: active.callId,
                fromUserId: currentUser.id,
              }).catch(() => {})
            }
            void endLocal()
          }, DISCONNECT_GRACE_MS)
        }
      }

      return pc
    },
    [
      attachRemoteMedia,
      clearDisconnectTimer,
      currentUser.id,
      endLocal,
      logCallEvent,
      markConnected,
    ],
  )

  const flushIce = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queued = pendingIceRef.current
    pendingIceRef.current = []
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c)
      } catch {
        // ignore bad candidates
      }
    }
  }, [])

  const handleRoomSignal = useCallback(
    async (signal: CallSignal) => {
      const active = callRef.current
      if (!active || signal.callId !== active.callId) return
      if (signal.fromUserId === currentUser.id) return

      if (signal.type === "hangup") {
        // Only the ringing callee logs a missed call (avoids duplicate system messages)
        if (!wasConnectedRef.current && phaseRef.current === "incoming" && !active.isCaller) {
          await logCallEvent("missed", active)
        }
        await endLocal()
        return
      }

      const pc = await ensurePeer(active)

      if (signal.type === "offer") {
        setPhase("connecting")
        clearRingTimeout()
        stopAllCallSounds()
        await pc.setRemoteDescription(signal.sdp)
        await flushIce()
        const stream = localStreamRef.current ?? (await attachLocalStream(active.video))
        stream.getTracks().forEach((track) => {
          if (!pc.getSenders().some((s) => s.track === track)) {
            pc.addTrack(track, stream)
          }
        })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        if (roomChannelRef.current) {
          await sendSignal(roomChannelRef.current, {
            type: "answer",
            callId: active.callId,
            fromUserId: currentUser.id,
            sdp: answer,
          })
        }
      }

      if (signal.type === "answer") {
        await pc.setRemoteDescription(signal.sdp)
        await flushIce()
        await markConnected()
      }

      if (signal.type === "ice") {
        if (!pc.remoteDescription) {
          pendingIceRef.current.push(signal.candidate)
        } else {
          try {
            await pc.addIceCandidate(signal.candidate)
          } catch {
            // ignore
          }
        }
      }
    },
    [
      attachLocalStream,
      clearRingTimeout,
      currentUser.id,
      endLocal,
      ensurePeer,
      flushIce,
      logCallEvent,
      markConnected,
    ],
  )

  const joinRoom = useCallback(
    async (info: ActiveCallInfo) => {
      await leaveRoom()
      const channel = await subscribeChannel(roomCallChannel(info.callId), (signal) => {
        void handleRoomSignal(signal)
      })
      roomChannelRef.current = channel
    },
    [handleRoomSignal, leaveRoom],
  )

  const startCall = useCallback(
    async (conversation: Conversation, video: boolean) => {
      setError(null)
      unlockNotificationSound()
      void ensureNotificationPermission()
      if (phaseRef.current !== "idle") return

      if (conversation.is_group) {
        setError("שיחות זמינות רק בצ'אט פרטי (לא בקבוצה)")
        return
      }

      const peerId = otherParticipantId(conversation, currentUser.id)
      if (!peerId) {
        setError("לא נמצא משתמש בשיחה")
        return
      }

      try {
        await attachLocalStream(video)
      } catch {
        setError("יש לאשר גישה למיקרופון" + (video ? " ולמצלמה" : ""))
        cleanupMedia()
        return
      }

      const callId = crypto.randomUUID()
      const info: ActiveCallInfo = {
        callId,
        conversationId: conversation.id,
        peerUserId: peerId,
        peerName: convDisplayName(conversation, currentUser.id),
        peerAvatar: convAvatarUrl(conversation, currentUser.id),
        video,
        isCaller: true,
      }

      wasConnectedRef.current = false
      startLoggedRef.current = false
      endingRef.current = false
      setCall(info)
      setPhase("outgoing")
      scheduleRingTimeout()

      try {
        await createCallSession({
          callId,
          conversationId: conversation.id,
          callerId: currentUser.id,
          calleeId: peerId,
          video,
        })
        await joinRoom(info)
        const pc = await ensurePeer(info)
        const stream = localStreamRef.current!
        stream.getTracks().forEach((track) => {
          if (!pc.getSenders().some((s) => s.track === track)) {
            pc.addTrack(track, stream)
          }
        })

        await sendToUser(peerId, {
          type: "ring",
          callId,
          fromUserId: currentUser.id,
          fromName: currentUser.display_name ?? currentUser.email ?? "משתמש",
          fromAvatar: currentUser.avatar_url,
          video,
          conversationId: conversation.id,
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : "נכשל בהתחלת שיחה")
        await endCallSession(callId)
        await endLocal()
      }
    },
    [
      attachLocalStream,
      cleanupMedia,
      currentUser.avatar_url,
      currentUser.display_name,
      currentUser.email,
      currentUser.id,
      endLocal,
      ensurePeer,
      joinRoom,
      scheduleRingTimeout,
    ],
  )

  const acceptCall = useCallback(async () => {
    const active = callRef.current
    if (!active || phaseRef.current !== "incoming") return
    unlockNotificationSound()
    setError(null)
    setPhase("connecting")
    clearRingTimeout()
    stopAllCallSounds()

    try {
      await attachLocalStream(active.video)
      await joinRoom(active)
      await ensurePeer(active)
      await sendToUser(active.peerUserId, {
        type: "accept",
        callId: active.callId,
        fromUserId: currentUser.id,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "נכשל במענה לשיחה")
      wasConnectedRef.current = false
      startLoggedRef.current = false
      try {
        await sendToUser(active.peerUserId, {
          type: "hangup",
          callId: active.callId,
          fromUserId: currentUser.id,
        })
      } catch {
        // ignore
      }
      await endLocal()
    }
  }, [attachLocalStream, clearRingTimeout, currentUser.id, endLocal, ensurePeer, joinRoom])

  const rejectCall = useCallback(async () => {
    const active = callRef.current
    clearRingTimeout()
    stopAllCallSounds()
    if (active) {
      try {
        await sendToUser(active.peerUserId, {
          type: "reject",
          callId: active.callId,
          fromUserId: currentUser.id,
          reason: "declined",
        })
      } catch {
        // ignore
      }
      await logCallEvent("rejected", active)
    }
    await endLocal()
  }, [clearRingTimeout, currentUser.id, endLocal, logCallEvent])

  const onPeerAccepted = useCallback(async () => {
    const active = callRef.current
    if (!active || !active.isCaller) return
    setPhase("connecting")
    clearRingTimeout()
    stopAllCallSounds()
    const pc = await ensurePeer(active)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    if (roomChannelRef.current) {
      await sendSignal(roomChannelRef.current, {
        type: "offer",
        callId: active.callId,
        fromUserId: currentUser.id,
        sdp: offer,
      })
    }
  }, [clearRingTimeout, currentUser.id, ensurePeer])
  onPeerAcceptedRef.current = onPeerAccepted

  // Inbox: listen for incoming rings / accept / reject / hangup.
  // Keep conversations in a ref so conversation list updates don't tear down the channel.
  useEffect(() => {
    let cancelled = false
    let channel: RealtimeChannel | null = null

    ;(async () => {
      try {
        channel = await subscribeChannel(userCallChannel(currentUser.id), (signal) => {
          if (signal.fromUserId === currentUser.id) return

          if (signal.type === "ring") {
            if (phaseRef.current !== "idle") {
              void sendToUser(signal.fromUserId, {
                type: "reject",
                callId: signal.callId,
                fromUserId: currentUser.id,
                reason: "busy",
              })
              return
            }
            const conv = conversationsRef.current.find((c) => c.id === signal.conversationId)
            // Ignore rings for conversations we are not a participant of.
            if (!conv || !conv.participants?.some((p) => p.user_id === currentUser.id)) {
              return
            }
            wasConnectedRef.current = false
            startLoggedRef.current = false
            endingRef.current = false
            const info: ActiveCallInfo = {
              callId: signal.callId,
              conversationId: signal.conversationId,
              peerUserId: signal.fromUserId,
              peerName:
                signal.fromName || (conv ? convDisplayName(conv, currentUser.id) : "שיחה נכנסת"),
              peerAvatar:
                signal.fromAvatar ?? (conv ? convAvatarUrl(conv, currentUser.id) : null),
              video: signal.video,
              isCaller: false,
            }
            setCall(info)
            setPhase("incoming")
            setError(null)
            scheduleRingTimeoutRef.current()
            // Ringtone is owned by CallOverlay to avoid double playback
            void ensureNotificationPermission().then(() => {
              void showIncomingCallNotification({
                title: signal.video ? "שיחת וידאו נכנסת" : "שיחה נכנסת",
                body: info.peerName,
                tag: `call-${signal.callId}`,
              })
            })
          }

          if (signal.type === "accept") {
            if (callRef.current?.callId === signal.callId && callRef.current.isCaller) {
              void onPeerAcceptedRef.current()
            }
          }

          if (signal.type === "reject") {
            if (callRef.current?.callId === signal.callId) {
              setError(signal.reason === "busy" ? "המשתמש בשיחה אחרת" : "השיחה נדחתה")
              void endLocalRef.current()
            }
          }

          if (signal.type === "hangup") {
            if (callRef.current?.callId === signal.callId) {
              const phaseNow = phaseRef.current
              const active = callRef.current
              if (
                active &&
                !wasConnectedRef.current &&
                phaseNow === "incoming" &&
                !active.isCaller
              ) {
                void logCallEventRef.current("missed", active)
              }
              void endLocalRef.current()
            }
          }
        })
        if (!cancelled) inboxChannelRef.current = channel
      } catch {
        if (!cancelled) {
          setError((prev) => prev ?? "לא ניתן לקבל שיחות כרגע")
        }
      }
    })()

    return () => {
      cancelled = true
      const supabase = createClient()
      if (channel) void supabase.removeChannel(channel)
      inboxChannelRef.current = null
    }
  }, [currentUser.id])

  useEffect(() => {
    if (phase !== "connected") return
    attachRemoteMedia()
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [phase, attachRemoteMedia])

  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
  }, [muted])

  const toggleCamera = useCallback(() => {
    const next = !camOff
    setCamOff(next)
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !next
    })
  }, [camOff])

  useEffect(() => {
    return () => {
      clearRingTimeout()
      clearDisconnectTimer()
      stopAllCallSounds()
      cleanupMedia()
      const supabase = createClient()
      if (roomChannelRef.current) void supabase.removeChannel(roomChannelRef.current)
      if (inboxChannelRef.current) void supabase.removeChannel(inboxChannelRef.current)
    }
  }, [cleanupMedia, clearDisconnectTimer, clearRingTimeout])

  return {
    phase,
    call,
    error,
    setError,
    seconds,
    muted,
    camOff,
    hasRemoteVideo,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
  }
}
