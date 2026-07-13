"use client"

import { useMemo, useState } from "react"
import type { Conversation, Profile } from "@/lib/types"
import { useMessages } from "@/lib/use-messages"
import { Avatar } from "./avatar"
import { convAvatarUrl, convDisplayName, isSelfConversation } from "@/lib/conversation-display"
import { mediaItemsFromMessages, type GalleryItem } from "./media-gallery"
import { X, Bell, BellOff, Ban, Trash2, Users, Archive, Star, ImageIcon, Pin } from "lucide-react"

type Props = {
  open: boolean
  conversation: Conversation
  currentUser: Profile
  onClose: () => void
  onToggleArchive?: () => void
  onToggleFavorite?: () => void
  onToggleMute?: () => void
  onTogglePinned?: () => void
  isArchived?: boolean
  isFavorite?: boolean
  isMuted?: boolean
  isPinned?: boolean
  onOpenMedia?: (messageId: string) => void
}

export function ConversationInfo({
  open,
  conversation,
  currentUser,
  onClose,
  onToggleArchive,
  onToggleFavorite,
  onToggleMute,
  onTogglePinned,
  isArchived,
  isFavorite,
  isMuted,
  isPinned,
  onOpenMedia,
}: Props) {
  const [mediaTab, setMediaTab] = useState<"all" | "image" | "video" | "file">("all")
  const { messages } = useMessages(open ? conversation.id : null, currentUser.id)

  const isSelf = isSelfConversation(conversation, currentUser.id)
  const name = convDisplayName(conversation, currentUser.id)
  const avatar = convAvatarUrl(conversation, currentUser.id)
  const others = (conversation.participants ?? []).filter((p) => p.user_id !== currentUser.id)
  const other = others[0]?.profile

  const mediaItems = useMemo(() => mediaItemsFromMessages(messages), [messages])
  const filteredMedia = useMemo(() => {
    if (mediaTab === "all") return mediaItems
    return mediaItems.filter((m) => m.type === mediaTab)
  }, [mediaItems, mediaTab])

  if (!open) return null

  return (
    <aside className="absolute inset-y-0 left-0 z-30 flex w-full max-w-md flex-col border-r border-[#e9edef] bg-white shadow-xl md:relative md:inset-auto md:z-auto md:w-[360px] md:shrink-0 md:shadow-none">
      <header className="flex h-16 items-center gap-4 bg-[#00a884] px-4 text-white">
        <button onClick={onClose} aria-label="סגור" className="rounded-full p-1 transition hover:bg-white/10">
          <X className="h-6 w-6" />
        </button>
        <h2 className="text-lg font-medium">
          {isSelf ? "פרטי השיחה" : conversation.is_group ? "פרטי קבוצה" : "פרטי איש קשר"}
        </h2>
      </header>

      <div className="wa-scroll flex-1 overflow-y-auto bg-[#f0f2f5]">
        <div className="flex flex-col items-center bg-white px-6 py-8 shadow-sm">
          <Avatar name={name} url={avatar} isGroup={conversation.is_group} isSelf={isSelf} size={200} />
          <h3 className="mt-4 text-2xl font-light text-[#111b21]">{name}</h3>
          {isSelf && <p className="mt-1 text-sm text-[#667781]">הודעות שמורות בשבילך בלבד</p>}
          {!conversation.is_group && !isSelf && other?.email && (
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

        {!conversation.is_group && !isSelf && (
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
          <div className="flex items-center gap-2 px-6 py-3 text-sm text-[#008069]">
            <ImageIcon className="h-4 w-4" />
            מדיה, קישורים ומסמכים
            <span className="mr-auto text-[#667781]">{mediaItems.length}</span>
          </div>
          <div className="flex gap-1 px-4 pb-2">
            {(
              [
                ["all", "הכל"],
                ["image", "תמונות"],
                ["video", "סרטונים"],
                ["file", "קבצים"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMediaTab(id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  mediaTab === id ? "bg-[#e7fce3] text-[#008069]" : "bg-[#f0f2f5] text-[#54656f]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredMedia.length === 0 ? (
            <p className="px-6 pb-4 text-sm text-[#667781]">אין מדיה עדיין</p>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 px-0.5 pb-2">
              {filteredMedia.slice(0, 24).map((item: GalleryItem) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onOpenMedia?.(item.id)
                    onClose()
                  }}
                  className="relative aspect-square overflow-hidden bg-[#e9edef]"
                >
                  {item.type === "image" ? (
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  ) : item.type === "video" ? (
                    <video src={item.url} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-[#54656f]">
                      קובץ
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2 bg-white shadow-sm">
          {!isSelf && onTogglePinned && (
            <button
              type="button"
              onClick={onTogglePinned}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#111b21] transition hover:bg-[#f5f6f6]"
            >
              <Pin className={`h-5 w-5 ${isPinned ? "text-[#00a884]" : "text-[#54656f]"}`} />
              {isPinned ? "בטל נעיצה" : "נעץ צ'אט"}
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={onToggleFavorite}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#111b21] transition hover:bg-[#f5f6f6]"
            >
              <Star className={`h-5 w-5 ${isFavorite ? "fill-[#25d366] text-[#25d366]" : "text-[#54656f]"}`} />
              {isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
            </button>
          )}
          {onToggleArchive && (
            <button
              type="button"
              onClick={onToggleArchive}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#111b21] transition hover:bg-[#f5f6f6]"
            >
              <Archive className="h-5 w-5 text-[#54656f]" />
              {isArchived ? "הוצא מארכיון" : "העבר לארכיון"}
            </button>
          )}
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="flex w-full items-center gap-4 px-6 py-4 text-right text-[#111b21] transition hover:bg-[#f5f6f6]"
            >
              {isMuted ? (
                <BellOff className="h-5 w-5 text-[#54656f]" />
              ) : (
                <Bell className="h-5 w-5 text-[#54656f]" />
              )}
              {isMuted ? "ביטול השתקת התראות" : "השתקת התראות"}
            </button>
          )}
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
