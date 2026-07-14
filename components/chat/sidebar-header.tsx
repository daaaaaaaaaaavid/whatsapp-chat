"use client"

import { MessageCirclePlus, MoreVertical } from "lucide-react"
import { useState, useRef, useEffect } from "react"
import { Logo } from "@/components/brand/logo"
import { ThemeToggle } from "@/components/theme-toggle"

type Props = {
  currentUserId: string
  onNewChat: () => void
  onNewGroup: () => void
  onOpenProfile: () => void
  onLogout: () => void
}

export function SidebarHeader({ currentUserId, onNewChat, onNewGroup, onOpenProfile, onLogout }: Props) {
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
    <header className="flex h-[60px] items-center justify-between bg-[var(--wa-panel)] px-4 pt-1">
      <h1>
        <Logo size={7} withWordmark wordmarkClassName="text-[22px]" />
      </h1>
      <div className="flex items-center gap-1 text-[var(--wa-text-secondary)]">
        <button
          onClick={onNewChat}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[var(--wa-hover)]"
          aria-label="צ'אט חדש"
          title="צ'אט חדש"
        >
          <MessageCirclePlus className="h-5 w-5" />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-[var(--wa-hover)]"
            aria-label="תפריט"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-11 z-20 w-56 overflow-hidden rounded-xl bg-[var(--wa-panel)] py-2 shadow-xl ring-1 ring-black/10">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onNewGroup()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
              >
                קבוצה חדשה
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onOpenProfile()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
              >
                הפרופיל שלי
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[var(--wa-text)] transition hover:bg-[var(--wa-hover)]"
              >
                התנתקות
              </button>
              <ThemeToggle userId={currentUserId} />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
