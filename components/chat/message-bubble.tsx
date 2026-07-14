"use client"

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import type { Message, Participant } from "@/lib/types"
import { formatTime, formatFileSize, avatarColor } from "@/lib/format"
import { callSystemLabel, parseCallSystemPayload } from "@/lib/call-system-message"
import { extractUrls, highlightQuery, parseReplyContent, splitTextWithLinks } from "@/lib/message-content"
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
  MessagesSquare,
  Copy,
  SmilePlus,
  Forward,
  Pin,
  Star,
  ThumbsDown,
  Plus,
  EyeOff,
  Pencil,
  CheckSquare,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"

type MenuPlacement = {
  top?: number
  bottom?: number
  left?: number
  right?: number
  maxHeight: number
}

const QUICK_REACTIONS = ["🙏", "😢", "😲", "😂", "❤️", "👍"]

type Props = {
  message: Message
  isMine: boolean
  isGroup: boolean
  showSenderName: boolean
  participants: Participant[]
  totalOthers: number
  onDeleteForEveryone?: () => void
  onDeleteForMe?: () => void
  onReply?: () => void
  /** Google Chat–style: open / reply in side thread (groups). */
  onReplyInThread?: () => void
  onOpenThread?: () => void
  threadReplyCount?: number
  threadPreview?: string | null
  onForward?: () => void
  onEdit?: () => void
  onToggleStar?: () => void
  onTogglePin?: () => void
  onReaction?: (emoji: string | null) => void
  onOpenMedia?: (messageId: string) => void
  onStartSelect?: () => void
  onToggleSelect?: () => void
  selectionMode?: boolean
  isSelected?: boolean
  currentUserAvatarUrl?: string | null
  currentUserName?: string | null
  reaction?: string | null
  isStarred?: boolean
  isPinned?: boolean
  searchQuery?: string
  /** Narrower panel (thread side pane). */
  compact?: boolean
}

function SystemCallMessage({ message }: { message: Message }) {
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

function MessageText({
  text,
  searchQuery,
}: {
  text: string
  searchQuery?: string
}) {
  const parts = splitTextWithLinks(text)
  return (
    <span className="whitespace-pre-wrap break-words text-[15px] leading-[19px] text-[var(--wa-text)]">
      {parts.map((p, i) => {
        if (p.type === "link") {
          return (
            <a
              key={i}
              href={p.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#027eb5] underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {p.value}
            </a>
          )
        }
        if (!searchQuery?.trim()) return <span key={i}>{p.value}</span>
        return (
          <span key={i}>
            {highlightQuery(p.value, searchQuery).map((h, j) =>
              h.hit ? (
                <mark key={j} className="rounded-sm bg-[#f6e59c] px-0.5 text-inherit">
                  {h.text}
                </mark>
              ) : (
                <span key={j}>{h.text}</span>
              ),
            )}
          </span>
        )
      })}
    </span>
  )
}

function LinkPreview({ url }: { url: string }) {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    // keep raw
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 mt-1 block overflow-hidden rounded-md border border-black/10 bg-black/[0.03] text-right transition hover:bg-black/[0.06]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-r-4 border-[#00a884] px-3 py-2">
        <div className="truncate text-xs font-medium text-[#027eb5]" dir="ltr">
          {host}
        </div>
        <div className="truncate text-[13px] text-[var(--wa-text-secondary)]" dir="ltr">
          {url}
        </div>
      </div>
    </a>
  )
}

function replyPreviewText(message: Message) {
  if (message.deleted_at) return "הודעה שנמחקה"
  if (message.type === "image") return "תמונה"
  if (message.type === "video") return "סרטון"
  if (message.type === "audio") return "הודעה קולית"
  if (message.type === "file") return message.file_name ?? "קובץ"
  const call = parseCallSystemPayload(message.content)
  if (call) return callSystemLabel(call)
  const legacy = parseReplyContent(message.content)
  if (legacy?.body) return legacy.body
  if (message.content) return message.content
  return "הודעה"
}

function copyMessageText(message: Message) {
  const reply = parseReplyContent(message.content)
  const body = message.reply_to_id ? message.content : (reply?.body ?? message.content)
  const parts: string[] = []
  if (body) parts.push(body)
  if (message.file_name) parts.push(message.file_name)
  if (message.file_url && !body && !message.file_name) parts.push(message.file_url)
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
  onDeleteForEveryone,
  onDeleteForMe,
  onReply,
  onReplyInThread,
  onOpenThread,
  threadReplyCount = 0,
  threadPreview,
  onForward,
  onEdit,
  onToggleStar,
  onTogglePin,
  onReaction,
  onOpenMedia,
  onStartSelect,
  onToggleSelect,
  selectionMode,
  isSelected,
  currentUserAvatarUrl,
  currentUserName,
  reaction: reactionProp,
  isStarred,
  isPinned,
  searchQuery,
  compact,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMoreEmoji, setShowMoreEmoji] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuPlacement, setMenuPlacement] = useState<MenuPlacement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const senderProfile = participants.find((p) => p.user_id === message.sender_id)?.profile
  const senderName = senderProfile?.display_name ?? senderProfile?.email ?? "משתמש"

  const reaction = reactionProp ?? null
  const callPayload = parseCallSystemPayload(message.content)

  const readCount = (message.reads ?? []).filter((r) => r.user_id !== message.sender_id).length
  let status: "sending" | "sent" | "delivered" | "read" = "sent"
  if (message.pending || message.id.startsWith("temp-")) status = "sending"
  else if (readCount > 0) status = readCount >= totalOthers && totalOthers > 0 ? "read" : "delivered"

  const updateMenuPlacement = () => {
    const el = bubbleRef.current
    if (!el || typeof window === "undefined") return
    const rect = el.getBoundingClientRect()
    const margin = 8
    const estimatedHeight = showMoreEmoji ? 520 : 420
    const spaceBelow = window.innerHeight - rect.bottom - margin
    const spaceAbove = rect.top - margin
    const placeAbove = spaceBelow < Math.min(estimatedHeight, 280) && spaceAbove > spaceBelow
    const maxHeight = Math.max(160, placeAbove ? spaceAbove : spaceBelow)
    const next: MenuPlacement = {
      maxHeight,
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      ...(isMine
        ? { left: Math.min(Math.max(margin, rect.left), window.innerWidth - 240) }
        : { right: Math.min(Math.max(margin, window.innerWidth - rect.right), window.innerWidth - 240) }),
    }
    setMenuPlacement(next)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setShowMoreEmoji(false)
    setConfirmDelete(false)
    setMenuPlacement(null)
  }

  const openMenu = () => {
    if (selectionMode) return
    setShowMoreEmoji(false)
    setConfirmDelete(false)
    setMenuOpen(true)
  }

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPlacement(null)
      return
    }
    updateMenuPlacement()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu()
    }
    const onReposition = () => updateMenuPlacement()
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", onReposition)
    window.addEventListener("scroll", onReposition, true)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onReposition)
      window.removeEventListener("scroll", onReposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, showMoreEmoji, isMine, selectionMode])

  useEffect(() => {
    return () => {
      if (longPressRef.current) clearTimeout(longPressRef.current)
    }
  }, [])

  if (message.type === "system" || callPayload) {
    return <SystemCallMessage message={message} />
  }

  if (message.deleted_at) {
    return (
      <div className={cn("flex px-2", isMine ? "justify-start" : "justify-end")} dir="ltr">
        <div
          className={cn(
            "relative my-0.5 max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm",
            isMine ? "bubble-tail-out rounded-tl-none bg-[var(--wa-bubble-out)]" : "bubble-tail-in rounded-tr-none bg-[var(--wa-panel)]",
          )}
          dir="rtl"
        >
          <span className="flex items-center gap-1.5 italic text-[14px] text-[var(--wa-text-secondary)]">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            ההודעה נמחקה
          </span>
          <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-[var(--wa-text-secondary)]" dir="ltr">
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
    if (selectionMode) {
      onToggleSelect?.()
      return
    }
    if (onOpenMedia && message.file_url) onOpenMedia(message.id)
  }

  const mediaKind = message.file_url
    ? resolveMediaKind(message.type, message.file_name, message.file_url)
    : null

  const legacyReply = parseReplyContent(message.content)
  const structuredTarget = message.reply_to
  const structuredAuthor = structuredTarget
    ? (participants.find((p) => p.user_id === structuredTarget.sender_id)?.profile?.display_name ??
        participants.find((p) => p.user_id === structuredTarget.sender_id)?.profile?.email ??
        "משתמש")
    : null
  const reply = structuredTarget
    ? {
        author: structuredAuthor ?? "משתמש",
        preview: replyPreviewText(structuredTarget),
        body: message.content ?? "",
      }
    : legacyReply
  const bodyText = structuredTarget ? message.content : (legacyReply?.body ?? message.content)
  const urls = bodyText ? extractUrls(bodyText) : []
  const canEdit =
    isMine &&
    Boolean(onEdit) &&
    !message.pending &&
    !message.id.startsWith("temp-") &&
    (message.type === "text" || Boolean(bodyText?.trim()))

  const pickReaction = (emoji: string) => {
    const next = reaction === emoji ? null : emoji
    onReaction?.(next)
    closeMenu()
  }

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const onPointerDownSelect = () => {
    if (selectionMode || !onStartSelect) return
    clearLongPress()
    longPressRef.current = setTimeout(() => {
      onStartSelect()
    }, 450)
  }

  const menuItems = [
    ...(onReply
      ? [
          {
            id: "reply" as const,
            label: "תשובה",
            icon: Reply,
            onClick: () => {
              closeMenu()
              onReply()
            },
          },
        ]
      : []),
    ...(onReplyInThread
      ? [
          {
            id: "thread" as const,
            label: "תשובה בשרשור",
            icon: MessagesSquare,
            onClick: () => {
              closeMenu()
              onReplyInThread()
            },
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            id: "edit" as const,
            label: "עריכה",
            icon: Pencil,
            onClick: () => {
              closeMenu()
              onEdit?.()
            },
          },
        ]
      : []),
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
    ...(onForward
      ? [
          {
            id: "forward" as const,
            label: "העברה",
            icon: Forward,
            onClick: () => {
              closeMenu()
              onForward()
            },
          },
        ]
      : []),
    ...(onStartSelect
      ? [
          {
            id: "select" as const,
            label: "בחירה",
            icon: CheckSquare,
            onClick: () => {
              closeMenu()
              onStartSelect()
            },
          },
        ]
      : []),
    {
      id: "pin",
      label: isPinned ? "ביטול הצמדה" : "הצמדה",
      icon: Pin,
      onClick: () => {
        closeMenu()
        onTogglePin?.()
      },
    },
    {
      id: "star",
      label: isStarred ? "הסר כוכב" : "סימון בכוכב",
      icon: Star,
      onClick: () => {
        closeMenu()
        onToggleStar?.()
      },
    },
  ]

  const replyCountLabel =
    threadReplyCount === 1 ? "תגובה אחת" : `${threadReplyCount} תגובות`

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1 px-2",
        isMine ? "items-start" : "items-end",
        selectionMode && isSelected && "rounded-lg bg-[#00a884]/10",
      )}
      dir="ltr"
      onClick={() => {
        if (selectionMode) onToggleSelect?.()
      }}
    >
      <div
        className={cn(
          "flex w-full items-center gap-2",
          isMine ? "justify-start" : "justify-end",
        )}
      >
      {selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.()
          }}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
            isSelected ? "border-[#00a884] bg-[#00a884] text-white" : "border-[#8696a0] bg-[var(--wa-panel)]",
            isMine ? "order-first" : "order-last",
          )}
          aria-label={isSelected ? "בטל בחירה" : "בחר הודעה"}
          aria-pressed={isSelected}
        >
          {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
      )}

      <div
        ref={bubbleRef}
        className={cn(
          "relative my-0.5 rounded-lg px-2.5 py-1.5 shadow-sm",
          compact ? "max-w-[95%]" : "max-w-[65%]",
          isMine ? "bubble-tail-out rounded-tl-none bg-[var(--wa-bubble-out)]" : "bubble-tail-in rounded-tr-none bg-[var(--wa-panel)]",
          menuOpen && "z-20",
          isPinned && "ring-1 ring-[#00a884]/40",
        )}
        dir="rtl"
        onContextMenu={(e) => {
          e.preventDefault()
          if (selectionMode) {
            onToggleSelect?.()
            return
          }
          openMenu()
        }}
        onPointerDown={onPointerDownSelect}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
      >
        {isGroup && !isMine && showSenderName && (
          <div className="mb-0.5 text-xs font-medium" style={{ color: avatarColor(senderName) }}>
            {senderName}
          </div>
        )}

        {message.is_forwarded && (
          <div className="mb-0.5 flex items-center gap-1 text-[11px] italic text-[var(--wa-text-secondary)]">
            <Forward className="h-3 w-3 shrink-0" />
            הועבר
          </div>
        )}

        {reply && (
          <div className="mb-1 rounded-md border-r-4 border-[#06cf9c] bg-black/[0.06] px-2 py-1.5 text-right">
            <div className="truncate text-xs font-medium text-[#06cf9c]">{reply.author}</div>
            <div className="truncate text-[12px] text-[var(--wa-text-secondary)]">{reply.preview || "הודעה"}</div>
          </div>
        )}

        {mediaKind === "image" && message.file_url && (
          <button
            type="button"
            onClick={openMedia}
            className="mb-1 block w-full max-w-xs overflow-hidden rounded-md text-right"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
              <div className="truncate text-sm text-[var(--wa-text)]">{message.file_name}</div>
              <div className="text-xs text-[var(--wa-text-secondary)]">
                {message.file_size ? formatFileSize(message.file_size) : ""}
              </div>
            </div>
            <Download className="h-4 w-4 shrink-0 text-[var(--wa-text-secondary)]" />
          </button>
        )}

        {bodyText && message.type !== "audio" && (
          <MessageText text={bodyText} searchQuery={searchQuery} />
        )}

        {urls[0] && message.type === "text" && <LinkPreview url={urls[0]} />}

        {message.type !== "audio" && (
          <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[11px] text-[var(--wa-text-secondary)]" dir="ltr">
            {isStarred && <Star className="h-3 w-3 fill-[#eab308] text-[#eab308]" />}
            {isPinned && <Pin className="h-3 w-3 text-[#00a884]" />}
            {message.edited_at && <span className="text-[10px]">נערך</span>}
            {formatTime(message.created_at)}
            {isMine && <MessageTicks status={status} />}
          </span>
        )}

        {!selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (menuOpen) closeMenu()
              else openMenu()
            }}
            className={cn(
              "absolute top-0.5 rounded-bl-md rounded-tr-md bg-gradient-to-bl from-black/10 to-transparent p-0.5 text-[var(--wa-text-secondary)] transition",
              isMine ? "left-0.5" : "right-0.5",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label="אפשרויות הודעה"
            aria-expanded={menuOpen}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}

        {reaction && (
          <span className="absolute -bottom-2 right-2 z-10 rounded-full bg-[var(--wa-panel)] px-1.5 py-0.5 text-sm shadow ring-1 ring-black/5">
            {reaction}
          </span>
        )}
      </div>

      {menuOpen &&
        !selectionMode &&
        menuPlacement &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] cursor-default"
              aria-label="סגור"
              onClick={closeMenu}
            />
            <div
              ref={menuRef}
              className="fixed z-[100] flex max-w-[min(92vw,280px)] flex-col items-stretch gap-1 overflow-y-auto"
              style={
                {
                  top: menuPlacement.top,
                  bottom: menuPlacement.bottom,
                  left: menuPlacement.left,
                  right: menuPlacement.right,
                  maxHeight: menuPlacement.maxHeight,
                } satisfies CSSProperties
              }
              dir="rtl"
            >
              <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--wa-panel)] px-1.5 py-1 shadow-lg ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => setShowMoreEmoji((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--wa-text-secondary)] transition hover:bg-[var(--wa-header)]"
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
                      "flex h-8 w-8 items-center justify-center rounded-full text-lg transition hover:scale-110 hover:bg-[var(--wa-header)]",
                      reaction === emoji && "bg-[var(--wa-accent-soft)]",
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {showMoreEmoji && (
                <div className="grid shrink-0 grid-cols-6 gap-0.5 rounded-2xl bg-[var(--wa-panel)] p-2 shadow-lg ring-1 ring-black/5">
                  {["😀", "😍", "🥰", "😎", "🤔", "😡", "🔥", "🎉", "💯", "😴", "🤗", "👏", "😮", "🤣", "💔", "✨", "👀", "💪"].map(
                    (emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => pickReaction(emoji)}
                        className="rounded-lg p-1.5 text-lg transition hover:bg-[var(--wa-header)]"
                      >
                        {emoji}
                      </button>
                    ),
                  )}
                </div>
              )}

              <div className="min-w-[220px] overflow-hidden rounded-xl bg-[var(--wa-panel)] py-1.5 shadow-lg ring-1 ring-black/5">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                    onClick={item.onClick}
                  >
                    <span>{item.label}</span>
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]",
                        item.id === "star" && isStarred && "fill-[#eab308] text-[#eab308]",
                        item.id === "pin" && isPinned && "text-[#00a884]",
                      )}
                      strokeWidth={1.75}
                    />
                  </button>
                ))}

                <div className="my-1 border-t border-[var(--wa-border)]" />

                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                  onClick={closeMenu}
                >
                  <span>דיווח</span>
                  <ThumbsDown className="h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]" strokeWidth={1.75} />
                </button>

                {onDeleteForMe && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                    onClick={() => {
                      closeMenu()
                      onDeleteForMe()
                    }}
                  >
                    <span>מחק אצלי</span>
                    <EyeOff className="h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]" strokeWidth={1.75} />
                  </button>
                )}

                {onDeleteForEveryone &&
                  (confirmDelete ? (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[#ea0038] transition hover:bg-[var(--wa-hover)]"
                      onClick={() => {
                        closeMenu()
                        onDeleteForEveryone()
                      }}
                    >
                      <span>אשר מחיקה לכולם</span>
                      <Trash2 className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-6 px-4 py-2.5 text-[15px] text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <span>מחק לכולם</span>
                      <Trash2 className="h-[18px] w-[18px] shrink-0 text-[var(--wa-text-secondary)]" strokeWidth={1.75} />
                    </button>
                  ))}
              </div>
            </div>
          </>,
          document.body,
        )}
      </div>

      {onOpenThread && threadReplyCount > 0 && !selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenThread()
          }}
          className={cn(
            "mb-1 flex max-w-[min(100%,320px)] items-center gap-2 rounded-lg border border-[#d1d7db] bg-[var(--wa-panel)] px-3 py-1.5 text-right shadow-sm transition hover:bg-[var(--wa-header)]",
            isMine ? "self-start" : "self-end",
          )}
          dir="rtl"
        >
          <MessagesSquare className="h-4 w-4 shrink-0 text-[#00a884]" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[#00a884]">{replyCountLabel}</span>
            {threadPreview && (
              <span className="block truncate text-[12px] text-[var(--wa-text-secondary)]">{threadPreview}</span>
            )}
          </span>
        </button>
      )}
    </div>
  )
}
