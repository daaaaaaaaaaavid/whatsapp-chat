"use client"

import { useState } from "react"
import { Settings2, Square, X } from "lucide-react"
import { VOICE_LANGUAGE_OPTIONS, type VoicePrefs } from "@/lib/voice-typing/prefs"

type Props = {
  listening: boolean
  starting: boolean
  intent: string | null
  error: string | null
  prefs: VoicePrefs
  settingsOpen: boolean
  onToggleSettings: () => void
  onStop: () => void
  onDismissError: () => void
  onPrefsChange: (patch: Partial<VoicePrefs>) => void
}

const TOGGLES: { key: Exclude<keyof VoicePrefs, "language">; label: string; hint: string }[] = [
  { key: "voiceCommands", label: "פקודות קוליות", hint: "«פסיק», «שורה חדשה», «מחק», «אימוג'י לב»…" },
  { key: "sendCommand", label: "שליחה בקול", hint: "«שלח» או «אנטר» שולחים את ההודעה" },
  { key: "autoPunctuation", label: "פיסוק אוטומטי", hint: "סימן שאלה, פסיקים ונקודה בסוף משפט" },
  { key: "autoStopOnSilence", label: "עצירה בשקט", hint: "המיקרופון נכבה לבד אחרי שתיקה" },
  { key: "continueAfterSend", label: "המשך אחרי שליחה", hint: "ממשיכים להקשיב להודעה הבאה" },
  { key: "soundFeedback", label: "צליל הפעלה", hint: "צפצוף קצר בהתחלה ובסוף" },
]

export function VoiceTypingBar({
  listening,
  starting,
  intent,
  error,
  prefs,
  settingsOpen,
  onToggleSettings,
  onStop,
  onDismissError,
  onPrefsChange,
}: Props) {
  const [showHelp, setShowHelp] = useState(false)
  if (!listening && !error && !settingsOpen) return null

  return (
    <div className="wa-composer mx-3 mb-1 mt-1 overflow-hidden rounded-2xl text-sm" dir="rtl">
      {error ? (
        <div className="flex items-center gap-2 px-3 py-2 text-red-700 dark:text-red-300">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="rounded-full p-1 hover:bg-black/5"
            aria-label="סגירת ההודעה"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : listening ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="font-medium text-[var(--wa-text)]">{starting ? "מפעיל מיקרופון…" : "מקשיב…"}</span>
          {intent ? (
            <span className="wa-fade-in rounded-full bg-[var(--wa-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--wa-teal-dark)]">
              {intent}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="truncate text-xs text-[var(--wa-text-secondary)] hover:underline"
            >
              {prefs.sendCommand ? "אמרו «שלח» לשליחה" : "דברו בחופשיות"}
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onToggleSettings}
            className="rounded-full p-1.5 text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
            aria-label="הגדרות הקלדה קולית"
            aria-expanded={settingsOpen}
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onStop}
            className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-500/15 dark:text-red-300"
          >
            <Square className="h-3 w-3 fill-current" />
            עצירה
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="font-medium text-[var(--wa-text)]">הגדרות הקלדה קולית</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onToggleSettings}
            className="rounded-full p-1 text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
            aria-label="סגירת ההגדרות"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showHelp && listening && !settingsOpen && (
        <div className="border-t border-[var(--wa-border)] px-3 py-2 text-xs leading-relaxed text-[var(--wa-text-secondary)]">
          פיסוק: «פסיק», «נקודה», «סימן שאלה». שורות: «שורה חדשה», «פסקה חדשה». עריכה: «מחק», «מחק משפט»,
          «מחק הכל». אימוג׳י: «אימוג׳י לב», «אימוג׳י צוחק». קיצור מקלדת: Alt+Shift+V.
        </div>
      )}

      {settingsOpen && (
        <div className="space-y-1 border-t border-[var(--wa-border)] px-3 py-2">
          <label className="flex items-center justify-between gap-3 py-1">
            <span className="text-[var(--wa-text)]">שפת זיהוי</span>
            <select
              value={prefs.language}
              onChange={(e) => onPrefsChange({ language: e.target.value })}
              className="rounded-lg bg-[var(--wa-header)] px-2 py-1 text-[var(--wa-text)] outline-none"
            >
              {VOICE_LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
          {TOGGLES.map(({ key, label, hint }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 py-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--wa-text)]">{label}</span>
                <span className="block text-xs text-[var(--wa-text-secondary)]">{hint}</span>
              </span>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => onPrefsChange({ [key]: e.target.checked })}
                className="h-4 w-4 accent-[#00a884]"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
