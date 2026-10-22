"use client"

import type { Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import { MessageSquare, Phone, CircleDashed, UsersRound, Briefcase, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { WEBRTC_CALLS_UI_ENABLED } from "@/lib/site-config"

export type NavTab = "chats" | "calls" | "status" | "communities" | "settings"

type Props = {
  active: NavTab
  currentUser: Profile
  unreadTotal: number
  /** When true, communities tab shows Work Spaces */
  workMode?: boolean
  onChange: (tab: NavTab) => void
  onOpenProfile: () => void
}

export function NavRail({
  active,
  currentUser,
  unreadTotal,
  workMode = false,
  onChange,
  onOpenProfile,
}: Props) {
  const items: { id: NavTab; label: string; icon: typeof MessageSquare }[] = [
    { id: "chats", label: "צ'אטים", icon: MessageSquare },
    ...(WEBRTC_CALLS_UI_ENABLED
      ? [{ id: "calls" as const, label: "שיחות", icon: Phone }]
      : []),
    { id: "status", label: "סטטוס", icon: CircleDashed },
    {
      id: "communities",
      label: workMode ? "Spaces" : "קהילות",
      icon: workMode ? Briefcase : UsersRound,
    },
    { id: "settings", label: "הגדרות", icon: Settings },
  ]

  return (
    <nav className="wa-dock flex w-[72px] shrink-0 flex-col items-center border-l border-[var(--wa-border)] py-4">
      <div className="flex flex-1 flex-col items-center gap-1.5">
        {items.map(({ id, label, icon: Icon }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              title={label}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--wa-text-secondary)] transition hover:bg-black/5",
                isActive &&
                  (workMode && id === "communities"
                    ? "bg-[#1a73e8]/15 text-[#1a73e8] shadow-[0_8px_22px_rgb(26_115_232/0.25)]"
                    : "wa-dock-active"),
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
              {id === "chats" && unreadTotal > 0 && (
                <span className="wa-badge absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                  {unreadTotal > 99 ? "99+" : unreadTotal}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onOpenProfile}
        className="mt-2 rounded-full ring-2 ring-transparent transition hover:ring-[var(--wa-teal)]/50"
        aria-label="הפרופיל שלי"
      >
        <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={38} />
      </button>
    </nav>
  )
}
