"use client"

import { useEffect, useState } from "react"
import { Modal } from "./modal"
import { parseYoutubeVideoId, youtubeThumbUrl } from "@/lib/youtube"
import { Clapperboard } from "lucide-react"

type Props = {
  open: boolean
  onClose: () => void
  onStart: (videoId: string) => void
  initialUrl?: string
}

export function WatchStartDialog({ open, onClose, onStart, initialUrl = "" }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setUrl(initialUrl)
      setError(null)
    }
  }, [open, initialUrl])

  const videoId = parseYoutubeVideoId(url)

  const submit = () => {
    const id = parseYoutubeVideoId(url)
    if (!id) {
      setError("הדבק קישור יוטיוב תקין")
      return
    }
    onStart(id)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="צפייה משותפת">
      <div className="space-y-4 p-5">
        <p className="text-sm text-[var(--wa-text-secondary)]">
          הדבק קישור ליוטיוב — כולם בצ&apos;אט יוכלו להצטרף ולצפות יחד באותו קצב, עם תגובות חיות.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-xs text-[var(--wa-text-secondary)]">קישור ליוטיוב</span>
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
            }}
            placeholder="https://youtube.com/watch?v=..."
            dir="ltr"
            className="w-full rounded-lg border border-black/10 bg-[var(--wa-bg)] px-3 py-2.5 text-sm text-[var(--wa-text)] outline-none ring-[#00a884] focus:ring-2"
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-[#ea0038]">{error}</p>}
        {videoId && (
          <div className="overflow-hidden rounded-lg border border-black/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={youtubeThumbUrl(videoId)}
              alt=""
              className="aspect-video w-full object-cover"
            />
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!videoId}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00a884] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#06cf9c] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Clapperboard className="h-4 w-4" />
          התחל צפייה משותפת
        </button>
      </div>
    </Modal>
  )
}
