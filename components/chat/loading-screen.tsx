"use client"

import { Lock } from "lucide-react"
import { Logo } from "@/components/brand/logo"

/** Full-screen WhaChat splash while chats load. */
export function LoadingScreen({ label = "טוען צ'אטים" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#f0f2f5]">
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Logo size={20} className="mb-8" />

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
