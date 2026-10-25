"use client"

import { Cloud, HardDrive, ShieldCheck } from "lucide-react"
import { Modal } from "./modal"

type Props = {
  open: boolean
  connecting: boolean
  configured: boolean
  onClose: () => void
  onConnect: () => void
}

export function DriveConnectDialog({ open, connecting, configured, onClose, onConnect }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="חבר את גוגל דרייב">
      <div className="space-y-5 px-6 py-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#00a884]/15 text-[#00a884]">
            <HardDrive className="h-8 w-8" />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <p className="text-[17px] font-medium text-[var(--wa-text)]">הקבצים שלך נשארים אצלך</p>
          <p className="text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            תמונות, סרטונים וסטטוסים נשמרים בתיקייה של WhaChat בגוגל דרייב שלך. אנחנו לא שומרים אותם אצלנו.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-[var(--wa-text)]">
          <li className="flex items-start gap-3">
            <Cloud className="mt-0.5 h-5 w-5 shrink-0 text-[#00a884]" />
            <span>כשאתה שולח — הקובץ עולה לחשבון שלך</span>
          </li>
          <li className="flex items-start gap-3">
            <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-[#00a884]" />
            <span>כדי לצפות, הנמען לוחץ ומעתיק את הקובץ לדרייב שלו</span>
          </li>
          <li className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#00a884]" />
            <span>הגישה היא רק לקבצים ש־WhaChat יוצר, לא לכל הדרייב</span>
          </li>
        </ul>
        {!configured && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            חסרים מפתחות Google בשרת. הוסף GOOGLE_OAUTH_CLIENT_ID ו־GOOGLE_OAUTH_CLIENT_SECRET.
          </p>
        )}
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || !configured}
          className="flex h-12 w-full items-center justify-center rounded-full bg-[#00a884] text-[15px] font-medium text-white transition hover:bg-[#019a78] disabled:opacity-50"
        >
          {connecting ? "פותח את גוגל…" : "המשך עם גוגל"}
        </button>
        <p className="text-center text-[11px] text-[var(--wa-text-secondary)]">
          אפשר לנתק בכל רגע מהפרופיל. בלי דרייב אי אפשר לשלוח או להוריד מדיה.
        </p>
      </div>
    </Modal>
  )
}
