"use client"

import { UsersRound } from "lucide-react"

export function CommunitiesPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-8 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#e7fce3]">
        <UsersRound className="h-12 w-12 text-[#00a884]" strokeWidth={1.25} />
      </div>
      <h2 className="mt-6 text-2xl font-light text-[#41525d]">קהילות</h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#667781]">
        ארגן קבוצות קשורות תחת קהילה אחת וקבל הודעות מנהלים חשובות.
      </p>
    </div>
  )
}
