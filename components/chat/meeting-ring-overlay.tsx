"use client"

import { useEffect } from "react"
import { Avatar } from "./avatar"
import { Phone, PhoneOff, Users } from "lucide-react"
import {
  startIncomingCallRingtone,
  startOutgoingRingback,
  stopAllCallSounds,
  unlockNotificationSound,
} from "@/lib/notification-sound"
import type { MeetingRingInfo, MeetingRingPhase } from "@/lib/use-meeting-ring"

type Props = {
  phase: MeetingRingPhase
  ring: MeetingRingInfo
  error?: string | null
  onAccept: () => void
  onReject: () => void
  onCancel: () => void
  onDismissError?: () => void
}

export function MeetingRingOverlay({
  phase,
  ring,
  error,
  onAccept,
  onReject,
  onCancel,
  onDismissError,
}: Props) {
  useEffect(() => {
    if (phase === "incoming") {
      unlockNotificationSound()
      startIncomingCallRingtone()
      return () => stopAllCallSounds()
    }
    if (phase === "outgoing") {
      unlockNotificationSound()
      startOutgoingRingback()
      return () => stopAllCallSounds()
    }
    stopAllCallSounds()
  }, [phase])

  if (phase !== "incoming" && phase !== "outgoing") return null

  const statusText =
    phase === "incoming" ? "פגישת וידאו נכנסת..." : "מחייג לפגישת וידאו..."

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#0b141a] text-white">
      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366]/20">
          <Users className="h-7 w-7 text-[#25d366]" />
        </div>
        <Avatar name={ring.peerName} url={ring.peerAvatar} size={120} />
        <h2 className="mt-6 text-2xl font-light">{ring.peerName}</h2>
        <p className="mt-2 text-sm text-white/70">{statusText}</p>
      </div>

      {error && (
        <button
          type="button"
          onClick={onDismissError}
          className="absolute inset-x-4 top-4 rounded-md bg-[#ea0038]/90 px-3 py-2 text-center text-sm"
        >
          {error}
        </button>
      )}

      <div className="flex items-center justify-center gap-5 pb-10 pt-4">
        {phase === "incoming" ? (
          <>
            <button
              type="button"
              onClick={() => {
                unlockNotificationSound()
                onReject()
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ea0038]"
              aria-label="דחה"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={() => {
                unlockNotificationSound()
                onAccept()
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25d366]"
              aria-label="ענה"
            >
              <Phone className="h-7 w-7" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              unlockNotificationSound()
              onCancel()
            }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ea0038]"
            aria-label="בטל"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        )}
      </div>
    </div>
  )
}
