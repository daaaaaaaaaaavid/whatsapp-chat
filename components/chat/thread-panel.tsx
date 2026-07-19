"use client"

import { useEffect, useMemo, useRef } from "react"
import type { Conversation, Message, Profile } from "@/lib/types"
import {
  hideMessageForMe,
  setMessageReaction,
  togglePinnedMessage,
  toggleStarredMessage,
  type ChatPrefs,
} from "@/lib/chat-prefs"
import { getThreadReplies } from "@/lib/message-thread"
import { MessageBubble } from "./message-bubble"
import { MessageInput } from "./message-input"
import { X, MessagesSquare } from "lucide-react"

type Props = {
  root: Message
  messages: Message[]
  conversation: Conversation
  currentUser: Profile
  prefs: ChatPrefs
  onPrefsChange: (next: ChatPrefs) => void
  onClose: () => void
  onDeleteForEveryone: (messageId: string) => void
  onOpenMedia?: (messageId: string) => void
  onOpenViewOnce?: (messageId: string) => void
  onOptimistic: (message: Message) => void
  onSent: (message: Message, tempId: string) => void
  onSendFailed?: (tempId: string) => void
  onEdited: (message: Message) => void
  onTyping?: (typing: boolean) => void
  onForward?: (message: Message) => void
  onStartChatByEmail?: (email: string) => Promise<void>
}

export function ThreadPanel({
  root,
  messages,
  conversation,
  currentUser,
  prefs,
  onPrefsChange,
  onClose,
  onDeleteForEveryone,
  onOpenMedia,
  onOpenViewOnce,
  onOptimistic,
  onSent,
  onSendFailed,
  onEdited,
  onTyping,
  onForward,
  onStartChatByEmail,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const replies = useMemo(
    () =>
      getThreadReplies(root.id, messages).filter(
        (m) => !prefs.hiddenMessages.includes(m.id),
      ),
    [root.id, messages, prefs.hiddenMessages],
  )

  const totalOthers = (conversation.participants ?? []).filter(
    (p) => p.user_id !== currentUser.id,
  ).length

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
  }, [replies.length, root.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const renderBubble = (message: Message, showSenderName: boolean) => (
    <MessageBubble
      key={message.id}
      message={message}
      isMine={message.sender_id === currentUser.id}
      isGroup={conversation.is_group}
      showSenderName={showSenderName}
      participants={conversation.participants ?? []}
      totalOthers={totalOthers}
      onDeleteForEveryone={
        message.sender_id === currentUser.id && message.type !== "system"
          ? () => onDeleteForEveryone(message.id)
          : undefined
      }
      onDeleteForMe={() => onPrefsChange(hideMessageForMe(prefs, message.id))}
      onForward={
        onForward && !message.view_once ? () => onForward(message) : undefined
      }
      onToggleStar={() => onPrefsChange(toggleStarredMessage(prefs, message.id))}
      onTogglePin={() => onPrefsChange(togglePinnedMessage(prefs, message.id))}
      onReaction={(emoji) => onPrefsChange(setMessageReaction(prefs, message.id, emoji))}
      onOpenMedia={onOpenMedia}
      onOpenViewOnce={onOpenViewOnce}
      currentUserAvatarUrl={currentUser.avatar_url}
      currentUserName={currentUser.display_name}
      currentUserId={currentUser.id}
      reaction={prefs.reactions[message.id] ?? null}
      isStarred={prefs.starredMessages.includes(message.id)}
      isPinned={prefs.pinnedMessages.includes(message.id)}
      onStartChatByEmail={onStartChatByEmail}
      compact
    />
  )

  let lastSender = ""

  return (
    <aside
      className="flex h-full w-full min-w-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] shadow-[-8px_0_24px_rgba(11,20,26,0.08)] lg:w-[min(100%,400px)] lg:min-w-[340px] lg:max-w-[400px]"
      dir="rtl"
      aria-label="שרשור"
    >
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-black/5"
          aria-label="סגור שרשור"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] text-[#00a884]">
            <MessagesSquare className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 text-right">
            <div className="truncate text-[16px] font-medium text-[var(--wa-text)]">שרשור</div>
            <div className="truncate text-xs text-[var(--wa-text-secondary)]">
              {replies.length === 0
                ? "אין תגובות עדיין"
                : replies.length === 1
                  ? "תגובה אחת"
                  : `${replies.length} תגובות`}
            </div>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="wa-chat-bg wa-scroll flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-4 rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-black/5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8696a0]">
            הודעה מקורית
          </div>
          {renderBubble(root, true)}
        </div>

        {replies.length > 0 && (
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className="h-px flex-1 bg-[#d1d7db]" />
            <span className="shrink-0 text-[11px] font-medium text-[var(--wa-text-secondary)]">
              {replies.length === 1 ? "תגובה" : `${replies.length} תגובות`}
            </span>
            <div className="h-px flex-1 bg-[#d1d7db]" />
          </div>
        )}

        <div className="flex flex-col gap-1">
          {replies.map((message) => {
            const isSystem = message.type === "system"
            const showSenderName = !isSystem && message.sender_id !== lastSender
            if (!isSystem) lastSender = message.sender_id
            return (
              <div key={message.id} data-thread-message-id={message.id}>
                {renderBubble(message, showSenderName)}
              </div>
            )
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-[var(--wa-border)] bg-[var(--wa-header)]">
        <MessageInput
          conversationId={conversation.id}
          currentUserId={currentUser.id}
          onOptimistic={onOptimistic}
          onSent={onSent}
          onSendFailed={onSendFailed}
          replyTo={root}
          replyAuthor={
            root.sender_id === currentUser.id
              ? "אתה"
              : (conversation.participants ?? []).find((p) => p.user_id === root.sender_id)?.profile
                  ?.display_name ?? "משתמש"
          }
          keepReplyAfterSend
          threadMode
          onEdited={onEdited}
          onTyping={onTyping}
        />
      </div>
    </aside>
  )
}
