"use client"

import { Download, FileText, HardDrive, ImageIcon, LoaderCircle, Mic, Video } from "lucide-react"
import { formatFileSize } from "@/lib/format"

type MediaKind = "image" | "video" | "audio" | "file"

type Props = {
  kind: MediaKind
  fileName?: string | null
  fileSize?: number | null
  loading?: boolean
  error?: string | null
  onDownload: () => void
}

const LABELS: Record<MediaKind, string> = {
  image: "תמונה",
  video: "סרטון",
  audio: "הודעה קולית",
  file: "קובץ",
}

function KindIcon({ kind }: { kind: MediaKind }) {
  if (kind === "video") return <Video className="h-7 w-7" />
  if (kind === "audio") return <Mic className="h-7 w-7" />
  if (kind === "file") return <FileText className="h-7 w-7" />
  return <ImageIcon className="h-7 w-7" />
}

export function DriveDownloadCard({
  kind,
  fileName,
  fileSize,
  loading,
  error,
  onDownload,
}: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (!loading) onDownload()
      }}
      disabled={loading}
      className="mb-1 flex w-full max-w-xs flex-col items-center gap-2 rounded-md bg-gradient-to-b from-[#1f2c34] to-[#0b141a] px-4 py-5 text-center text-white transition hover:brightness-110 disabled:opacity-80"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#00a884]/20 text-[#25d366] ring-2 ring-[#25d366]/40">
        {loading ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <KindIcon kind={kind} />}
      </span>
      <span className="text-sm font-medium">{fileName || LABELS[kind]}</span>
      <span className="flex items-center gap-1 text-[12px] text-white/65">
        <HardDrive className="h-3.5 w-3.5" />
        {loading ? "מעתיק לדרייב שלך…" : "לחץ כדי להוריד לחשבון שלך"}
      </span>
      {fileSize ? (
        <span className="text-[11px] text-white/45">{formatFileSize(fileSize)}</span>
      ) : null}
      {error ? <span className="text-[11px] text-red-300">{error}</span> : null}
      {!loading && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[12px]">
          <Download className="h-3.5 w-3.5" />
          הורד לחשבון שלי
        </span>
      )}
    </button>
  )
}
