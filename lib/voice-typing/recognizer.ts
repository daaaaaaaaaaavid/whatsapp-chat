/**
 * Continuous Web Speech recognition — port of the extension's offscreen.js
 * (dedupes repeated finals, auto-restarts when Chrome ends the session).
 */

type SpeechAlternative = { transcript: string }
type SpeechResult = { isFinal: boolean; length: number; [index: number]: SpeechAlternative }
type SpeechResultEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } }
type SpeechErrorEvent = { error?: string }

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isVoiceTypingSupported(): boolean {
  return recognitionCtor() !== null
}

export type RecognizerError = "denied" | "network" | "unsupported" | "start-failed" | string

export type RecognizerCallbacks = {
  onStart: () => void
  onInterim: (text: string) => void
  onFinal: (text: string, alts: string[]) => void
  onError: (error: RecognizerError) => void
  onStop: () => void
}

const TRAILING_PUNCT = /[\s,.;:?!…]+$/g
const SEP = /[\s,.;:?!…]/

function speechCore(s: string) {
  return String(s || "")
    .trim()
    .replace(TRAILING_PUNCT, "")
}

export class VoiceRecognizer {
  private recognition: SpeechRecognitionLike | null = null
  private wanted = false
  private startedAnnounced = false
  private processedFinals = 0
  private lastFinalText = ""
  private lastFinalAt = 0
  private language = "he-IL"

  constructor(private readonly cb: RecognizerCallbacks) {}

  get active() {
    return this.wanted
  }

  start(language: string) {
    const Ctor = recognitionCtor()
    if (!Ctor) {
      this.cb.onError("unsupported")
      return
    }
    this.language = language || "he-IL"
    if (!this.wanted) this.startedAnnounced = false
    this.wanted = true
    this.forgetFinals()
    const rec = this.ensureRecognition(Ctor)
    rec.lang = this.language
    try {
      rec.start()
    } catch {
      window.setTimeout(() => {
        if (!this.wanted) return
        try {
          rec.start()
        } catch {
          this.cb.onError("start-failed")
        }
      }, 160)
    }
  }

  /** Restart with fresh state (e.g. after a destructive command) so stale finals are not replayed. */
  restart(language?: string) {
    if (!this.wanted) return
    if (language) this.language = language
    const Ctor = recognitionCtor()
    if (!Ctor) return
    this.forgetFinals()
    this.kill()
    const rec = this.ensureRecognition(Ctor)
    rec.lang = this.language
    try {
      rec.start()
    } catch {
      window.setTimeout(() => {
        if (!this.wanted || this.recognition !== rec) return
        try {
          rec.start()
        } catch {
          // ignore
        }
      }, 80)
    }
  }

  stop() {
    const was = this.wanted
    this.wanted = false
    this.startedAnnounced = false
    this.forgetFinals()
    this.kill()
    if (was) this.cb.onStop()
  }

  private forgetFinals() {
    this.lastFinalText = ""
    this.lastFinalAt = 0
    this.processedFinals = 0
  }

  private peelCommitted(text: string): string {
    const raw = String(text || "").trim()
    if (!raw) return ""
    const last = this.lastFinalText.trim()
    if (!last) return raw
    const recent = Date.now() - this.lastFinalAt < 700
    if (raw === last) return recent ? "" : raw
    const lastCore = speechCore(last)
    const rawCore = speechCore(raw)
    if (lastCore && rawCore === lastCore) return recent ? "" : raw
    if (lastCore && last.startsWith(rawCore)) {
      const ch = last.charAt(rawCore.length)
      if (!ch || SEP.test(ch)) return ""
    }
    if (lastCore && raw.startsWith(lastCore)) {
      const ch = raw.charAt(lastCore.length)
      if (!ch || SEP.test(ch)) {
        return raw.slice(lastCore.length).replace(/^[\s,.;:?!…]+/, "").trim()
      }
    }
    return raw
  }

  private rememberFinal(raw: string) {
    const text = String(raw || "").trim()
    if (!text) return
    if (
      !this.lastFinalText ||
      text.length >= this.lastFinalText.length ||
      speechCore(text).startsWith(speechCore(this.lastFinalText))
    ) {
      this.lastFinalText = text
    }
    this.lastFinalAt = Date.now()
  }

  private ensureRecognition(Ctor: SpeechRecognitionCtor) {
    if (this.recognition) return this.recognition
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 4
    rec.lang = this.language
    rec.onresult = (event) => {
      let interim = ""
      const start = Math.max(event.resultIndex, this.processedFinals)
      for (let i = start; i < event.results.length; i += 1) {
        const result = event.results[i]
        const chunk = result[0] ? result[0].transcript : ""
        if (result.isFinal) {
          this.processedFinals = i + 1
          const raw = chunk.trim()
          const text = this.peelCommitted(raw)
          if (raw) this.rememberFinal(raw)
          const alts: string[] = []
          for (let a = 0; a < result.length; a += 1) {
            const alt = result[a]?.transcript ? String(result[a].transcript).trim() : ""
            if (alt && !alts.includes(alt)) alts.push(alt)
          }
          if (text) this.cb.onFinal(text, alts)
        } else {
          interim += chunk
        }
      }
      const live = this.peelCommitted(interim)
      if (live) this.cb.onInterim(live)
    }
    rec.onerror = (event) => {
      const error = event.error || "unknown"
      if (error === "no-speech" || error === "aborted") return
      if (error === "not-allowed" || error === "service-not-allowed") {
        this.wanted = false
        this.cb.onError("denied")
        return
      }
      this.cb.onError(error)
    }
    rec.onstart = () => {
      if (!this.wanted || this.startedAnnounced) return
      this.startedAnnounced = true
      this.cb.onStart()
    }
    rec.onend = () => {
      this.processedFinals = 0
      if (!this.wanted) return
      window.setTimeout(() => {
        if (!this.wanted) return
        try {
          rec.start()
        } catch {
          // already started
        }
      }, 160)
    }
    this.recognition = rec
    return rec
  }

  private kill() {
    const rec = this.recognition
    this.recognition = null
    if (!rec) return
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    rec.onstart = null
    try {
      rec.abort()
    } catch {
      try {
        rec.stop()
      } catch {
        // ignore
      }
    }
  }
}
