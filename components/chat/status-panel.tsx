"use client"

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react"
import { Avatar } from "./avatar"
import { StatusRing, StatusGlyph } from "./status-ring"
import { StatusViewer } from "./status-viewer"
import {
  MediaStatusComposer,
  StatusPrivacyPane,
  TextStatusComposer,
  statusMediaError,
  useStatusAudience,
  type StatusMediaDraft,
} from "./status-composer"
import { useStatusFeed } from "@/lib/use-status-feed"
import { firstUnviewedIndex, type StatusGroup } from "@/lib/status-feed"
import { formatStatusTime } from "@/lib/format"
import type { Profile } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Camera, ImageIcon, Lock, MoreVertical, Pencil, Plus, PlusCircle, RefreshCw, Shield } from "lucide-react"
import { DriveConnectBanner } from "./drive-connect-banner"

type Pane = "home" | "text" | "media" | "privacy"

type ViewerState = { groups: StatusGroup[]; groupIndex: number; index: number }

type Props = {
  currentUser: Profile
  /** Matches the chat list column so switching tabs does not shift the layout. */
  asideClassName: string
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, close])
  return ref
}

function AddMenu({ onText, onMedia }: { onText: () => void; onMedia: () => void }) {
  return (
    <div className="wa-menu absolute left-0 top-11 z-30 w-52 py-2">
      <button
        type="button"
        onClick={onMedia}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
      >
        <ImageIcon className="h-5 w-5 text-[#0088cc]" />
        תמונות וסרטונים
      </button>
      <button
        type="button"
        onClick={onText}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
      >
        <Pencil className="h-5 w-5 text-[#00a884]" />
        טקסט
      </button>
    </div>
  )
}

function StatusRow({
  group,
  viewedIds,
  onOpen,
}: {
  group: StatusGroup
  viewedIds: ReadonlySet<string>
  onOpen: () => void
}) {
  const latest = group.statuses[group.statuses.length - 1]
  return (
    <button
      type="button"
      onClick={onOpen}
      className="wa-interactive-row flex w-full items-center gap-3.5 px-4 py-2.5 text-right transition hover:bg-[var(--wa-hover)]"
    >
      <StatusRing size={42} seen={group.statuses.map((s) => viewedIds.has(s.id))}>
        <Avatar name={group.profile.display_name} url={group.profile.avatar_url} size={42} />
      </StatusRing>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] text-[var(--wa-text)]">
          {group.profile.display_name ?? group.profile.email}
        </div>
        <div className="truncate text-[13px] text-[var(--wa-text-secondary)]">{formatStatusTime(latest.created_at)}</div>
      </div>
    </button>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 px-4 py-2.5">
      <div className="wa-skeleton h-[53px] w-[53px] rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="wa-skeleton h-3.5 w-1/2 rounded" />
        <div className="wa-skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  )
}

export function StatusTab({ currentUser, asideClassName }: Props) {
  const { feed, viewedIds, loading, error, reload, markViewed, removeStatus } = useStatusFeed(currentUser, true)
  const audience = useStatusAudience(currentUser.id)
  const [pane, setPane] = useState<Pane>("home")
  const [privacyReturn, setPrivacyReturn] = useState<Pane>("home")
  const [drafts, setDrafts] = useState<StatusMediaDraft[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [myMenuOpen, setMyMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const addRef = useDismiss(addOpen, useCallback(() => setAddOpen(false), []))
  const moreRef = useDismiss(moreOpen, useCallback(() => setMoreOpen(false), []))
  const myRef = useDismiss(myMenuOpen, useCallback(() => setMyMenuOpen(false), []))

  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  useEffect(() => {
    return () => {
      for (const d of draftsRef.current) URL.revokeObjectURL(d.preview)
    }
  }, [])

  const closeMenus = () => {
    setAddOpen(false)
    setMoreOpen(false)
    setMyMenuOpen(false)
  }

  const startText = () => {
    closeMenus()
    setPickError(null)
    setPane("text")
  }

  const pickMedia = () => {
    closeMenus()
    fileRef.current?.click()
  }

  const addFiles = (files: Iterable<File>) => {
    const next: StatusMediaDraft[] = []
    let firstError: string | null = null
    for (const file of files) {
      const err = statusMediaError(file)
      if (err) {
        firstError ??= err
        continue
      }
      next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), caption: "" })
    }
    setPickError(firstError)
    if (next.length === 0) return
    setDrafts((prev) => [...prev, ...next].slice(0, 10))
    setPane("media")
  }

  const clearDrafts = () => {
    for (const d of drafts) URL.revokeObjectURL(d.preview)
    setDrafts([])
  }

  const finishPosting = () => {
    setDrafts([])
    setPane("home")
    void reload()
  }

  const openPrivacy = (from: Pane) => {
    closeMenus()
    setPrivacyReturn(from)
    setPane("privacy")
  }

  const contactPlaylist = [...feed.recent, ...feed.viewed]

  const openContact = (group: StatusGroup) => {
    const groupIndex = contactPlaylist.findIndex((g) => g.profile.id === group.profile.id)
    setViewer({ groups: contactPlaylist, groupIndex, index: firstUnviewedIndex(group, viewedIds) })
  }

  const openMine = () => {
    if (!feed.mine.length) {
      setMyMenuOpen((v) => !v)
      return
    }
    setViewer({ groups: [{ profile: currentUser, statuses: feed.mine }], groupIndex: 0, index: 0 })
  }

  const handleDeleted = (statusId: string) => {
    removeStatus(statusId)
    setViewer((current) => {
      if (!current) return null
      const groups = current.groups
        .map((g) => ({ ...g, statuses: g.statuses.filter((s) => s.id !== statusId) }))
        .filter((g) => g.statuses.length > 0)
      if (groups.length === 0) return null
      const groupIndex = Math.min(current.groupIndex, groups.length - 1)
      const index = Math.min(current.index, groups[groupIndex].statuses.length - 1)
      return { groups, groupIndex, index }
    })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files))
  }

  const latestMine = feed.mine[feed.mine.length - 1]
  const hasContacts = feed.recent.length + feed.viewed.length > 0

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(Array.from(e.target.files))
          e.target.value = ""
        }}
      />

      <aside className={cn(asideClassName, pane !== "home" && "hidden md:flex")} dir="rtl">
        <header className="flex h-16 shrink-0 items-center justify-between px-5">
          <h1 className="text-[22px] font-medium text-[var(--wa-heading)]">סטטוס</h1>
          <div className="flex items-center gap-1 text-[var(--wa-text-secondary)]">
            <div className="relative" ref={addRef}>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  setAddOpen((v) => !v)
                }}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[var(--wa-hover)]",
                  addOpen && "bg-[var(--wa-hover)]",
                )}
                aria-label="הוספת סטטוס"
                title="הוספת סטטוס"
              >
                <PlusCircle className="h-[22px] w-[22px]" />
              </button>
              {addOpen && <AddMenu onText={startText} onMedia={pickMedia} />}
            </div>
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => {
                  setAddOpen(false)
                  setMoreOpen((v) => !v)
                }}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[var(--wa-hover)]",
                  moreOpen && "bg-[var(--wa-hover)]",
                )}
                aria-label="תפריט"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
              {moreOpen && (
                <div className="wa-menu absolute left-0 top-11 z-30 w-52 py-2">
                  <button
                    type="button"
                    onClick={() => openPrivacy(pane === "privacy" ? privacyReturn : pane)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                  >
                    <Shield className="h-4.5 w-4.5 text-[var(--wa-text-secondary)]" />
                    פרטיות הסטטוס
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      void reload()
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-right text-sm text-[var(--wa-text)] hover:bg-[var(--wa-hover)]"
                  >
                    <RefreshCw className="h-4.5 w-4.5 text-[var(--wa-text-secondary)]" />
                    רענון
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <DriveConnectBanner />

        <div className="wa-scroll min-h-0 flex-1 overflow-y-auto pb-4">
          <div className="relative" ref={myRef}>
            <div className="flex items-center">
              <button
                type="button"
                onClick={openMine}
                className="wa-interactive-row flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3 text-right transition hover:bg-[var(--wa-hover)]"
              >
                {feed.mine.length ? (
                  <StatusRing size={42} seen={feed.mine.map(() => false)}>
                    <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={42} />
                  </StatusRing>
                ) : (
                  <div className="relative shrink-0 p-[5.5px]">
                    <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={42} />
                    <span className="absolute bottom-0.5 left-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-[var(--wa-panel)] bg-[#25d366] text-white">
                      <Plus className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] text-[var(--wa-text)]">הסטטוס שלי</div>
                  <div className="truncate text-[13px] text-[var(--wa-text-secondary)]">
                    {latestMine
                      ? `${formatStatusTime(latestMine.created_at)}${feed.mine.length > 1 ? ` · ${feed.mine.length} עדכונים` : ""}`
                      : "יש ללחוץ כדי להוסיף עדכון סטטוס"}
                  </div>
                </div>
              </button>
              {feed.mine.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMyMenuOpen((v) => !v)}
                  className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#00a884] transition hover:bg-[var(--wa-hover)]"
                  aria-label="הוספת עדכון"
                  title="הוספת עדכון"
                >
                  <PlusCircle className="h-5 w-5" />
                </button>
              )}
            </div>
            {myMenuOpen && <AddMenu onText={startText} onMedia={pickMedia} />}
          </div>

          {pickError && (
            <p className="mx-4 my-2 rounded-lg bg-[#fde8e8] px-3 py-2 text-xs text-[#ea0038]">{pickError}</p>
          )}
          {error && (
            <p className="mx-4 my-2 rounded-lg bg-[#fde8e8] px-3 py-2 text-xs text-[#ea0038]">{error}</p>
          )}

          {loading && !hasContacts ? (
            <>
              <div className="px-6 pb-2 pt-5 text-[14px] text-[var(--wa-text-secondary)]">אחרונים</div>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          ) : !hasContacts ? (
            <p className="px-8 py-10 text-center text-sm leading-relaxed text-[var(--wa-text-secondary)]">
              אין עדכונים מאנשי הקשר כרגע.
              <br />
              עדכונים חדשים יופיעו כאן.
            </p>
          ) : (
            <>
              {feed.recent.length > 0 && (
                <>
                  <div className="px-6 pb-2 pt-5 text-[14px] text-[var(--wa-text-secondary)]">אחרונים</div>
                  {feed.recent.map((g) => (
                    <StatusRow key={g.profile.id} group={g} viewedIds={viewedIds} onOpen={() => openContact(g)} />
                  ))}
                </>
              )}
              {feed.viewed.length > 0 && (
                <>
                  <div className="px-6 pb-2 pt-5 text-[14px] text-[var(--wa-text-secondary)]">נצפו</div>
                  {feed.viewed.map((g) => (
                    <StatusRow key={g.profile.id} group={g} viewedIds={viewedIds} onOpen={() => openContact(g)} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      <main
        className={cn("relative min-h-0 min-w-0 flex-1", pane === "home" ? "hidden md:flex" : "flex")}
        onDragOver={(e) => {
          if (pane !== "home") return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (pane === "home") onDrop(e)
        }}
      >
        {pane === "text" ? (
          <TextStatusComposer
            userId={currentUser.id}
            audience={audience}
            onOpenPrivacy={() => openPrivacy("text")}
            onClose={() => setPane("home")}
            onPosted={finishPosting}
          />
        ) : pane === "media" && drafts.length > 0 ? (
          <MediaStatusComposer
            userId={currentUser.id}
            drafts={drafts}
            audience={audience}
            onDraftsChange={setDrafts}
            onAddMore={pickMedia}
            onOpenPrivacy={() => openPrivacy("media")}
            onClose={() => {
              clearDrafts()
              setPane("home")
            }}
            onPosted={finishPosting}
          />
        ) : pane === "privacy" ? (
          <StatusPrivacyPane
            userId={currentUser.id}
            audience={audience}
            onBack={() => setPane(privacyReturn === "media" && drafts.length === 0 ? "home" : privacyReturn)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[var(--wa-header)] px-6 text-center" dir="rtl">
            <div className="wa-fade-in flex flex-col items-center">
              <StatusGlyph className="h-[72px] w-[72px] text-[var(--wa-text-secondary)] opacity-60" />
              <h2 className="mt-7 text-[32px] font-light text-[var(--wa-heading)]">שיתוף סטטוסים</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--wa-text-secondary)]">
                אפשר לשתף תמונות, הודעות טקסט וסרטונים שייעלמו אחרי 12 שעות.
              </p>
              <div className="mt-8 flex items-start gap-10">
                <button type="button" onClick={startText} className="group flex flex-col items-center gap-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[var(--wa-text)] shadow-sm ring-1 ring-[var(--wa-border)] transition group-hover:scale-105 group-hover:bg-[var(--wa-hover)]">
                    <Pencil className="h-5 w-5" />
                  </span>
                  <span className="text-[13px] text-[var(--wa-text)]">סטטוס כתוב</span>
                </button>
                <button type="button" onClick={pickMedia} className="group flex flex-col items-center gap-2">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[var(--wa-text)] shadow-sm ring-1 ring-[var(--wa-border)] transition group-hover:scale-105 group-hover:bg-[var(--wa-hover)]">
                    <Camera className="h-5 w-5" />
                  </span>
                  <span className="text-[13px] text-[var(--wa-text)]">תמונה וסרטון</span>
                </button>
              </div>
              <p className="mt-6 text-xs text-[var(--wa-text-secondary)]">או גררו לכאן תמונות וסרטונים</p>
            </div>
            <button
              type="button"
              onClick={() => openPrivacy("home")}
              className="absolute bottom-6 flex items-center gap-1.5 text-xs text-[var(--wa-text-secondary)] hover:underline"
            >
              <Lock className="h-3 w-3" />
              מי רואה את הסטטוס שלך: {audience.label}
            </button>
            {dragging && (
              <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-3xl border-2 border-dashed border-[#00a884] bg-[#00a884]/10 text-lg font-medium text-[var(--wa-teal-dark)]">
                שחררו כדי להוסיף לסטטוס
              </div>
            )}
          </div>
        )}
      </main>

      {viewer && (
        <StatusViewer
          groups={viewer.groups}
          groupIndex={viewer.groupIndex}
          index={viewer.index}
          currentUserId={currentUser.id}
          onNavigate={(groupIndex, index) => setViewer((v) => (v ? { ...v, groupIndex, index } : v))}
          onClose={() => setViewer(null)}
          startIndexFor={(g) => firstUnviewedIndex(g, viewedIds)}
          onViewed={markViewed}
          onStatusDeleted={handleDeleted}
        />
      )}
    </>
  )
}
