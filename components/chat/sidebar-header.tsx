"use client"

import { Avatar } from "./avatar"
import { MessageCirclePlus, CircleDashed, MoreVertical, Users } from "lucide-react"
import type { Profile } from "@/lib/types"
import { useState, useRef, useEffect } from "react"

type Props = {
  currentUser: Profile
  onNewChat: () => void
  onNewGroup: () => void
  onOpenStatus: () => void
  onOpenProfile: () => void
  onLogout: () => void
}

export function SidebarHeader({
  currentUser,
  onNewChat,
  onNewGroup,
  onOpenStatus,
  onOpenProfile,
  onLogout,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  return (
    <header className="flex h-16 items-center justify-between bg-[#f0f2f5] px-4">
      <button onClick={onOpenProfile} className="rounded-full" aria-label="הפרופיל שלי">
        <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={40} />
      </button>
      <div className="flex items-center gap-1 text-[#54656f]">
        <button
          onClick={onOpenStatus}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
          aria-label="סטטוס"
          title="סטטוס"
        >
          <CircleDashed className="h-5 w-5" />
        </button>
        <button
          onClick={onNewGroup}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
          aria-label="קבוצה חדשה"
          title="קבוצה חדשה"
        >
          <Users className="h-5 w-5" />
        </button>
        <button
          onClick={onNewChat}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
          aria-label="צ'אט חדש"
          title="צ'אט חדש"
        >
          <MessageCirclePlus className="h-5 w-5" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5"
            aria-label="תפריט"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-11 z-20 w-52 overflow-hidden rounded-md bg-white py-2 shadow-lg ring-1 ring-black/5">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onOpenProfile()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] transition hover:bg-[#f5f6f6]"
              >
                הפרופיל שלי
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onNewGroup()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] transition hover:bg-[#f5f6f6]"
              >
                קבוצה חדשה
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] transition hover:bg-[#f5f6f6]"
              >
                התנתקות
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
