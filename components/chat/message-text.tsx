"use client"

import { Fragment, useEffect, useState, type CSSProperties, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { Mail, MessageCircle } from "lucide-react"
import { highlightQuery, splitTextWithLinks } from "@/lib/message-content"
import { decodeFormattedMessage, isStandaloneEmojiText } from "@/lib/message-formatting"
import type { MentionKind } from "@/lib/mentions"
import { parseYoutubeVideoId } from "@/lib/youtube"
import { cn } from "@/lib/utils"

const EMAIL_LINK_STYLE: CSSProperties = {
  color: "#027eb5",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  font: "inherit",
  background: "transparent",
  border: 0,
  padding: 0,
  cursor: "pointer",
}

const MENTION_LINK_STYLE: CSSProperties = {
  color: "#027eb5",
  textDecoration: "none",
  font: "inherit",
  background: "transparent",
  border: 0,
  padding: 0,
  cursor: "pointer",
  fontWeight: 600,
}

export type OpenMentionHandler = (mention: {
  kind: MentionKind
  id: string
  label: string
}) => void | Promise<void>

export function MessageText({
  text,
  searchQuery,
  onStartChatByEmail,
  onOpenMention,
}: {
  text: string
  searchQuery?: string
  onStartChatByEmail?: (email: string) => Promise<void>
  onOpenMention?: OpenMentionHandler
}) {
  const [emailMenu, setEmailMenu] = useState<{
    email: string
    style: CSSProperties
  } | null>(null)
  const [openingChat, setOpeningChat] = useState(false)
  const [openingMention, setOpeningMention] = useState(false)
  const { text: displayText, formatting } = decodeFormattedMessage(text)
  const largeEmoji = isStandaloneEmojiText(displayText)
  const parts = splitTextWithLinks(displayText)

  useEffect(() => {
    if (!emailMenu) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEmailMenu(null)
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [emailMenu])

  const openEmailMenu = (event: MouseEvent<HTMLElement>, email: string) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = Math.min(300, window.innerWidth - 16)
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - menuWidth - 8),
    )
    const placeAbove = window.innerHeight - rect.bottom < 130 && rect.top > 130
    setEmailMenu({
      email,
      style: {
        width: menuWidth,
        left,
        ...(placeAbove
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      },
    })
  }

  const startEmailChat = async () => {
    if (!emailMenu || !onStartChatByEmail || openingChat) return
    setOpeningChat(true)
    try {
      await onStartChatByEmail(emailMenu.email)
      setEmailMenu(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "נכשל בפתיחת שיחה")
    } finally {
      setOpeningChat(false)
    }
  }

  const openMention = async (kind: MentionKind, id: string, label: string) => {
    if (!onOpenMention || openingMention) return
    setOpeningMention(true)
    try {
      await onOpenMention({ kind, id, label })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "נכשל בפתיחת הצ'אט")
    } finally {
      setOpeningMention(false)
    }
  }

  const formattingStyle: CSSProperties = {
    fontWeight: formatting.bold ? 700 : undefined,
    fontStyle: formatting.italic ? "italic" : undefined,
    color: formatting.color ?? undefined,
  }

  return (
    <>
      <span
        className={cn(
          "whitespace-pre-wrap break-words text-[var(--wa-text)]",
          largeEmoji ? "text-[42px] leading-none" : "text-[15px] leading-[19px]",
        )}
      >
        {parts.map((p, i) => {
          if (p.type === "link") {
            return (
              <a
                key={i}
                href={p.value}
                target="_blank"
                rel="noopener noreferrer"
                className="!text-[#027eb5] underline underline-offset-2"
                style={{ color: "#027eb5", textDecoration: "underline" }}
                onClick={(e) => e.stopPropagation()}
              >
                {p.value}
              </a>
            )
          }
          if (p.type === "email") {
            // Render outside colored formatting inheritance so the link stays blue
            return (
              <button
                key={i}
                type="button"
                className="!inline !cursor-pointer !border-0 !bg-transparent !p-0 !text-[#027eb5] underline underline-offset-2"
                style={EMAIL_LINK_STYLE}
                onClick={(event) => openEmailMenu(event, p.value)}
                aria-label={`אפשרויות עבור ${p.value}`}
              >
                {p.value}
              </button>
            )
          }
          if (p.type === "mention" && p.mentionKind && p.mentionId) {
            const label = p.value
            const kind = p.mentionKind
            const id = p.mentionId
            return (
              <button
                key={i}
                type="button"
                disabled={!onOpenMention || openingMention}
                className="!inline !cursor-pointer !border-0 !bg-[#027eb5]/10 !px-0.5 !rounded-sm !text-[#027eb5] hover:!bg-[#027eb5]/18 disabled:!opacity-60"
                style={MENTION_LINK_STYLE}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void openMention(kind, id, label)
                }}
                aria-label={kind === "group" ? `פתח קבוצה ${label}` : `פתח צ'אט עם ${label}`}
              >
                @{label}
              </button>
            )
          }
          if (!searchQuery?.trim()) {
            return (
              <span key={i} style={formattingStyle}>
                {p.value}
              </span>
            )
          }
          return (
            <Fragment key={i}>
              {highlightQuery(p.value, searchQuery).map((h, j) =>
                h.hit ? (
                  <mark
                    key={j}
                    className="rounded-sm bg-[#f6e59c] px-0.5 text-inherit"
                    style={formattingStyle}
                  >
                    {h.text}
                  </mark>
                ) : (
                  <span key={j} style={formattingStyle}>
                    {h.text}
                  </span>
                ),
              )}
            </Fragment>
          )
        })}
      </span>

      {emailMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[110] cursor-default"
              aria-label="סגור אפשרויות מייל"
              onClick={(event) => {
                event.stopPropagation()
                setEmailMenu(null)
              }}
            />
            <div
              className="fixed z-[120] overflow-hidden rounded-xl bg-[var(--wa-panel)] py-1.5 shadow-xl ring-1 ring-black/10"
              style={emailMenu.style}
              dir="rtl"
              role="menu"
            >
              <button
                type="button"
                disabled={!onStartChatByEmail || openingChat}
                onClick={(event) => {
                  event.stopPropagation()
                  void startEmailChat()
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                role="menuitem"
              >
                <span className="min-w-0 truncate">
                  {openingChat ? "פותח צ'אט..." : `צ'אט עם ${emailMenu.email}`}
                </span>
                <MessageCircle className="h-4 w-4 shrink-0 text-[#00a884]" />
              </button>
              <a
                href={`mailto:${emailMenu.email}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setEmailMenu(null)
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
                role="menuitem"
              >
                <span className="min-w-0 truncate">שליחת מייל ל-{emailMenu.email}</span>
                <Mail className="h-4 w-4 shrink-0 text-[#027eb5]" />
              </a>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

export function LinkPreview({
  url,
  onWatchTogether,
}: {
  url: string
  onWatchTogether?: (url: string) => void
}) {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    // keep raw
  }

  const isYoutube = Boolean(onWatchTogether) && Boolean(parseYoutubeVideoId(url))

  return (
    <div className="mb-1 mt-1 overflow-hidden rounded-md border border-black/10 bg-black/[0.03] text-right">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition hover:bg-black/[0.06]"
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
      {isYoutube && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onWatchTogether?.(url)
          }}
          className="flex w-full items-center justify-center gap-1.5 border-t border-black/5 bg-[#00a884]/10 px-3 py-2 text-xs font-medium text-[#008f6f] transition hover:bg-[#00a884]/18"
        >
          צפייה משותפת
        </button>
      )}
    </div>
  )
}
