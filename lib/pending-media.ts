export type PendingMediaItem = {
  id: string
  file: File
  previewUrl: string | null
  kind: "image" | "video" | "file"
  caption: string
}

export function detectMediaKind(file: File): "image" | "video" | "file" | "audio" {
  const lower = file.name.toLowerCase()
  if (file.type.startsWith("audio/") || /\.(ogg|mp3|m4a|wav|aac)$/.test(lower)) return "audio"
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi|mkv|3gp)$/.test(lower)) return "video"
  if (file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic|avif)$/.test(lower)) return "image"
  return "file"
}

export function formatUploadFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function toPendingItem(file: File): PendingMediaItem | null {
  const kind = detectMediaKind(file)
  if (kind === "audio") return null
  const previewUrl =
    kind === "image" || kind === "video" ? URL.createObjectURL(file) : null
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl,
    kind,
    caption: "",
  }
}

export function revokePending(items: PendingMediaItem[]) {
  for (const item of items) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
}
