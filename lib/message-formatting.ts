import { mentionTokensToAtNames } from "@/lib/mentions"

export type MessageFormatting = {
  bold: boolean
  italic: boolean
  color: string | null
}

export const DEFAULT_MESSAGE_FORMATTING: MessageFormatting = {
  bold: false,
  italic: false,
  color: null,
}

const FORMAT_PREFIX = "[[whachat-format:"
const FORMAT_RE = /^\[\[whachat-format:v1;b=([01]);i=([01]);c=(#[0-9a-fA-F]{6}|none)\]\]/

export const MESSAGE_COLORS = [
  { value: null, label: "רגיל" },
  { value: "#e11d48", label: "אדום" },
  { value: "#ea580c", label: "כתום" },
  { value: "#ca8a04", label: "צהוב" },
  { value: "#16a34a", label: "ירוק" },
  { value: "#0284c7", label: "כחול" },
  { value: "#7c3aed", label: "סגול" },
] as const

export function encodeFormattedMessage(text: string, formatting: MessageFormatting): string {
  if (!formatting.bold && !formatting.italic && !formatting.color) return text

  const color = formatting.color && /^#[0-9a-fA-F]{6}$/.test(formatting.color)
    ? formatting.color.toLowerCase()
    : "none"

  return `${FORMAT_PREFIX}v1;b=${formatting.bold ? 1 : 0};i=${formatting.italic ? 1 : 0};c=${color}]]${text}`
}

export function decodeFormattedMessage(content: string | null | undefined): {
  text: string
  formatting: MessageFormatting
} {
  const value = content ?? ""
  const match = value.match(FORMAT_RE)
  if (!match) return { text: value, formatting: { ...DEFAULT_MESSAGE_FORMATTING } }

  return {
    text: value.slice(match[0].length),
    formatting: {
      bold: match[1] === "1",
      italic: match[2] === "1",
      color: match[3] === "none" ? null : match[3].toLowerCase(),
    },
  }
}

export function plainMessageText(content: string | null | undefined): string {
  return mentionTokensToAtNames(decodeFormattedMessage(content).text)
}

const KEYCAP_EMOJI_RE = /^[#*0-9]\uFE0F?\u20E3$/u
const FLAG_EMOJI_RE = /^\p{Regional_Indicator}{2}$/u
const PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u

function isEmojiGrapheme(grapheme: string): boolean {
  if (KEYCAP_EMOJI_RE.test(grapheme) || FLAG_EMOJI_RE.test(grapheme)) return true
  return PICTOGRAPHIC_RE.test(grapheme)
}

/** True when the message is a single emoji (WhatsApp-style large emoji). */
export function isStandaloneEmojiText(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim()
  if (!trimmed) return false

  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].map(
    (part) => part.segment,
  )
  if (graphemes.length !== 1) return false
  return isEmojiGrapheme(graphemes[0]!)
}
