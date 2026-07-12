"use client"

import type { Conversation, Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import { convAvatarUrl, convDisplayName, messagePreview } from "@/lib/conversation-display"
import { formatChatListTime } from "@/lib/format"
import { MessageTicks } from "./message-ticks"
import { Search, X } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

type Props = {
  conversations: Conversation[]
  loading: boolean
  currentUser: Profile
  activeId: string | null
  onSelect: (conv: Conversation) => void
}

export function ChatList({ conversations, loading, currentUser, activeId, onSelect }: Props) {
  const [query, setQuery] = useState("")

  const filtered = conversations.filter((c) =>
    convDisplayName(c, currentUser.id).toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* search */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex flex-1 items-center gap-3 rounded-lg bg-[#f0f2f5] px-4 py-1.5">
          <Search className="h-4 w-4 text-[#54656f]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש או התחלת צ'אט חדש"
            className="flex-1 bg-transparent py-1 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="נקה">
              <X className="h-4 w-4 text-[#54656f]" />
            </button>
          )}
        </div>
      </div>

      {/* list */}
      <div className="wa-scroll flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-[#667781]">טוען צ'אטים...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#667781]">
            {query ? "לא נמצאו תוצאות" : "אין צ'אטים עדיין. התחל שיחה חדשה!"}
          </div>
        ) : (
          filtered.map((conv) => {
            const name = convDisplayName(conv, currentUser.id)
            const last = conv.last_message
            const isMine = last?.sender_id === currentUser.id
            const isActive = conv.id === activeId
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-3 text-right transition hover:bg-[#f5f6f6]",
                  isActive && "bg-[#f0f2f5]",
                )}
              >
                <Avatar
                  name={name}
                  url={convAvatarUrl(conv, currentUser.id)}
                  isGroup={conv.is_group}
                  size={49}
                />
                <div className="flex min-w-0 flex-1 flex-col border-b border-[#e9edef] pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[#111b21]">{name}</span>
                    {last && (
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          conv.unread_count ? "text-[#25d366]" : "text-[#667781]",
                        )}
                      >
                        {formatChatListTime(last.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate text-sm text-[#667781]">
                      {isMine && last && <MessageTicks status="delivered" />}
                      <span className="truncate">{messagePreview(last)}</span>
                    </span>
                    {!!conv.unread_count && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-xs font-medium text-white">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
