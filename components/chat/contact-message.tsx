"use client"

import { Avatar } from "./avatar"
import type { ContactPayload } from "@/lib/types"
import { Mail, Phone, UserRound } from "lucide-react"

type Props = {
  payload: ContactPayload
  onStartChatByEmail?: (email: string) => void
}

export function ContactMessage({ payload, onStartChatByEmail }: Props) {
  const canMessage = Boolean(payload.email && onStartChatByEmail)

  return (
    <div className="mb-1 min-w-[220px] max-w-xs overflow-hidden rounded-lg bg-black/5" dir="rtl">
      <div className="flex items-center gap-3 px-3 py-3">
        <Avatar url={payload.photoUrl} name={payload.displayName} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--wa-text)]">{payload.displayName}</div>
          {payload.phone && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--wa-text-secondary)]">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate" dir="ltr">
                {payload.phone}
              </span>
            </div>
          )}
          {payload.email && (
            <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--wa-text-secondary)]">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate" dir="ltr">
                {payload.email}
              </span>
            </div>
          )}
          {!payload.phone && !payload.email && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--wa-text-secondary)]">
              <UserRound className="h-3 w-3 shrink-0" />
              איש קשר
            </div>
          )}
        </div>
      </div>
      {canMessage && payload.email && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStartChatByEmail?.(payload.email!)
          }}
          className="w-full border-t border-black/10 px-3 py-2 text-center text-sm font-medium text-[#00a884] transition hover:bg-black/5"
        >
          שליחת הודעה
        </button>
      )}
    </div>
  )
}
