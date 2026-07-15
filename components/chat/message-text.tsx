"use client"

import { highlightQuery, splitTextWithLinks } from "@/lib/message-content"
import { decodeFormattedMessage } from "@/lib/message-formatting"

export function MessageText({
  text,
  searchQuery,
}: {
  text: string
  searchQuery?: string
}) {
  const { text: displayText, formatting } = decodeFormattedMessage(text)
  const parts = splitTextWithLinks(displayText)
  return (
    <span
      className="whitespace-pre-wrap break-words text-[15px] leading-[19px] text-[var(--wa-text)]"
      style={{
        fontWeight: formatting.bold ? 700 : undefined,
        fontStyle: formatting.italic ? "italic" : undefined,
        color: formatting.color ?? undefined,
      }}
    >
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
