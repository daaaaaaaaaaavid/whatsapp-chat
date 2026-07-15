"use client"

import { Fragment, useEffect, useState, type CSSProperties, type MouseEvent } from "react"
import { createPortal } from "react-dom"
import { Mail, MessageCircle } from "lucide-react"
import { highlightQuery, splitTextWithLinks } from "@/lib/message-content"
import { decodeFormattedMessage } from "@/lib/message-formatting"

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

export function MessageText({
  text,
  searchQuery,
  onStartChatByEmail,
}: {
  text: string
  searchQuery?: string
  onStartChatByEmail?: (email: string) => Promise<void>
}) {
  const [emailMenu, setEmailMenu] = useState<{
    email: string
    style: CSSProperties
  } | null>(null)
  const [openingChat, setOpeningChat] = useState(false)
  const { text: displayText, formatting } = decodeFormattedMessage(text)
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

  const formattingStyle: CSSProperties = {
    fontWeight: formatting.bold ? 700 : undefined,
    fontStyle: formatting.italic ? "italic" : undefined,
    color: formatting.color ?? undefined,
  }

  return (
    <>
      <span className="whitespace-pre-wrap break-words text-[15px] leading-[19px] text-[var(--wa-text)]">
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

export function LinkPreview({ url }: { url: string }) {
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
