"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import emojiGroupsJson from "unicode-emoji-json/data-by-group.json"
import annotationsJson from "cldr-annotations-full/annotations/he/annotations.json"
import derivedAnnotationsJson from "cldr-annotations-derived-full/annotationsDerived/he/annotations.json"

type EmojiItem = {
  emoji: string
  name: string
  slug: string
}

type EmojiGroup = {
  name: string
  slug: string
  emojis: EmojiItem[]
}

type Annotation = {
  default?: string[]
  tts?: string[]
}

type Props = {
  id: string
  onSelect: (emoji: string) => void
  onClose: () => void
}

const GROUP_LABELS: Record<string, string> = {
  smileys_emotion: "חיוכים ורגשות",
  people_body: "אנשים וגוף",
  animals_nature: "חיות וטבע",
  food_drink: "אוכל ושתייה",
  travel_places: "נסיעות ומקומות",
  activities: "פעילויות",
  objects: "חפצים",
  symbols: "סמלים",
  flags: "דגלים",
}

const GROUP_ICONS: Record<string, string> = {
  smileys_emotion: "😀",
  people_body: "👋",
  animals_nature: "🐻",
  food_drink: "🍕",
  travel_places: "🚗",
  activities: "⚽",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
}

const annotations = annotationsJson.annotations.annotations as Record<string, Annotation>
const derivedAnnotations = derivedAnnotationsJson.annotationsDerived.annotations as Record<
  string,
  Annotation
>
const emojiGroups = emojiGroupsJson as EmojiGroup[]

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0591-\u05c7]/g, "")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("he")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function annotationFor(emoji: string) {
  return derivedAnnotations[emoji] ?? annotations[emoji]
}

export default function EmojiPicker({ id, onSelect, onClose }: Props) {
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [activeGroup, setActiveGroup] = useState(emojiGroups[0]?.slug ?? "")

  useEffect(() => {
    searchRef.current?.focus()

    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  const normalizedQuery = normalizeSearch(query)
  const visibleEmojis = useMemo(() => {
    if (!normalizedQuery) {
      return emojiGroups.find((group) => group.slug === activeGroup)?.emojis ?? []
    }

    const words = normalizedQuery.split(" ")
    return emojiGroups
      .flatMap((group) => group.emojis)
      .filter((item) => {
        const annotation = annotationFor(item.emoji)
        const searchText = normalizeSearch(
          [
            ...(annotation?.tts ?? []),
            ...(annotation?.default ?? []),
            item.name,
            item.slug,
          ].join(" "),
        )
        return words.every((word) => searchText.includes(word))
      })
  }, [activeGroup, normalizedQuery])

  const activeLabel =
    GROUP_LABELS[activeGroup] ??
    emojiGroups.find((group) => group.slug === activeGroup)?.name ??
    "אימוג׳ים"

  return (
    <div
      ref={pickerRef}
      id={id}
      role="dialog"
      aria-label="בחירת אימוג׳י"
      dir="rtl"
      className="absolute bottom-16 left-2 right-2 z-30 flex h-[390px] flex-col overflow-hidden rounded-xl bg-[var(--wa-panel)] shadow-xl ring-1 ring-black/10 sm:left-auto sm:right-4 sm:w-[370px]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--wa-border)] p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-[var(--wa-header)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--wa-text-secondary)]" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חיפוש אימוג׳ים בעברית..."
            aria-label="חיפוש אימוג׳ים"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-secondary)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                searchRef.current?.focus()
              }}
              aria-label="ניקוי החיפוש"
              className="rounded-full p-1 text-[var(--wa-text-secondary)] hover:bg-black/5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירת חלון האימוג׳ים"
          className="rounded-full p-2 text-[var(--wa-text-secondary)] hover:bg-[var(--wa-header)]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        role="tablist"
        aria-label="קטגוריות אימוג׳ים"
        className="flex shrink-0 overflow-x-auto border-b border-[var(--wa-border)] px-1"
      >
        {emojiGroups.map((group) => {
          const selected = !normalizedQuery && activeGroup === group.slug
          return (
            <button
              key={group.slug}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={GROUP_LABELS[group.slug] ?? group.name}
              title={GROUP_LABELS[group.slug] ?? group.name}
              onClick={() => {
                setQuery("")
                setActiveGroup(group.slug)
              }}
              className={`min-w-10 flex-1 border-b-2 px-2 py-2 text-lg transition ${
                selected
                  ? "border-[#00a884] bg-[var(--wa-header)]"
                  : "border-transparent hover:bg-[var(--wa-header)]"
              }`}
            >
              {GROUP_ICONS[group.slug] ?? "•"}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between px-3 pb-1 pt-2 text-xs text-[var(--wa-text-secondary)]">
        <span>{normalizedQuery ? "תוצאות חיפוש" : activeLabel}</span>
        <span>{visibleEmojis.length} אימוג׳ים</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" role="tabpanel">
        {visibleEmojis.length > 0 ? (
          <div className="grid grid-cols-8 gap-1">
            {visibleEmojis.map((item) => {
              const label = annotationFor(item.emoji)?.tts?.[0] ?? item.name
              return (
                <button
                  key={item.emoji}
                  type="button"
                  onClick={() => onSelect(item.emoji)}
                  title={label}
                  aria-label={label}
                  className="flex aspect-square items-center justify-center rounded-lg text-2xl transition hover:bg-[var(--wa-header)] focus-visible:outline-2 focus-visible:outline-[#00a884]"
                >
                  {item.emoji}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[var(--wa-text-secondary)]">
            לא נמצאו אימוג׳ים. נסו מילת חיפוש אחרת.
          </div>
        )}
      </div>
    </div>
  )
}
