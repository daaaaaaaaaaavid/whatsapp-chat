"use client"

import { UsersRound } from "lucide-react"
import type { Conversation, Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import { convDisplayName, convAvatarUrl } from "@/lib/conversation-display"

type Props = {
  conversations: Conversation[]
  currentUser: Profile
  onSelect: (conversation: Conversation) => void
}

export function CommunitiesPanel({ conversations, currentUser, onSelect }: Props) {
  const groups = conversations.filter((c) => c.is_group)

  return (
    <div className="flex h-full flex-col bg-[var(--wa-panel)]" dir="rtl">
      <header className="flex h-[59px] shrink-0 items-center border-b border-[var(--wa-border)] px-4">
        <h2 className="text-[19px] font-medium text-[var(--wa-text)]">קהילות</h2>
      </header>

      {groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--wa-accent-soft)]">
            <UsersRound className="h-12 w-12 text-[#00a884]" strokeWidth={1.25} />
          </div>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            כאן מופיעות הקבוצות שלך. צור קבוצה חדשה מצ׳אטים כדי להתחיל.
          </p>
        </div>
      ) : (
        <div className="wa-scroll flex-1 overflow-y-auto">
          <p className="px-4 py-3 text-xs text-[var(--wa-text-secondary)]">קבוצות ({groups.length})</p>
          <ul>
            {groups.map((conv) => {
              const name = convDisplayName(conv, currentUser.id)
              const avatar = convAvatarUrl(conv, currentUser.id)
              const members = (conv.participants ?? []).length
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conv)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-right transition hover:bg-[var(--wa-hover)]"
                  >
                    <Avatar name={name} url={avatar} size={49} />
                    <div className="min-w-0 flex-1 border-b border-[var(--wa-border)] pb-3">
                      <div className="truncate text-[17px] text-[var(--wa-text)]">{name}</div>
                      <div className="truncate text-sm text-[var(--wa-text-secondary)]">
                        {members > 0 ? `${members} משתתפים` : "קבוצה"}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
