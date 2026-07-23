export type MentionKind = "user" | "group"

export type MentionRef = {
  kind: MentionKind
  id: string
  label: string
}

export type MentionCandidate = MentionRef & {
  avatarUrl?: string | null
}

const UUID_RE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

/** Stored form: @[Display Name](user:uuid) or @[Group](group:uuid) */
export const MENTION_TOKEN_RE = new RegExp(
  `@\\[([^\\]]+)\\]\\((user|group):(${UUID_RE})\\)`,
  "g",
)

export function formatMentionToken(mention: MentionRef): string {
  const label = mention.label.replace(/[\[\]]/g, "").trim() || "משתמש"
  return `@[${label}](${mention.kind}:${mention.id})`
}

export function extractMentions(text: string): MentionRef[] {
  const out: MentionRef[] = []
  const seen = new Set<string>()
  const re = new RegExp(MENTION_TOKEN_RE.source, "g")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const key = `${m[2]}:${m[3]}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      label: m[1],
      kind: m[2] as MentionKind,
      id: m[3],
    })
  }
  return out
}

/** Convert stored tokens to readable `@Name` for composer / previews / copy. */
export function mentionTokensToAtNames(text: string): string {
  return text.replace(new RegExp(MENTION_TOKEN_RE.source, "g"), (_full, label: string) => `@${label}`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Replace plain `@Label` occurrences with stable tokens.
 * Existing tokens are left intact.
 */
export function encodeMentions(text: string, mentions: MentionRef[]): string {
  if (!mentions.length) return text

  const protectedTokens: string[] = []
  let working = text.replace(new RegExp(MENTION_TOKEN_RE.source, "g"), (token) => {
    const idx = protectedTokens.length
    protectedTokens.push(token)
    return `\u0000M${idx}\u0000`
  })

  const byKey = new Map<string, MentionRef>()
  for (const mention of mentions) {
    const label = mention.label.trim()
    if (!label) continue
    byKey.set(`${mention.kind}:${mention.id}`, { ...mention, label })
  }

  const unique = Array.from(byKey.values()).sort((a, b) => b.label.length - a.label.length)

  for (const mention of unique) {
    const re = new RegExp(
      `@${escapeRegExp(mention.label)}(?=$|[\\s.,!?;:)\\]}"'\\u200f\\u200e])`,
      "gi",
    )
    working = working.replace(re, () => {
      const idx = protectedTokens.length
      protectedTokens.push(formatMentionToken(mention))
      return `\u0000M${idx}\u0000`
    })
  }

  return working.replace(/\u0000M(\d+)\u0000/g, (_full, idx: string) => protectedTokens[Number(idx)] ?? "")
}

/** Detect an in-progress `@query` at the caret (not part of an email). */
export function findMentionQuery(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, safeCursor)
  const atIndex = before.lastIndexOf("@")
  if (atIndex < 0) return null

  if (atIndex > 0) {
    const prev = before[atIndex - 1]!
    // Avoid treating emails like name@domain as mentions
    if (/[\w.]/u.test(prev)) return null
  }

  const query = before.slice(atIndex + 1)
  if (query.includes("\n")) return null
  // Cap query length so huge pastes don't open the picker
  if (query.length > 64) return null

  return { start: atIndex, query }
}

export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = 8,
): MentionCandidate[] {
  const q = query.trim().toLowerCase()
  const ranked = candidates
    .filter((c) => c.label.trim().length > 0)
    .filter((c) => (q ? c.label.toLowerCase().includes(q) : true))
    .sort((a, b) => {
      const aLabel = a.label.toLowerCase()
      const bLabel = b.label.toLowerCase()
      if (q) {
        const aStarts = aLabel.startsWith(q) ? 0 : 1
        const bStarts = bLabel.startsWith(q) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
      }
      if (a.kind !== b.kind) return a.kind === "user" ? -1 : 1
      return aLabel.localeCompare(bLabel, "he")
    })

  const seen = new Set<string>()
  const out: MentionCandidate[] = []
  for (const c of ranked) {
    const key = `${c.kind}:${c.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
    if (out.length >= limit) break
  }
  return out
}

/** Build mention list from conversation participants + known group chats. */
export function buildMentionCandidates(options: {
  currentUserId: string
  participants: Array<{
    user_id: string
    profile?: {
      display_name?: string | null
      email?: string | null
      avatar_url?: string | null
    }
  }>
  conversations: Array<{
    id: string
    is_group: boolean
    name?: string | null
    avatar_url?: string | null
    participants?: Array<{
      user_id: string
      profile?: {
        display_name?: string | null
        email?: string | null
        avatar_url?: string | null
      }
    }>
  }>
}): MentionCandidate[] {
  const { currentUserId, participants, conversations } = options
  const out: MentionCandidate[] = []
  const seenUsers = new Set<string>()
  const seenGroups = new Set<string>()

  const pushUser = (
    userId: string,
    profile?: {
      display_name?: string | null
      email?: string | null
      avatar_url?: string | null
    },
  ) => {
    if (!userId || userId === currentUserId || seenUsers.has(userId)) return
    seenUsers.add(userId)
    out.push({
      kind: "user",
      id: userId,
      label: profile?.display_name?.trim() || profile?.email?.trim() || "משתמש",
      avatarUrl: profile?.avatar_url ?? null,
    })
  }

  for (const p of participants) {
    pushUser(p.user_id, p.profile)
  }

  for (const conv of conversations) {
    if (conv.is_group) {
      if (seenGroups.has(conv.id)) continue
      seenGroups.add(conv.id)
      out.push({
        kind: "group",
        id: conv.id,
        label: conv.name?.trim() || "קבוצה",
        avatarUrl: conv.avatar_url ?? null,
      })
      continue
    }
    for (const p of conv.participants ?? []) {
      pushUser(p.user_id, p.profile)
    }
  }

  return out
}
