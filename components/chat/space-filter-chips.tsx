"use client"

import { Plus } from "lucide-react"
import type { WorkSpace } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  spaces: WorkSpace[]
  selectedSpaceId: string | null
  onSelect: (spaceId: string | null) => void
  onCreateSpace: () => void
}

export function SpaceFilterChips({ spaces, selectedSpaceId, onSelect, onCreateSpace }: Props) {
  if (spaces.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={onCreateSpace}
          className="flex items-center gap-1 rounded-full bg-[#1a73e8]/10 px-3 py-1.5 text-xs font-medium text-[#1a73e8]"
        >
          <Plus className="h-3.5 w-3.5" />
          צור Space ראשון
        </button>
      </div>
    )
  }

  return (
    <div className="wa-scroll flex gap-1.5 overflow-x-auto px-3 pb-2" dir="rtl">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 rounded-full px-3 py-1.5 text-xs transition",
          selectedSpaceId === null
            ? "bg-[#1a73e8] text-white"
            : "bg-[var(--wa-header)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]",
        )}
      >
        הכל
      </button>
      {spaces.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className={cn(
            "max-w-[140px] shrink-0 truncate rounded-full px-3 py-1.5 text-xs transition",
            selectedSpaceId === s.id
              ? "bg-[#1a73e8] text-white"
              : "bg-[var(--wa-header)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]",
          )}
          title={s.name}
        >
          {s.name}
        </button>
      ))}
      <button
        type="button"
        onClick={onCreateSpace}
        className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--wa-header)] px-2.5 py-1.5 text-xs text-[#1a73e8] hover:bg-[#1a73e8]/10"
        aria-label="Space חדש"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
