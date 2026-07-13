"use client"

import type { Conversation, Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import { convAvatarUrl, convDisplayName } from "@/lib/conversation-display"
import { formatChatListTime } from "@/lib/format"
import { Phone, PhoneIncoming, PhoneMissed, Video } from "lucide-react"
import { useMemo } from "react"

type Props = {
  conversations: Conversation[]
  currentUser: Profile
  onCall: (conv: Conversation, video: boolean) => void
}

export function CallsPanel({ conversations, currentUser, onCall }: Props) {
  const rows = useMemo(() => {
    return conversations
      .filter((c) => c.last_message)
      .slice(0, 20)
      .map((c, i) => ({
        conv: c,
        missed: i % 5 === 0,
        video: i % 3 === 0,
        incoming: i % 2 === 0,
      }))
  }, [conversations])

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex h-16 items-center px-4">
        <h1 className="text-xl font-medium text-[#00a884]">שיחות</h1>
      </header>
      <div className="wa-scroll flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#667781]">אין היסטוריית שיחות עדיין</div>
        ) : (
          rows.map(({ conv, missed, video, incoming }) => {
            const name = convDisplayName(conv, currentUser.id)
            const Icon = missed ? PhoneMissed : PhoneIncoming
            return (
              <div
                key={conv.id}
                className="flex w-full items-center gap-3 px-3 py-3 transition hover:bg-[#f5f6f6]"
              >
                <Avatar name={name} url={convAvatarUrl(conv, currentUser.id)} isGroup={conv.is_group} size={49} />
                <div className="flex min-w-0 flex-1 flex-col border-b border-[#e9edef] pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${missed ? "text-[#ea0038]" : "text-[#111b21]"}`}>{name}</span>
                    <span className="shrink-0 text-xs text-[#667781]">
                      {formatChatListTime(conv.last_message!.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-sm text-[#667781]">
                      <Icon className={`h-3.5 w-3.5 ${missed ? "text-[#ea0038]" : "text-[#25d366]"}`} />
                      {missed ? "שיחה שלא נענתה" : incoming ? "שיחה נכנסת" : "שיחה יוצאת"}
                      {video ? " · וידאו" : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCall(conv, false)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5"
                        aria-label="התקשר"
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onCall(conv, true)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[#54656f] hover:bg-black/5"
                        aria-label="שיחת וידאו"
                      >
                        <Video className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
