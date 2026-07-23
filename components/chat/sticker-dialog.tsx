"use client"

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Modal } from "./modal"
import { LoaderCircle, Sticker, Upload } from "lucide-react"
import { BUILTIN_STICKER_PACK, fetchStickerAsFile, type StickerPackItem } from "@/lib/sticker-pack"

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (file: File) => void | Promise<void>
}

const ACCEPT = "image/png,image/webp,image/jpeg,image/gif"

type Tab = "pack" | "custom"

export function StickerDialog({ open, onClose, onSubmit }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>("pack")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTab("pack")
    setBusyId(null)
    setError(null)
  }, [open])

  const sendFile = async (file: File, busyKey: string) => {
    if (busyId) return
    setBusyId(busyKey)
    setError(null)
    try {
      await onSubmit(file)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "שליחת המדבקה נכשלה")
    } finally {
      setBusyId(null)
    }
  }

  const onPickPack = async (item: StickerPackItem) => {
    try {
      const file = await fetchStickerAsFile(item)
      await sendFile(file, item.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לטעון את המדבקה")
      setBusyId(null)
    }
  }

  const onPickCustom = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null
    e.target.value = ""
    if (!next) return
    if (!next.type.startsWith("image/")) {
      setError("יש לבחור קובץ תמונה")
      return
    }
    void sendFile(next, "custom")
  }

  return (
    <Modal open={open} onClose={onClose} title="מדבקות">
      <div className="flex flex-col gap-3 p-4" dir="rtl">
        <div className="flex rounded-xl bg-[var(--wa-header)] p-1">
          <button
            type="button"
            onClick={() => setTab("pack")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
              tab === "pack"
                ? "bg-[var(--wa-panel)] text-[var(--wa-text)] shadow-sm"
                : "text-[var(--wa-text-secondary)]"
            }`}
          >
            <Sticker className="h-4 w-4" />
            חבילה ({BUILTIN_STICKER_PACK.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("custom")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
              tab === "custom"
                ? "bg-[var(--wa-panel)] text-[var(--wa-text)] shadow-sm"
                : "text-[var(--wa-text-secondary)]"
            }`}
          >
            <Upload className="h-4 w-4" />
            מדבקה שלי
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {tab === "pack" ? (
          <div className="grid max-h-[55vh] grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
            {BUILTIN_STICKER_PACK.map((item) => {
              const busy = busyId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={Boolean(busyId)}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => void onPickPack(item)}
                  className="relative flex aspect-square items-center justify-center rounded-2xl bg-[var(--wa-header)] p-2 transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.src}
                    alt={item.label}
                    className="h-12 w-12 object-contain sm:h-14 sm:w-14"
                    draggable={false}
                  />
                  {busy && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/25">
                      <LoaderCircle className="h-5 w-5 animate-spin text-white" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--wa-text-secondary)]">
              העלה תמונה משלך (PNG/WebP עם רקע שקוף עובד הכי טוב) ותישלח כמדבקה.
            </p>
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-[var(--wa-header)] px-4 py-10 transition hover:bg-[var(--wa-hover)] disabled:opacity-60"
            >
              {busyId === "custom" ? (
                <LoaderCircle className="h-8 w-8 animate-spin text-[var(--wa-text-secondary)]" />
              ) : (
                <Upload className="h-8 w-8 text-[var(--wa-text-secondary)]" />
              )}
              <span className="text-sm text-[var(--wa-text-secondary)]">
                {busyId === "custom" ? "שולח…" : "לחץ לבחירת תמונה"}
              </span>
            </button>
            <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={onPickCustom} />
          </div>
        )}
      </div>
    </Modal>
  )
}
