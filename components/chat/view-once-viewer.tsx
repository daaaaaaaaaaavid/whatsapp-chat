"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Eye, X } from "lucide-react"
import { useSignedMediaUrl } from "@/lib/use-signed-media-url"
import { openViewOnceMessage } from "@/lib/view-once"
import type { Message } from "@/lib/types"

type Props = {
  message: Message
  /** Recipient burns on close; sender only previews */
  burnsOnClose: boolean
  onBurned: (messageId: string) => void
  onClose: () => void
}

export function ViewOnceViewer({ message, burnsOnClose, onBurned, onClose }: Props) {
  const url = useSignedMediaUrl(message.file_url)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const burnedRef = useRef(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isVideo = message.type === "video"

  const finish = useCallback(async () => {
    if (closing) return
    setClosing(true)
    if (burnsOnClose && !burnedRef.current && message.file_url) {
      burnedRef.current = true
      try {
        await openViewOnceMessage(message.id)
        onBurned(message.id)
      } catch (err) {
        burnedRef.current = false
        setClosing(false)
        setError(err instanceof Error ? err.message : "לא ניתן לסגור את המדיה")
        return
      }
    }
    onClose()
  }, [burnsOnClose, closing, message.file_url, message.id, onBurned, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [finish])

  // Block context menu / save-as
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    document.addEventListener("contextmenu", block)
    return () => document.removeEventListener("contextmenu", block)
  }, [])

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white">
      <header className="flex items-center gap-3 px-4 py-3">
        <Eye className="h-5 w-5 text-[#25d366]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">צפייה חד־פעמית</p>
          <p className="text-xs text-white/60">
            {burnsOnClose ? "לאחר הסגירה לא ניתן יהיה לצפות שוב" : "תצוגה מקדימה · נמען יצפה פעם אחת"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={closing}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 disabled:opacity-50"
          aria-label="סגור"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
        {!url && !error && (
          <p className="text-sm text-white/60">טוען...</p>
        )}
        {error && <p className="px-6 text-center text-sm text-red-300">{error}</p>}
        {url && isVideo && (
          <video
            ref={videoRef}
            src={url}
            controls
            controlsList="nodownload noplaybackrate"
            disablePictureInPicture
            playsInline
            autoPlay
            className="max-h-full max-w-full rounded-lg"
            onEnded={() => void finish()}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
        {url && !isVideo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="max-h-full max-w-full select-none rounded-lg object-contain"
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>

      <div className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center">
        <button
          type="button"
          onClick={() => void finish()}
          disabled={closing}
          className="rounded-full bg-white/15 px-6 py-2.5 text-sm transition hover:bg-white/25 disabled:opacity-50"
        >
          {closing ? "סוגר..." : burnsOnClose ? "סגור וסיים צפייה" : "סגור"}
        </button>
      </div>
    </div>
  )
}
