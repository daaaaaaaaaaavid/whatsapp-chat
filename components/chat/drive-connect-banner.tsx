"use client"

import { HardDrive } from "lucide-react"
import { useDriveOptional } from "./drive-provider"

export function DriveConnectBanner() {
  const drive = useDriveOptional()
  if (!drive || !drive.ready || drive.connected) return null

  return (
    <div className="border-b border-[#00a884]/20 bg-[#00a884]/10 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white">
          <HardDrive className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-[var(--wa-text)]">התמונות נשמרות אצלך בדרייב</p>
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--wa-text-secondary)]">
            חבר פעם אחת. אחר כך שליחה וצפייה הן לחיצה אחת.
          </p>
          <button
            type="button"
            onClick={drive.requestConnect}
            className="mt-2 rounded-full bg-[#00a884] px-3 py-1 text-[12px] font-medium text-white"
          >
            חבר את גוגל דרייב
          </button>
        </div>
      </div>
    </div>
  )
}
