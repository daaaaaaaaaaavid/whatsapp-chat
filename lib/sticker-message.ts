import type { StickerPayload } from "@/lib/types"

export function parseStickerPayload(content: string | null | undefined): StickerPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as StickerPayload
    if (parsed?.kind === "sticker") return { kind: "sticker" }
  } catch {
    // not a sticker marker
  }
  return null
}

export function encodeStickerPayload(): string {
  return JSON.stringify({ kind: "sticker" } satisfies StickerPayload)
}

export function stickerPreviewLabel(): string {
  return "🎨 מדבקה"
}

export function isStickerMessage(message: {
  type?: string
  content?: string | null
}): boolean {
  if (message.type === "sticker") return true
  return Boolean(parseStickerPayload(message.content))
}
