"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { PollPayload, PollVote } from "@/lib/types"
import {
  castPollVote,
  fetchPollVotes,
  userSelectedOptionIds,
  votesByOption,
} from "@/lib/poll"
import { BarChart3, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  messageId: string
  payload: PollPayload
  currentUserId: string
  pending?: boolean
}

export function PollMessage({
  messageId,
  payload,
  currentUserId,
  pending,
}: Props) {
  const [votes, setVotes] = useState<PollVote[]>([])
  const [busyOption, setBusyOption] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (pending || messageId.startsWith("temp-")) return
    const next = await fetchPollVotes(messageId)
    setVotes(next)
  }, [messageId, pending])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (pending || messageId.startsWith("temp-")) return
    const supabase = createClient()
    const channel = supabase
      .channel(`poll-votes-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "poll_votes",
          filter: `message_id=eq.${messageId}`,
        },
        () => {
          void reload()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [messageId, pending, reload])

  const byOption = useMemo(() => votesByOption(votes), [votes])
  const selected = useMemo(
    () => userSelectedOptionIds(votes, currentUserId),
    [votes, currentUserId],
  )
  const totalVoters = useMemo(() => new Set(votes.map((v) => v.user_id)).size, [votes])
  const hasVoted = selected.size > 0
  const allowMultiple = Boolean(payload.allowMultiple)

  const onVote = async (optionId: string) => {
    if (pending || messageId.startsWith("temp-") || busyOption) return

    const already = selected.has(optionId)
    if (allowMultiple && already) {
      setBusyOption(optionId)
      setError(null)
      const { error: err } = await castPollVote({
        messageId,
        userId: currentUserId,
        optionId,
        allowMultiple,
        remove: true,
      })
      setBusyOption(null)
      if (err) {
        setError(err.includes("poll_votes") || err.includes("does not exist")
          ? "יש להריץ את migration-polls.sql ב־Supabase"
          : err)
        return
      }
      await reload()
      return
    }

    if (!allowMultiple && already) return

    setBusyOption(optionId)
    setError(null)

    // Optimistic update
    setVotes((prev) => {
      let next = prev
      if (!allowMultiple) {
        next = prev.filter((v) => v.user_id !== currentUserId)
      } else if (already) {
        next = prev.filter(
          (v) => !(v.user_id === currentUserId && v.option_id === optionId),
        )
      }
      if (!already || !allowMultiple) {
        next = [
          ...next.filter((v) => !(v.user_id === currentUserId && v.option_id === optionId)),
          {
            id: `temp-${optionId}`,
            message_id: messageId,
            user_id: currentUserId,
            option_id: optionId,
            created_at: new Date().toISOString(),
          },
        ]
      }
      return next
    })

    const { error: err } = await castPollVote({
      messageId,
      userId: currentUserId,
      optionId,
      allowMultiple,
    })
    setBusyOption(null)
    if (err) {
      setError(
        err.includes("poll_votes") || err.includes("does not exist") || err.includes("relation")
          ? "יש להריץ את migration-polls.sql ב־Supabase"
          : err,
      )
      await reload()
      return
    }
    await reload()
  }

  return (
    <div className="mb-1 min-w-[220px] max-w-xs space-y-2.5 py-0.5" dir="rtl">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#00a884]/15 text-[#00a884]">
          <BarChart3 className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug text-[var(--wa-text)]">{payload.question}</p>
          <p className="mt-0.5 text-[11px] text-[var(--wa-text-secondary)]">
            {allowMultiple ? "בחירה מרובה" : "בחירה אחת"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {payload.options.map((option) => {
          const optionVotes = byOption.get(option.id) ?? []
          const count = optionVotes.length
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0
          const isSelected = selected.has(option.id)
          const showResults = hasVoted || pending

          return (
            <button
              key={option.id}
              type="button"
              disabled={Boolean(busyOption) || pending}
              onClick={() => void onVote(option.id)}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-right transition",
                isSelected
                  ? "border-[#00a884]/50 bg-[#00a884]/10"
                  : "border-black/10 bg-black/[0.03] hover:bg-black/[0.06]",
                busyOption === option.id && "opacity-70",
              )}
            >
              {showResults && (
                <span
                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#00a884]/15 transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                    isSelected
                      ? "border-[#00a884] bg-[#00a884] text-white"
                      : "border-black/20 bg-transparent",
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--wa-text)]">
                  {option.text}
                </span>
                {showResults && (
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--wa-text-secondary)]">
                    {pct}%
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--wa-text-secondary)]">
        <span>
          {totalVoters === 0
            ? "אין הצבעות עדיין"
            : totalVoters === 1
              ? "הצבעה אחת"
              : `${totalVoters} הצבעות`}
        </span>
        {hasVoted && allowMultiple && (
          <span>לחץ שוב לביטול בחירה</span>
        )}
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}
