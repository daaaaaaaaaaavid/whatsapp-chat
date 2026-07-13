"use client"

import type { Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import { MessageSquare, Phone, CircleDashed, UsersRound, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export type NavTab = "chats" | "calls" | "status" | "communities" | "settings"

type Props = {
  active: NavTab
  currentUser: Profile
  unreadTotal: number
  onChange: (tab: NavTab) => void
  onOpenProfile: () => void
}

const items: { id: NavTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chats", label: "צ'אטים", icon: MessageSquare },
  { id: "calls", label: "שיחות", icon: Phone },
  { id: "status", label: "סטטוס", icon: CircleDashed },
  { id: "communities", label: "קהילות", icon: UsersRound },
  { id: "settings", label: "הגדרות", icon: Settings },
]

export function NavRail({ active, currentUser, unreadTotal, onChange, onOpenProfile }: Props) {
  return (
    <nav className="flex w-[60px] shrink-0 flex-col items-center border-l border-[#e9edef] bg-[#f0f2f5] py-3">
      <div className="flex flex-1 flex-col items-center gap-1">
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
                "relative flex h-11 w-11 items-center justify-center rounded-full text-[#54656f] transition hover:bg-black/5",
                isActive && "bg-[#e7fce3] text-[#00a884]",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
              {id === "chats" && unreadTotal > 0 && (
                <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-medium text-white">
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
        className="mt-2 rounded-full ring-2 ring-transparent transition hover:ring-[#00a884]/40"
        aria-label="הפרופיל שלי"
      >
        <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={36} />
      </button>
    </nav>
  )
}
