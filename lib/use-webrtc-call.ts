"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Conversation, Profile } from "@/lib/types"
import { convAvatarUrl, convDisplayName, otherParticipantId } from "@/lib/conversation-display"
import {
  ICE_SERVERS,
  roomCallChannel,
  sendSignal,
  sendToUser,
  subscribeChannel,
  userCallChannel,
  type CallSignal,
} from "@/lib/call-signaling"
import { insertCallSystemMessage } from "@/lib/call-system-message"
import { createClient } from "@/lib/supabase/client"
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
  const roomChannelRef = useRef<RealtimeChannel | null>(null)
  const inboxChannelRef = useRef<RealtimeChannel | null>(null)
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])
  const callRef = useRef<ActiveCallInfo | null>(null)
  const phaseRef = useRef<CallPhase>("idle")
  const wasConnectedRef = useRef(false)
  const secondsRef = useRef(0)
  const startLoggedRef = useRef(false)

  useEffect(() => {
    callRef.current = call
  }, [call])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    secondsRef.current = seconds
  }, [seconds])

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

  const markConnected = useCallback(async () => {
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
  }, [logCallEvent])

  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
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
    cleanupMedia()
    await leaveRoom()
    setCall(null)
    setPhase("idle")
    setMuted(false)
    setCamOff(false)
    setSeconds(0)
    wasConnectedRef.current = false
    startLoggedRef.current = false
  }, [cleanupMedia, leaveRoom])

  const hangup = useCallback(async () => {
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
      } else if (phaseNow === "outgoing" || phaseNow === "connecting") {
        await logCallEvent("missed", active)
      }
    }
    await endLocal()
  }, [currentUser.id, endLocal, logCallEvent])

  const attachLocalStream = useCallback(async (video: boolean) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    })
    localStreamRef.current = stream
    if (localVideoRef.current && video) {
      localVideoRef.current.srcObject = stream
      void localVideoRef.current.play().catch(() => {})
    }
    return stream
  }, [])

  const ensurePeer = useCallback(
    (info: ActiveCallInfo) => {
      if (pcRef.current) return pcRef.current

      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcRef.current = pc

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
        const stream = ev.streams[0]
        if (!stream) return
        const hasVid = stream.getVideoTracks().length > 0
        setHasRemoteVideo(hasVid)
        if (remoteVideoRef.current && hasVid) {
          remoteVideoRef.current.srcObject = stream
          void remoteVideoRef.current.play().catch(() => {})
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream
          void remoteAudioRef.current.play().catch(() => {})
        }
        void markConnected()
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setError("השיחה התנתקה")
          void endLocal()
        }
        if (pc.connectionState === "connected") {
          void markConnected()
        }
      }

      return pc
    },
    [currentUser.id, endLocal, markConnected],
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
        // Peer ended the call — they already logged "ended" / "missed"
        await endLocal()
        return
      }

      const pc = ensurePeer(active)

      if (signal.type === "offer") {
        setPhase("connecting")
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
    [attachLocalStream, currentUser.id, endLocal, ensurePeer, flushIce, markConnected],
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
      setCall(info)
      setPhase("outgoing")

      try {
        await joinRoom(info)
        const pc = ensurePeer(info)
        const stream = localStreamRef.current!
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))

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
    ],
  )

  const acceptCall = useCallback(async () => {
    const active = callRef.current
    if (!active || phaseRef.current !== "incoming") return
    setError(null)
    setPhase("connecting")

    try {
      await attachLocalStream(active.video)
      await joinRoom(active)
      ensurePeer(active)
      await sendToUser(active.peerUserId, {
        type: "accept",
        callId: active.callId,
        fromUserId: currentUser.id,
      })
      // Log incoming as soon as we accept (before WebRTC fully connects)
      if (!startLoggedRef.current) {
        startLoggedRef.current = true
        wasConnectedRef.current = true
        await logCallEvent("incoming", active)
      }
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
  }, [attachLocalStream, currentUser.id, endLocal, ensurePeer, joinRoom, logCallEvent])

  const rejectCall = useCallback(async () => {
    const active = callRef.current
    if (active) {
      try {
        await sendToUser(active.peerUserId, {
          type: "reject",
          callId: active.callId,
          fromUserId: currentUser.id,
        })
      } catch {
        // ignore
      }
      await logCallEvent("rejected", active)
    }
    await endLocal()
  }, [currentUser.id, endLocal, logCallEvent])

  // When callee accepts, caller creates offer
  const onPeerAccepted = useCallback(async () => {
    const active = callRef.current
    if (!active || !active.isCaller) return
    setPhase("connecting")
    if (!startLoggedRef.current) {
      startLoggedRef.current = true
      wasConnectedRef.current = true
      await logCallEvent("outgoing", active)
    }
    const pc = ensurePeer(active)
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: active.video })
    await pc.setLocalDescription(offer)
    if (roomChannelRef.current) {
      await sendSignal(roomChannelRef.current, {
        type: "offer",
        callId: active.callId,
        fromUserId: currentUser.id,
        sdp: offer,
      })
    }
  }, [currentUser.id, ensurePeer, logCallEvent])

  // Inbox: listen for incoming rings / accept / reject / hangup
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
              })
              return
            }
            const conv = conversations.find((c) => c.id === signal.conversationId)
            wasConnectedRef.current = false
            startLoggedRef.current = false
            setCall({
              callId: signal.callId,
              conversationId: signal.conversationId,
              peerUserId: signal.fromUserId,
              peerName: signal.fromName || (conv ? convDisplayName(conv, currentUser.id) : "שיחה נכנסת"),
              peerAvatar: signal.fromAvatar ?? (conv ? convAvatarUrl(conv, currentUser.id) : null),
              video: signal.video,
              isCaller: false,
            })
            setPhase("incoming")
            setError(null)
          }

          if (signal.type === "accept") {
            if (callRef.current?.callId === signal.callId && callRef.current.isCaller) {
              void onPeerAccepted()
            }
          }

          if (signal.type === "reject") {
            if (callRef.current?.callId === signal.callId) {
              setError("השיחה נדחתה")
              // Callee already logged "rejected"
              void endLocal()
            }
          }

          if (signal.type === "hangup") {
            if (callRef.current?.callId === signal.callId) {
              void endLocal()
            }
          }
        })
        if (!cancelled) inboxChannelRef.current = channel
      } catch {
        // inbox may fail without breaking chat
      }
    })()

    return () => {
      cancelled = true
      const supabase = createClient()
      if (channel) void supabase.removeChannel(channel)
      inboxChannelRef.current = null
    }
  }, [conversations, currentUser.id, endLocal, onPeerAccepted])

  useEffect(() => {
    if (phase !== "connected") return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [phase])

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
      cleanupMedia()
      const supabase = createClient()
      if (roomChannelRef.current) void supabase.removeChannel(roomChannelRef.current)
      if (inboxChannelRef.current) void supabase.removeChannel(inboxChannelRef.current)
    }
  }, [cleanupMedia])

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
