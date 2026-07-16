import { createClient } from "@/lib/supabase/client"
import type { PollOption, PollPayload, PollVote } from "@/lib/types"

const OPTION_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

export function newPollOptionId(): string {
  let id = ""
  for (let i = 0; i < 8; i++) {
    id += OPTION_ID_CHARS[Math.floor(Math.random() * OPTION_ID_CHARS.length)]
  }
  return id
}

export function parsePollPayload(content: string | null | undefined): PollPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as PollPayload
    if (
      parsed?.kind === "poll" &&
      typeof parsed.question === "string" &&
      Array.isArray(parsed.options) &&
      parsed.options.length >= 2
    ) {
      return {
        kind: "poll",
        question: parsed.question.trim(),
        options: parsed.options
          .filter((o): o is PollOption => Boolean(o?.id && typeof o.text === "string"))
          .map((o) => ({ id: String(o.id), text: o.text.trim() })),
        allowMultiple: Boolean(parsed.allowMultiple),
      }
    }
  } catch {
    // not a poll
  }
  return null
}

export function encodePollPayload(payload: Omit<PollPayload, "kind">): string {
  const body: PollPayload = {
    kind: "poll",
    question: payload.question.trim(),
    options: payload.options.map((o) => ({ id: o.id, text: o.text.trim() })),
    allowMultiple: Boolean(payload.allowMultiple),
  }
  return JSON.stringify(body)
}

export function pollPreviewLabel(payload: PollPayload): string {
  const q = payload.question.trim()
  return q ? `📊 סקר: ${q}` : "📊 סקר"
}

export function buildPollPayload(opts: {
  question: string
  optionTexts: string[]
  allowMultiple?: boolean
}): PollPayload | null {
  const question = opts.question.trim()
  const options = opts.optionTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((text) => ({ id: newPollOptionId(), text }))

  if (!question || options.length < 2) return null

  return {
    kind: "poll",
    question,
    options,
    allowMultiple: Boolean(opts.allowMultiple),
  }
}

export async function fetchPollVotes(messageId: string): Promise<PollVote[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from("poll_votes")
    .select("id, message_id, user_id, option_id, created_at")
    .eq("message_id", messageId)

  if (error) {
    console.error("Failed to load poll votes:", error.message)
    return []
  }
  return (data ?? []) as PollVote[]
}

export async function castPollVote(opts: {
  messageId: string
  userId: string
  optionId: string
  allowMultiple: boolean
  /** When true, remove this option vote (multi only or unvote). */
  remove?: boolean
}): Promise<{ error: string | null }> {
  const supabase = createClient()

  if (opts.remove) {
    const { error } = await supabase
      .from("poll_votes")
      .delete()
      .eq("message_id", opts.messageId)
      .eq("user_id", opts.userId)
      .eq("option_id", opts.optionId)
    return { error: error?.message ?? null }
  }

  if (!opts.allowMultiple) {
    const { error: delErr } = await supabase
      .from("poll_votes")
      .delete()
      .eq("message_id", opts.messageId)
      .eq("user_id", opts.userId)
    if (delErr) return { error: delErr.message }
  }

  const { error } = await supabase.from("poll_votes").upsert(
    {
      message_id: opts.messageId,
      user_id: opts.userId,
      option_id: opts.optionId,
    },
    { onConflict: "message_id,user_id,option_id" },
  )

  return { error: error?.message ?? null }
}

export function votesByOption(votes: PollVote[]): Map<string, PollVote[]> {
  const map = new Map<string, PollVote[]>()
  for (const v of votes) {
    const arr = map.get(v.option_id) ?? []
    arr.push(v)
    map.set(v.option_id, arr)
  }
  return map
}

export function userSelectedOptionIds(votes: PollVote[], userId: string): Set<string> {
  return new Set(votes.filter((v) => v.user_id === userId).map((v) => v.option_id))
}
