"use client"

import { useEffect } from "react"
import type { RefObject } from "react"
import { Avatar } from "./avatar"
import { Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from "lucide-react"
import { startIncomingCallRingtone, stopIncomingCallRingtone } from "@/lib/notification-sound"
import type { CallPhase, ActiveCallInfo } from "@/lib/use-webrtc-call"

type Props = {
  phase: CallPhase
  call: ActiveCallInfo
  seconds: number
  muted: boolean
  camOff: boolean
  hasRemoteVideo: boolean
  error: string | null
  localVideoRef: RefObject<HTMLVideoElement | null>
  remoteVideoRef: RefObject<HTMLVideoElement | null>
  remoteAudioRef: RefObject<HTMLAudioElement | null>
  onAccept: () => void
  onReject: () => void
  onHangup: () => void
  onToggleMute: () => void
  onToggleCamera: () => void
  onDismissError?: () => void
}

export function CallOverlay({
  phase,
  call,
  seconds,
  muted,
  camOff,
  hasRemoteVideo,
  error,
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
  onToggleCamera,
}: Props) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0")
  const ss = String(seconds % 60).padStart(2, "0")

  const statusText =
    phase === "incoming"
      ? call.video
        ? "שיחת וידאו נכנסת..."
        : "שיחה נכנסת..."
      : phase === "outgoing"
        ? call.video
          ? "מתקשר לווידאו..."
          : "מתקשר..."
        : phase === "connecting"
          ? "מתחבר..."
          : `${mm}:${ss}`

  useEffect(() => {
    // try to play remote media when connected (autoplay policies)
    if (phase === "connected") {
      void remoteVideoRef.current?.play().catch(() => {})
      void remoteAudioRef.current?.play().catch(() => {})
    }
  }, [phase, remoteAudioRef, remoteVideoRef])

  useEffect(() => {
    if (phase === "incoming") {
      startIncomingCallRingtone()
      return () => stopIncomingCallRingtone()
    }
    stopIncomingCallRingtone()
  }, [phase])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#0b141a] text-white">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Remote video / avatar */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {call.video && (phase === "connected" || phase === "connecting") ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${hasRemoteVideo && !camOff ? "" : "opacity-0 absolute"}`}
            />
            {(!hasRemoteVideo || phase !== "connected") && (
              <div className="flex flex-col items-center">
                <Avatar name={call.peerName} url={call.peerAvatar} size={120} />
                <p className="mt-4 text-sm text-white/70">{statusText}</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center px-6 pt-16">
            <Avatar name={call.peerName} url={call.peerAvatar} size={120} />
            <h2 className="mt-6 text-2xl font-light">{call.peerName}</h2>
            <p className="mt-2 text-sm text-white/70">{statusText}</p>
          </div>
        )}

        {/* Local preview (PiP) */}
        {call.video && phase !== "incoming" && (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`absolute bottom-28 left-4 h-36 w-28 rounded-xl object-cover shadow-lg ring-1 ring-white/20 ${
              camOff ? "hidden" : ""
            }`}
          />
        )}
        {call.video && camOff && phase !== "incoming" && (
          <div className="absolute bottom-28 left-4 flex h-36 w-28 items-center justify-center rounded-xl bg-[#1f2c34] text-xs text-white/50 ring-1 ring-white/20">
            מצלמה כבויה
          </div>
        )}
      </div>

      {call.video && phase === "connected" && hasRemoteVideo && (
        <div className="absolute top-8 inset-x-0 text-center">
          <h2 className="text-lg font-medium drop-shadow">{call.peerName}</h2>
          <p className="text-sm text-white/80 drop-shadow">{statusText}</p>
        </div>
      )}

      {error && (
        <div className="absolute top-4 inset-x-4 rounded-md bg-[#ea0038]/90 px-3 py-2 text-center text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-center gap-5 pb-10 pt-4">
        {phase === "incoming" ? (
          <>
            <button
              type="button"
              onClick={onReject}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ea0038]"
              aria-label="דחה"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={onAccept}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25d366]"
              aria-label="ענה"
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10"
              aria-label={muted ? "בטל השתקה" : "השתק"}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            {call.video && (
              <button
                type="button"
                onClick={onToggleCamera}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10"
                aria-label={camOff ? "הפעל מצלמה" : "כבה מצלמה"}
              >
                {camOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </button>
            )}
            <button
              type="button"
              onClick={onHangup}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ea0038]"
              aria-label="סיים שיחה"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
