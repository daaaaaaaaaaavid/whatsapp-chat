"use client"

import { cn } from "@/lib/utils"

type Props = {
  live?: boolean
  count?: number
  /** 0–1. Bars up to this point use the active color. */
  progress?: number
  className?: string
}

export function VoiceWave({ live = false, count = 28, progress, className }: Props) {
  return (
    <div className={cn("flex h-8 w-full min-w-0 items-center justify-between overflow-hidden", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const height = 0.28 + ((Math.sin(i * 1.65) + 1) / 2) * 0.72
        const played = progress != null && (i + 0.5) / count <= progress
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] shrink-0 origin-center rounded-full",
              live && "wa-eq-bar",
              live || played ? "bg-[var(--wa-teal)]" : "bg-[var(--wa-text-secondary)]/45",
            )}
            style={{
              height: `${Math.round(height * 100)}%`,
              animationDelay: live ? `${(i % 8) * 80}ms` : undefined,
            }}
          />
        )
      })}
    </div>
  )
}
