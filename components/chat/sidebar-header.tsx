"use client"

import { MessageCirclePlus, MoreVertical } from "lucide-react"
import { useState, useRef, useEffect } from "react"

type Props = {
  onNewChat: () => void
  onNewGroup: () => void
  onOpenProfile: () => void
  onLogout: () => void
}

export function SidebarHeader({ onNewChat, onNewGroup, onOpenProfile, onLogout }: Props) {
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
    <header className="flex h-[60px] items-center justify-between bg-white px-4 pt-1">
      <h1 className="text-[22px] font-semibold tracking-tight text-[#00a884]">WHACHAT</h1>
      <div className="flex items-center gap-1 text-[#54656f]">
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
                  onNewGroup()
                }}
                className="block w-full px-5 py-2.5 text-right text-sm text-[#3b4a54] transition hover:bg-[#f5f6f6]"
              >
                קבוצה חדשה
              </button>
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
