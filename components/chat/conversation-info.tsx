"use client"

import type { Conversation, Profile } from "@/lib/types"
import { Avatar } from "./avatar"
import { convAvatarUrl, convDisplayName } from "@/lib/conversation-display"
import { X, Bell, Ban, Trash2, Users } from "lucide-react"

type Props = {
  open: boolean
  conversation: Conversation
  currentUser: Profile
  onClose: () => void
}

export function ConversationInfo({ open, conversation, currentUser, onClose }: Props) {
  if (!open) return null

  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)
  const others = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const other = others[0]?.profile

  return (
    <aside className="absolute inset-y-0 left-0 z-30 flex w-full max-w-md flex-col border-r border-[#e9edef] bg-white shadow-xl md:relative md:inset-auto md:z-auto md:w-[360px] md:shrink-0 md:shadow-none">
      <header className="flex h-16 items-center gap-4 bg-[#00a884] px-4 text-white">
        <button onClick={onClose} aria-label="סגור" className="rounded-full p-1 transition hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-lg font-medium">{conversation.is_group ? "פרטי קבוצה" : "פרטי איש קשר"}</h2>
      </header>

      <div className="wa-scroll flex-1 overflow-y-auto bg-[#f0f2f5]">
        <div className="flex flex-col items-center bg-white px-6 py-8 shadow-sm">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} size={200} />
          <h3 className="mt-4 text-2xl font-light text-[#111b21]">{name}</h3>
          {!conversation.is_group && other?.email && (
            <p className="mt-1 text-sm text-[#667781]" dir="ltr">
              {other.email}
            </p>
          )}
          {conversation.is_group && (
            <p className="mt-1 text-sm text-[#667781]">
              קבוצה · {(conversation.participants ?? []).length} משתתפים
            </p>
          )}
        </div>

        {!conversation.is_group && (
          <div className="mt-2 bg-white px-6 py-4 shadow-sm">
            <div className="text-sm text-[#008069]">מידע</div>
            <p className="mt-1 text-[#111b21]">{other?.about ?? "זמין"}</p>
          </div>
        )}

        {conversation.is_group && (
          <div className="mt-2 bg-white shadow-sm">
            <div className="flex items-center gap-2 px-6 py-3 text-sm text-[#008069]">
              <Users className="h-4 w-4" />
              {(conversation.participants ?? []).length} משתתפים
            </div>
            {(conversation.participants ?? []).map((p) => {
              const profile = p.profile
              const label =
                p.user_id === currentUser.id
                  ? "אתה"
                  : (profile?.display_name ?? profile?.email ?? "משתמש")
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={profile?.display_name} url={profile?.avatar_url} size={40} />
                  <div className="min-w-0 flex-1 border-b border-[#e9edef] pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[#111b21]">{label}</span>
                      {p.is_admin && (
                        <span className="shrink-0 rounded bg-[#e7fce3] px-1.5 py-0.5 text-[10px] font-medium text-[#008069]">
                          מנהל/ת
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-[#667781]">{profile?.about ?? "זמין"}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-2 bg-white shadow-sm">
          <button
            type="button"
            className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#111b21] transition hover:bg-[#f5f6f6]"
          >
            <Bell className="h-5 w-5 text-[#54656f]" />
            השתקת התראות
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#ea0038] transition hover:bg-[#f5f6f6]"
          >
            <Ban className="h-5 w-5" />
            {conversation.is_group ? "יציאה מהקבוצה" : "חסימת איש קשר"}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#ea0038] transition hover:bg-[#f5f6f6]"
          >
            <Trash2 className="h-5 w-5" />
            מחיקת הצ&apos;אט
          </button>
        </div>
      </div>
    </aside>
  )
}
