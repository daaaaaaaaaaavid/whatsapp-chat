"use client"

import { Lock } from "lucide-react"
import { Logo } from "@/components/brand/logo"

/** Full-screen splash while chats load. */
export function LoadingScreen({ label = "טוען צ'אטים" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center px-6">
      <div className="wa-auth-card wa-fade-in flex w-full max-w-sm flex-col items-center px-10 py-12 text-center">
        <div className="wa-logo-glow mb-6">
          <Logo size={18} />
        </div>

        <h1 className="text-[28px] font-medium text-[var(--wa-heading)]">WhaChat</h1>

        <div className="mt-8 h-[3px] w-44 overflow-hidden rounded-full bg-[var(--wa-border)]">
          <div className="wa-loading-bar h-full w-1/3 rounded-full bg-[var(--wa-teal)] shadow-[0_0_16px_var(--wa-glow)]" />
        </div>

        <p className="mt-5 text-sm text-[var(--wa-text-secondary)]">{label}</p>
      </div>

      <p className="mt-8 flex items-center gap-1.5 text-xs text-[var(--wa-text-secondary)]">
        <Lock className="h-3 w-3" />
        השיחה נשארת בין המשתתפים
      </p>
    </div>
  )
}
