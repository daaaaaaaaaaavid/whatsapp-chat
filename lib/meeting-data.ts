export const MEETING_REACTION_EMOJIS = [
  "❤️",
  "😂",
  "🔥",
  "👏",
  "😮",
  "🎉",
  "👍",
  "🙌",
] as const

export type MeetingReactionMsg = {
  type: "reaction"
  id: string
  emoji: string
  by: string
  byName: string
}

export type MeetingHandMsg = {
  type: "hand"
  raised: boolean
  by: string
}

export type MeetingDataMsg = MeetingReactionMsg | MeetingHandMsg

export type FloatingMeetingReaction = {
  id: string
  emoji: string
  byName: string
  createdAt: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function encodeMeetingData(msg: MeetingDataMsg): Uint8Array {
  return encoder.encode(JSON.stringify(msg))
}

export function parseMeetingData(data: Uint8Array): MeetingDataMsg | null {
  try {
    const raw = JSON.parse(decoder.decode(data)) as Partial<MeetingDataMsg>
    if (!raw || typeof raw !== "object" || typeof raw.type !== "string") return null
    if (raw.type === "reaction") {
      if (
        typeof raw.id !== "string" ||
        typeof raw.emoji !== "string" ||
        typeof raw.by !== "string"
      ) {
        return null
      }
      return {
        type: "reaction",
        id: raw.id,
        emoji: raw.emoji,
        by: raw.by,
        byName: typeof raw.byName === "string" ? raw.byName : "",
      }
    }
    if (raw.type === "hand") {
      if (typeof raw.by !== "string" || typeof raw.raised !== "boolean") return null
      return { type: "hand", by: raw.by, raised: raw.raised }
    }
    return null
  } catch {
    return null
  }
}

export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function participantDisplayName(
  name: string | undefined,
  identity: string,
): string {
  const n = name?.trim()
  if (n) return n
  if (identity.length <= 10) return identity
  return identity.slice(0, 8)
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}
