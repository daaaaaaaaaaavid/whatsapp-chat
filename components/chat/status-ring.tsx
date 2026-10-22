"use client"

import type React from "react"

type Props = {
  /** Avatar diameter; the ring is drawn just outside it. */
  size: number
  /** One flag per status, oldest first. */
  seen: boolean[]
  children: React.ReactNode
}

const STROKE = 2.5
const PAD = 3

/** WhatsApp-style segmented ring: one arc per status, gray once seen. */
export function StatusRing({ size, seen, children }: Props) {
  const outer = size + (PAD + STROKE) * 2
  const r = (outer - STROKE) / 2
  const c = 2 * Math.PI * r
  const n = Math.max(1, seen.length)
  const gap = n > 1 ? Math.min(6, c / n / 4) : 0
  const step = c / n

  return (
    <div className="relative shrink-0" style={{ width: outer, height: outer }}>
      <svg
        width={outer}
        height={outer}
        className="absolute inset-0 -rotate-90"
        aria-hidden
      >
        {Array.from({ length: n }, (_, i) => (
          <circle
            key={i}
            cx={outer / 2}
            cy={outer / 2}
            r={r}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            stroke={seen[i] ? "var(--wa-ring-seen)" : "var(--wa-ring-new)"}
            strokeDasharray={`${step - gap} ${c - step + gap}`}
            strokeDashoffset={-(i * step + gap / 2)}
          />
        ))}
      </svg>
      <div className="absolute" style={{ inset: PAD + STROKE }}>
        {children}
      </div>
    </div>
  )
}

/** The status glyph from the WhatsApp empty state: dashed ring around a dot. */
export function StatusGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="26.4 5"
      />
      <circle cx="24" cy="24" r="12.5" fill="currentColor" />
    </svg>
  )
}
