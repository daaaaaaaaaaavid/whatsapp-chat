"use client"

import type { Message } from "@/lib/types"
import { formatTime } from "@/lib/format"
import { callSystemLabel, parseCallSystemPayload } from "@/lib/call-system-message"
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Video,
} from "lucide-react"
import { cn } from "@/lib/utils"

export function SystemCallMessage({ message }: { message: Message }) {
  const payload = parseCallSystemPayload(message.content)
  const label = payload ? callSystemLabel(payload) : "הודעת מערכת"
  const event = payload?.event
  const isVideo = payload?.video

  let Icon = Phone
  if (event === "incoming") Icon = PhoneIncoming
  else if (event === "outgoing") Icon = PhoneOutgoing
  else if (event === "missed") Icon = PhoneMissed
  else if (event === "rejected") Icon = PhoneOff
  else if (event === "ended") Icon = PhoneOff

  const iconColor =
    event === "missed" || event === "rejected"
      ? "text-[#ea0038]"
      : event === "ended"
        ? "text-[var(--wa-text-secondary)]"
        : "text-[#00a884]"

  return (
    <div className="my-2 flex justify-center px-2">
      <div className="inline-flex max-w-[90%] items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-[var(--wa-text-secondary)] shadow-sm">
        {isVideo ? (
          <Video className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
        ) : (
          <Icon className={cn("h-3.5 w-3.5 shrink-0", iconColor)} />
        )}
        <span>{label}</span>
        <span className="text-[#8696a0]" dir="ltr">
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
