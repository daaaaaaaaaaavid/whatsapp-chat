"use client"

import { useEffect, useState } from "react"
import { AudioLines, Settings2, Square, X } from "lucide-react"
import { VOICE_LANGUAGE_OPTIONS, type VoicePrefs } from "@/lib/voice-typing/prefs"
import { formatCallDuration } from "@/lib/format"
import { cn } from "@/lib/utils"
import { VoiceWave } from "./voice-wave"

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

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative h-[26px] w-11 shrink-0 rounded-full transition-colors",
        on ? "bg-[var(--wa-teal)]" : "bg-black/10 dark:bg-white/15",
      )}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-[inset-inline-start]"
        style={{ insetInlineStart: on ? 21 : 3 }}
      />
    </span>
  )
}

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
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!listening) return
    const started = performance.now()
    const id = window.setInterval(() => {
      setElapsed((performance.now() - started) / 1000)
    }, 250)
    return () => {
      window.clearInterval(id)
      setElapsed(0)
    }
  }, [listening])

  if (!listening && !error && !settingsOpen) return null

  const hint = prefs.sendCommand ? "אמרו «שלח» לשליחה" : "דברו בחופשיות"

  return (
    <div className="wa-composer mx-2 mb-1 mt-1 overflow-hidden rounded-[1.35rem] text-sm" dir="rtl">
      {error ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-red-700 dark:text-red-300">
          <span className="min-w-0 flex-1 leading-snug">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/5"
            aria-label="סגירת ההודעה"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : listening ? (
        <div className="px-2.5 pt-2.5">
          <div className="flex items-center gap-2.5">
            <span className="wa-voice-orb relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#04241c]">
              <AudioLines className="relative h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight text-[var(--wa-text)]" aria-live="polite">
                  {starting ? "מתחבר למיקרופון" : "מקשיב"}
                </span>
                <span className="tabular-nums text-xs font-medium text-[var(--wa-text-secondary)]" dir="ltr">
                  {formatCallDuration(elapsed)}
                </span>
                {intent ? (
                  <span className="wa-fade-in truncate rounded-full bg-[var(--wa-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--wa-teal-dark)]">
                    {intent}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                className="mt-0.5 block max-w-full truncate text-[11px] text-[var(--wa-text-secondary)] hover:text-[var(--wa-text)]"
                aria-expanded={showHelp}
              >
                {hint}
              </button>
            </div>
            <button
              type="button"
              onClick={onToggleSettings}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition",
                settingsOpen
                  ? "bg-[var(--wa-accent-soft)] text-[var(--wa-teal-dark)]"
                  : "text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]",
              )}
              aria-label="הגדרות הקלדה קולית"
              aria-expanded={settingsOpen}
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onStop}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-[0_8px_18px_rgb(255_59_48/0.28)] transition hover:brightness-105"
              aria-label="עצירת הקלדה קולית"
              title="עצירה"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </div>
          <VoiceWave live count={34} className="mt-1.5 mb-2.5 h-6 px-1" />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="font-semibold text-[var(--wa-text)]">הקלדה קולית</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onToggleSettings}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--wa-text-secondary)] hover:bg-[var(--wa-hover)]"
            aria-label="סגירת ההגדרות"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showHelp && listening && !settingsOpen && (
        <div className="border-t border-[var(--wa-border)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--wa-text-secondary)]">
          פיסוק: «פסיק», «נקודה», «סימן שאלה». שורות: «שורה חדשה», «פסקה חדשה». עריכה: «מחק», «מחק משפט»,
          «מחק הכל». אימוג׳י: «אימוג׳י לב», «אימוג׳י צוחק». קיצור: Alt+Shift+V.
        </div>
      )}

      {settingsOpen && (
        <div className="space-y-0.5 border-t border-[var(--wa-border)] px-2 py-2">
          <label className="flex items-center justify-between gap-3 rounded-2xl px-2 py-2">
            <span className="text-[var(--wa-text)]">שפת זיהוי</span>
            <select
              value={prefs.language}
              onChange={(e) => onPrefsChange({ language: e.target.value })}
              className="rounded-full bg-[var(--wa-header)] px-3 py-1.5 text-[var(--wa-text)] outline-none ring-1 ring-[var(--wa-border)]"
            >
              {VOICE_LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>
          {TOGGLES.map(({ key, label, hint: toggleHint }) => (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={prefs[key]}
              onClick={() => onPrefsChange({ [key]: !prefs[key] })}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-right transition hover:bg-[var(--wa-hover)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--wa-text)]">{label}</span>
                <span className="block text-xs text-[var(--wa-text-secondary)]">{toggleHint}</span>
              </span>
              <Switch on={prefs[key]} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
