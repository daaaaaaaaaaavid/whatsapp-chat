"use client"

import { Briefcase, User } from "lucide-react"
import type { ChatSpace } from "@/lib/chat-space"
import { SPACE_LABELS } from "@/lib/chat-space"
import { cn } from "@/lib/utils"

type Props = {
  active: ChatSpace
  personalUnread: number
  workUnread: number
  onChange: (space: ChatSpace) => void
}

export function SpaceSwitcher({ active, personalUnread, workUnread, onChange }: Props) {
  const items: { id: ChatSpace; icon: typeof User; unread: number }[] = [
    { id: "personal", icon: User, unread: personalUnread },
    { id: "work", icon: Briefcase, unread: workUnread },
  ]

  return (
    <div
      className="mx-3 mb-2 flex rounded-lg bg-[var(--wa-header)] p-1"
      role="tablist"
      aria-label="מצב צ'אט"
    >
      {items.map(({ id, icon: Icon, unread }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm transition",
              isActive
                ? id === "work"
                  ? "bg-[#1a73e8]/15 font-medium text-[#1a73e8]"
                  : "bg-[var(--wa-accent-soft)] font-medium text-[#00a884]"
                : "text-[var(--wa-text-secondary)] hover:bg-black/5",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={isActive ? 2.25 : 1.75} />
            {SPACE_LABELS[id]}
            {unread > 0 && !isActive && (
              <span
                className={cn(
                  "absolute -top-0.5 left-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white",
                  id === "work" ? "bg-[#1a73e8]" : "bg-[#25d366]",
                )}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
