"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { Avatar } from "./avatar"
import { Phone, PhoneOff, Users, Video, X } from "lucide-react"
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
    if (phase === "outgoing" && !ring.isGroup) {
      unlockNotificationSound()
      startOutgoingRingback()
      return () => stopAllCallSounds()
    }
    stopAllCallSounds()
  }, [phase, ring.isGroup])

  if (phase !== "incoming" && phase !== "outgoing") return null

  // Group: floating invite card (not full-screen ring)
  if (phase === "incoming" && ring.isGroup) {
    if (typeof document === "undefined") return null
    return createPortal(
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex justify-center px-3">
        <div
          className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl bg-[#111b21] text-white shadow-[0_16px_48px_rgba(0,0,0,0.45)] ring-1 ring-[#25d366]/35"
          style={{ animation: "toast-in 0.25s ease-out" }}
          role="alertdialog"
          aria-label="הזמנה לפגישה קבוצתית"
        >
          <div className="flex items-start gap-3 px-4 pb-3 pt-4">
            <Avatar
              name={ring.groupName || ring.peerName}
              url={ring.peerAvatar}
              size={48}
              isGroup
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#25d366]">
                <Video className="h-3.5 w-3.5" />
                פגישה קבוצתית
              </div>
              <p className="mt-0.5 truncate text-[15px] font-semibold">
                {ring.groupName || "קבוצה"}
              </p>
              <p className="mt-0.5 text-sm text-[#d1d7db]">
                {ring.peerName} התחיל/ה פגישה — רוצה להצטרף?
              </p>
            </div>
            <button
              type="button"
              aria-label="סגור"
              className="rounded-full p-1.5 text-[#8696a0] hover:bg-white/10"
              onClick={() => {
                unlockNotificationSound()
                onReject()
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2 border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                unlockNotificationSound()
                onReject()
              }}
              className="flex-1 rounded-full bg-white/10 py-2.5 text-sm font-medium transition hover:bg-white/15"
            >
              אחר כך
            </button>
            <button
              type="button"
              onClick={() => {
                unlockNotificationSound()
                onAccept()
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25d366] py-2.5 text-sm font-semibold text-[#0b141a] transition hover:bg-[#2fe076]"
            >
              <Users className="h-4 w-4" />
              הצטרף
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

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
