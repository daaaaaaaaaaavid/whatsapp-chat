"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Conversation, Profile } from "@/lib/types"
import { useMessages } from "@/lib/use-messages"
import { createClient } from "@/lib/supabase/client"
import { Avatar } from "./avatar"
import { MessageBubble } from "./message-bubble"
import { MessageInput } from "./message-input"
import { convAvatarUrl, convDisplayName } from "@/lib/conversation-display"
import { formatDateDivider, formatChatListTime } from "@/lib/format"
import { ArrowRight, Search, MoreVertical, Lock, X } from "lucide-react"

type Props = {
  conversation: Conversation
  currentUser: Profile
  onBack: () => void
  onOpenInfo: () => void
}

export function ConversationView({ conversation, currentUser, onBack, onOpenInfo }: Props) {
  const { messages, loading, reload } = useMessages(conversation.id, currentUser.id)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const otherParticipants = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const totalOthers = otherParticipants.length

  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)

  const other = otherParticipants[0]?.profile
  const subtitle = conversation.is_group
    ? (conversation.participants ?? [])
        .map((p) => (p.user_id === currentUser.id ? "אתה" : p.profile?.display_name ?? "משתמש"))
        .join(", ")
    : other?.last_seen
      ? `נראה לאחרונה ${formatChatListTime(other.last_seen)}`
      : (other?.about ?? "זמין")

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" })
  }, [messages.length])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery("")
  }, [conversation.id])

  useEffect(() => {
    const unread = messages.filter(
      (m) => m.sender_id !== currentUser.id && !(m.reads ?? []).some((r) => r.user_id === currentUser.id),
    )
    if (unread.length === 0) return
    const supabase = createClient()
    supabase
      .from("message_reads")
      .upsert(
        unread.map((m) => ({ message_id: m.id, user_id: currentUser.id })),
        { onConflict: "message_id,user_id" },
      )
      .then(() => {})
  }, [messages, currentUser.id])

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return messages
    return messages.filter((m) => (m.content ?? "").toLowerCase().includes(q) || (m.file_name ?? "").toLowerCase().includes(q))
  }, [messages, searchQuery])

  const grouped = useMemo(() => {
    let lastDate = ""
    let lastSender = ""
    return filteredMessages.map((m) => {
      const dateKey = new Date(m.created_at).toDateString()
      const showDivider = dateKey !== lastDate
      lastDate = dateKey
      const showSenderName = m.sender_id !== lastSender || showDivider
      lastSender = m.sender_id
      return { message: m, showDivider, showSenderName }
    })
  }, [filteredMessages])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 items-center gap-3 bg-[#f0f2f5] px-4">
        <button onClick={onBack} className="text-[#54656f] md:hidden" aria-label="חזרה">
          <ArrowRight className="h-6 w-6" />
        </button>
        <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 text-right">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} size={40} />
          <div className="min-w-0">
            <div className="truncate font-medium text-[#111b21]">{name}</div>
            <div className="truncate text-xs text-[#667781]">{subtitle}</div>
          </div>
        </button>
        <div className="flex items-center gap-1 text-[#54656f]">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="חיפוש"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={onOpenInfo}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="פרטים"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-[#e9edef] bg-white px-4 py-2">
          <Search className="h-4 w-4 shrink-0 text-[#54656f]" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש בהודעות"
            className="flex-1 bg-transparent py-1.5 text-sm text-[#111b21] outline-none placeholder:text-[#667781]"
          />
          <button
            onClick={() => {
              setSearchQuery("")
              setSearchOpen(false)
            }}
            aria-label="סגור חיפוש"
            className="text-[#54656f]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="wa-chat-bg wa-scroll flex-1 overflow-y-auto px-[5%] py-4">
        <div className="mx-auto flex max-w-3xl flex-col">
          <div className="mx-auto mb-4 flex items-center gap-1.5 rounded-lg bg-[#fdf4c5] px-3 py-1.5 text-center text-xs text-[#54656f] shadow-sm">
            <Lock className="h-3 w-3" />
            ההודעות מוצפנות מקצה לקצה
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-[#667781]">טוען הודעות...</div>
          ) : filteredMessages.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#667781]">
              {searchQuery
                ? "לא נמצאו הודעות התואמות לחיפוש"
                : "אין הודעות עדיין. שלח את ההודעה הראשונה!"}
            </div>
          ) : (
            grouped.map(({ message, showDivider, showSenderName }) => (
              <div key={message.id}>
                {showDivider && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-lg bg-white px-3 py-1 text-xs text-[#54656f] shadow-sm">
                      {formatDateDivider(message.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isMine={message.sender_id === currentUser.id}
                  isGroup={conversation.is_group}
                  showSenderName={showSenderName}
                  participants={conversation.participants ?? []}
                  totalOthers={totalOthers}
                />
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {!searchOpen && (
        <MessageInput conversationId={conversation.id} currentUserId={currentUser.id} onSent={reload} />
      )}
    </div>
  )
}
