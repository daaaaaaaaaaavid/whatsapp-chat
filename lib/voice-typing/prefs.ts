/** User-facing voice typing options (no engine import — safe for the initial chat bundle). */
export type VoicePrefs = {
  language: string
  autoPunctuation: boolean
  voiceCommands: boolean
  sendCommand: boolean
  autoStopOnSilence: boolean
  continueAfterSend: boolean
  soundFeedback: boolean
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  language: "he-IL",
  autoPunctuation: true,
  voiceCommands: true,
  sendCommand: true,
  autoStopOnSilence: true,
  continueAfterSend: false,
  soundFeedback: true,
}

export const VOICE_LANGUAGE_OPTIONS = [
  { code: "he-IL", label: "עברית" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "ar-IL", label: "العربية" },
  { code: "ru-RU", label: "Русский" },
  { code: "fr-FR", label: "Français" },
  { code: "es-ES", label: "Español" },
  { code: "de-DE", label: "Deutsch" },
  { code: "yi-DE", label: "ייִדיש" },
] as const

const STORAGE_KEY = "whachat-voice-typing"

export function loadVoicePrefs(): VoicePrefs {
  if (typeof window === "undefined") return { ...DEFAULT_VOICE_PREFS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VOICE_PREFS }
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>
    return { ...DEFAULT_VOICE_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_VOICE_PREFS }
  }
}

export function saveVoicePrefs(prefs: VoicePrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // storage full / private mode
  }
}
