"use client"

import { Lock } from "lucide-react"

/** Full-screen WhaChat splash while chats load. */
export function LoadingScreen({ label = "טוען צ'אטים" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#f0f2f5]">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-8 flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 80 80" className="h-20 w-20 drop-shadow-sm" aria-hidden>
            <circle cx="40" cy="40" r="40" fill="#25d366" />
            <path
              fill="#fff"
              d="M24.5 27.5c0-3.6 2.9-6.5 6.5-6.5h18c3.6 0 6.5 2.9 6.5 6.5v16c0 3.6-2.9 6.5-6.5 6.5H38.2L28 58.5V50H31c-3.6 0-6.5-2.9-6.5-6.5v-16z"
            />
            <circle cx="34" cy="35.5" r="2.2" fill="#25d366" />
            <circle cx="40" cy="35.5" r="2.2" fill="#25d366" />
            <circle cx="46" cy="35.5" r="2.2" fill="#25d366" />
          </svg>
        </div>

        <h1 className="text-[28px] font-light tracking-wide text-[#41525d]">WhaChat</h1>

        <div className="mt-8 h-[3px] w-48 overflow-hidden rounded-full bg-[#e9edef]">
          <div className="wa-loading-bar h-full w-1/3 rounded-full bg-[#25d366]" />
        </div>

        <p className="mt-5 text-sm text-[#667781]">{label}</p>
      </div>

      <p className="mb-10 flex items-center gap-1.5 text-xs text-[#8696a0]">
        <Lock className="h-3 w-3" />
        מוצפן מקצה לקצה
      </p>
    </div>
  )
}
