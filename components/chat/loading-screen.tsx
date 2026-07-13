"use client"

import { Lock } from "lucide-react"

/** Full-screen WhatsApp-style splash while chats load. */
export function LoadingScreen({ label = "טוען צ'אטים" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#f0f2f5]">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mb-8 flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 80 80" className="h-20 w-20 drop-shadow-sm" aria-hidden>
            <circle cx="40" cy="40" r="40" fill="#25d366" />
            <path
              fill="#fff"
              d="M57.3 47.2c-.9-.4-5.2-2.6-6-2.9-.8-.3-1.4-.4-2 .4-.6.9-2.2 2.9-2.7 3.4-.5.6-1 .6-1.9.2-.9-.4-3.7-1.4-7-4.3-2.6-2.3-4.3-5.2-4.8-6.1-.5-.9-.1-1.4.4-1.8.4-.4.9-.9 1.3-1.4.4-.5.6-.8.9-1.4.3-.6.1-1.1-.1-1.5-.2-.4-2-4.8-2.7-6.6-.7-1.7-1.4-1.5-2-1.5h-1.7c-.6 0-1.5.2-2.3 1.1-.8.9-3 2.9-3 7.1s3.1 8.2 3.5 8.8c.4.6 6.1 9.3 14.7 13 2.1.9 3.7 1.4 4.9 1.8 2.1.7 4 .6 5.5.3 1.7-.3 5.2-2.1 5.9-4.2.7-2.1.7-3.8.5-4.2-.2-.3-.8-.6-1.7-1z"
            />
          </svg>
        </div>

        <h1 className="text-[28px] font-light tracking-wide text-[#41525d]">WhatsApp</h1>

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
