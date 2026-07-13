"use client"

import { useEffect, useRef, useState, type MouseEvent } from "react"
import type { Message, Participant } from "@/lib/types"
import { formatTime, formatFileSize, avatarColor } from "@/lib/format"
import { callSystemLabel, parseCallSystemPayload } from "@/lib/call-system-message"
import { MessageTicks } from "./message-ticks"
import { VoiceMessage } from "./voice-message"
import { resolveMediaKind } from "./media-gallery"
import {
  Ban,
  FileText,
  Download,
  Trash2,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Video,
  ChevronDown,
  Reply,
  Copy,
  SmilePlus,
  Forward,
  Pin,
  Star,
  ThumbsDown,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"

const QUICK_REACTIONS = ["🙏", "😢", "😲", "😂", "❤️", "👍"]

type Props = {
  message: Message
  isMine: boolean
  isGroup: boolean
  showSenderName: boolean
  participants: Participant[]
  totalOthers: number
  onDelete?: () => void
  onReply?: () => void
  onOpenMedia?: (messageId: string) => void
  currentUserAvatarUrl?: string | null
  currentUserName?: string | null
}

function SystemCallMessage({ message }: { message: Message }) {
  const payload = parseCallSystemPayload(message.content)
  const label = payload ? callSystemLabel(payload) : (message.content ?? "הודעת מערכת")
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
        ? "text-[#667781]"
        : "text-[#00a884]"

  return (
    <div className="my-2 flex justify-center px-2">
      <div className="inline-flex max-w-[90%] items-center gap-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-[#54656f] shadow-sm">
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

function copyMessageText(message: Message) {
  const parts: string[] = []
  if (message.content) parts.push(message.content)
  if (message.file_name) parts.push(message.file_name)
  if (message.file_url && !message.content && !message.file_name) parts.push(message.file_url)
  const text = parts.join("\n").trim()
  if (!text) return
  void navigator.clipboard.writeText(text)
}

export function MessageBubble({
  message,
  isMine,
  isGroup,
  showSenderName,
  participants,
  totalOthers,
  onDelete,
  onReply,
  onOpenMedia,
  currentUserAvatarUrl,
  currentUserName,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [reaction, setReaction] = useState<string | null>(null)
  const [showMoreEmoji, setShowMoreEmoji] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const senderProfile = participants.find((p) => p.user_id === message.sender_id)?.profile
  const senderName = senderProfile?.display_name ?? senderProfile?.email ?? "משתמש"

  const readCount = (message.reads ?? []).filter((r) => r.user_id !== message.sender_id).length
  let status: "sent" | "delivered" | "read" = "sent"
  if (readCount > 0) status = readCount >= totalOthers && totalOthers > 0 ? "read" : "delivered"

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false)
        setShowMoreEmoji(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuOpen])

  if (message.type === "system") {
    return <SystemCallMessage message={message} />
  }

  // direction:ltr so left/right are physical: mine=left, theirs=right
  if (message.deleted_at) {
    return (
      <div className={cn("flex px-2", isMine ? "justify-start" : "justify-end")} dir="ltr">
        <div
          className={cn(
            "relative my-0.5 max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm",
            isMine ? "bubble-tail-out rounded-tl-none bg-[#d9fdd3]" : "bubble-tail-in rounded-tr-none bg-white",
          )}
          dir="rtl"
        >
          <span className="flex items-center gap-1.5 italic text-[14px] text-[#667781]">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            ההודעה נמחקה
          </span>
          <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-[#667781]" dir="ltr">
            {formatTime(message.created_at)}
            {isMine && <MessageTicks status={status} />}
          </span>
        </div>
      </div>
    )
  }

  const openMedia = (e?: MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    if (onOpenMedia && message.file_url) onOpenMedia(message.id)
  }

  const mediaKind = message.file_url
    ? resolveMediaKind(message.type, message.file_name, message.file_url)
    : null

  const openMenu = () => {
    setShowMoreEmoji(false)
    setMenuOpen(true)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setShowMoreEmoji(false)
  }

  const pickReaction = (emoji: string) => {
    setReaction((prev) => (prev === emoji ? null : emoji))
    closeMenu()
  }

  const menuItems = [
    {
      id: "reply",
      label: "תגובה",
      icon: Reply,
      onClick: () => {
        closeMenu()
        onReply?.()
      },
    },
    {
      id: "copy",
      label: "העתקה",
      icon: Copy,
      onClick: () => {
        copyMessageText(message)
        closeMenu()
      },
    },
    {
      id: "emoji",
      label: "הוספת אימוג'י",
      icon: SmilePlus,
      onClick: () => setShowMoreEmoji(true),
    },
    {
      id: "forward",
      label: "העברה",
      icon: Forward,
      onClick: closeMenu,
    },
    {
      id: "pin",
      label: "הצמדה",
      icon: Pin,
      onClick: closeMenu,
    },
    {
      id: "star",
      label: "סימון בכוכב",
      icon: Star,
      onClick: closeMenu,
    },
  ] as const

  return (
    <div className={cn("group relative flex px-2", isMine ? "justify-start" : "justify-end")} dir="ltr">
      <div
        className={cn(
          "relative my-0.5 max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm",
          isMine ? "bubble-tail-out rounded-tl-none bg-[#d9fdd3]" : "bubble-tail-in rounded-tr-none bg-white",
          menuOpen && "z-20",
        )}
        dir="rtl"
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu()
        }}
      >
        {isGroup && !isMine && showSenderName && (
          <div className="mb-0.5 text-xs font-medium" style={{ color: avatarColor(senderName) }}>
            {senderName}
          </div>
        )}

        {mediaKind === "image" && message.file_url && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 block w-full max-w-xs overflow-hidden rounded-md text-right"
          >
            <img
              src={message.file_url || "/placeholder.svg"}
              alt="תמונה"
              className="max-h-80 w-full cursor-pointer object-cover transition hover:brightness-95"
            />
          </button>
        )}

        {mediaKind === "video" && message.file_url && (
          <button
            type="button"
            onClick={openMedia}
            className="relative mb-1 block w-full max-w-xs overflow-hidden rounded-md text-right"
          >
            <video
              src={message.file_url}
              className="max-h-80 w-full cursor-pointer object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
                <Video className="h-6 w-6" />
              </span>
            </span>
          </button>
        )}

        {message.type === "audio" && message.file_url && (
          <VoiceMessage
            url={message.file_url}
            messageId={message.id}
            isMine={isMine}
            timeLabel={formatTime(message.created_at)}
            status={status}
            avatarUrl={isMine ? currentUserAvatarUrl : senderProfile?.avatar_url}
            avatarName={isMine ? currentUserName : senderName}
          />
        )}

        {mediaKind === "file" && message.file_url && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 flex w-full items-center gap-3 rounded-md bg-black/5 p-2.5 text-right transition hover:bg-black/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884]/15">
              <FileText className="h-5 w-5 text-[#00a884]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-[#111b21]">{message.file_name}</div>
              <div className="text-xs text-[#667781]">{message.file_size ? formatFileSize(message.file_size) : ""}</div>
            </div>
            <Download className="h-4 w-4 shrink-0 text-[#667781]" />
          </button>
        )}

        {message.content && message.type !== "audio" && (
          <span className="whitespace-pre-wrap break-words text-[15px] leading-[19px] text-[#111b21]">
            {message.content}
          </span>
        )}

        {message.type !== "audio" && (
          <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-[#667781]" dir="ltr">
            {formatTime(message.created_at)}
            {isMine && <MessageTicks status={status} />}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (menuOpen) closeMenu()
            else openMenu()
          }}
          className={cn(
            "absolute top-0.5 rounded-bl-md rounded-tr-md bg-gradient-to-bl from-black/10 to-transparent p-0.5 text-[#54656f] transition",
            isMine ? "left-0.5" : "right-0.5",
            menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
          aria-label="אפשרויות הודעה"
          aria-expanded={menuOpen}
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {reaction && (
          <span className="absolute -bottom-2 right-2 z-10 rounded-full bg-white px-1.5 py-0.5 text-sm shadow ring-1 ring-black/5">
            {reaction}
          </span>
        )}
      </div>

      {menuOpen && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="סגור" onClick={closeMenu} />
          <div
            ref={menuRef}
            className={cn(
              "absolute z-40 flex flex-col items-stretch gap-1",
              isMine ? "left-2 top-0" : "right-2 top-0",
            )}
            dir="rtl"
          >
            {/* Reaction bar */}
            <div className="flex items-center gap-0.5 rounded-full bg-white px-1.5 py-1 shadow-lg ring-1 ring-black/5">
              <button
                type="button"
                onClick={() => setShowMoreEmoji((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#54656f] transition hover:bg-[#f0f2f5]"
                aria-label="עוד תגובות"
              >
                <Plus className="h-4 w-4" />
              </button>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => pickReaction(emoji)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:bg-[#f0f2f5] hover:scale-110",
                    reaction === emoji && "bg-[#e7fce3]",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {showMoreEmoji && (
              <div className="grid grid-cols-6 gap-0.5 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/5">
                {["😀", "😍", "🥰", "😎", "🤔", "😡", "🔥", "🎉", "💯", "😴", "🤗", "👏", "😮", "🤣", "💔", "✨", "👀", "💪"].map(
                  (emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => pickReaction(emoji)}
                      className="rounded-lg p-1.5 text-lg transition hover:bg-[#f0f2f5]"
                    >
                      {emoji}
                    </button>
                  ),
                )}
              </div>
            )}

            {/* Context menu */}
            <div className="min-w-[200px] overflow-hidden rounded-xl bg-white py-1.5 shadow-lg ring-1 ring-black/5">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[#111b21] transition hover:bg-[#f5f6f6]"
                  onClick={item.onClick}
                >
                  <span>{item.label}</span>
                  <item.icon className="h-[18px] w-[18px] shrink-0 text-[#54656f]" strokeWidth={1.75} />
                </button>
              ))}

              <div className="my-1 border-t border-[#e9edef]" />

              <button
                type="button"
                className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[#111b21] transition hover:bg-[#f5f6f6]"
                onClick={closeMenu}
              >
                <span>דיווח</span>
                <ThumbsDown className="h-[18px] w-[18px] shrink-0 text-[#54656f]" strokeWidth={1.75} />
              </button>

              {onDelete && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[#111b21] transition hover:bg-[#f5f6f6]"
                  onClick={() => {
                    closeMenu()
                    onDelete()
                  }}
                >
                  <span>מחיקה</span>
                  <Trash2 className="h-[18px] w-[18px] shrink-0 text-[#54656f]" strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
