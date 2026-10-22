import { voiceEngine as QW, type ParsedUtterance, type VoiceSettings } from "./index"
import { VoiceRecognizer, type RecognizerError } from "./recognizer"
import type { VoicePrefs } from "./prefs"
import {
  appendSpoken,
  deleteLastChunk,
  deleteLastSentence,
  deleteLastWord,
  replaceLastWord,
} from "./text-ops"

export type VoiceTypingHost = {
  getText: () => string
  setText: (next: string) => void
  send: (text: string) => void
}

export type VoiceTypingSnapshot = {
  listening: boolean
  starting: boolean
  intent: string | null
  error: string | null
}

const SILENCE_AFTER_FINAL_MS = 9000
const SILENCE_AFTER_INTERIM_MS = 12000
const NO_SPEECH_STOP_MS = 18000
const LIVE_PUNCTUATE_MS = 900
const INTENT_MS = 1500

const ERROR_MESSAGES: Record<string, string> = {
  denied: "אין גישה למיקרופון. אשרו הרשאה בסרגל הכתובת ונסו שוב.",
  unsupported: "הדפדפן לא תומך בהקלדה קולית. נסו Chrome או Edge.",
  network: "אין חיבור לזיהוי הדיבור — מנסים שוב…",
  "audio-capture": "לא נמצא מיקרופון.",
  "start-failed": "לא הצלחנו להפעיל את המיקרופון.",
}

function settingsFromPrefs(prefs: VoicePrefs): VoiceSettings {
  return {
    ...QW.DEFAULTS,
    ...prefs,
    autoCapitalize: true,
    commands: QW.cloneCommands(QW.DEFAULT_COMMANDS),
    composerKind: "chat",
  }
}

function isAction(p: ParsedUtterance) {
  return p.send || p.undo || p.clear || p.undoSentence || p.meant
}

export class VoiceTypingController {
  private settings: VoiceSettings
  private recognizer: VoiceRecognizer
  private listening = false
  private starting = false
  private intent: string | null = null
  private error: string | null = null

  /** Box content without the live interim tail. */
  private committed = ""
  /** Text that was in the box before this dictation run (left untouched by auto-punctuation). */
  private anchor = ""
  private lastRendered = ""
  private interim = ""
  private lastChunk = ""
  private held = ""

  private holdTimer: number | null = null
  private silenceTimer: number | null = null
  private punctTimer: number | null = null
  private intentTimer: number | null = null
  private toneContext: AudioContext | null = null
  private lastToneAt = 0

  constructor(
    private readonly host: VoiceTypingHost,
    prefs: VoicePrefs,
    private readonly onChange: (snapshot: VoiceTypingSnapshot) => void,
  ) {
    this.settings = settingsFromPrefs(prefs)
    this.recognizer = new VoiceRecognizer({
      onStart: () => {
        this.starting = false
        this.playTone(true)
        this.emit()
      },
      onInterim: (text) => this.handleInterim(text),
      onFinal: (text, alts) => this.handleFinal(text, alts),
      onError: (error) => this.handleError(error),
      onStop: () => {},
    })
  }

  get isListening() {
    return this.listening
  }

  updatePrefs(prefs: VoicePrefs) {
    const langChanged = prefs.language !== this.settings.language
    this.settings = settingsFromPrefs(prefs)
    if (this.listening && langChanged) this.recognizer.restart(prefs.language)
  }

  toggle() {
    if (this.listening) this.stop()
    else this.start()
  }

  start() {
    if (this.listening) return
    this.listening = true
    this.starting = true
    this.error = null
    this.syncFromHost(true)
    this.interim = ""
    this.lastChunk = ""
    this.held = ""
    this.armSilenceStop(NO_SPEECH_STOP_MS)
    this.emit()
    this.recognizer.start(this.settings.language)
  }

  stop() {
    if (!this.listening) return
    const leftover = this.held
    this.clearHold()
    this.clearTimer("silenceTimer")
    this.clearTimer("punctTimer")
    this.listening = false
    this.starting = false
    this.recognizer.stop()
    this.syncFromHost(false)
    this.interim = ""
    if (leftover && !this.isCommandPrefix(leftover)) this.apply(QW.processUtterance(leftover, this.settings))
    this.finalizePunctuation()
    this.render()
    this.playTone(false)
    this.emit()
  }

  dispose() {
    this.stop()
    this.clearTimer("intentTimer")
    void this.toneContext?.close().catch(() => {})
  }

  // ── speech events ──────────────────────────────────────────────────────────

  private handleInterim(raw: string) {
    if (!this.listening || QW.isLetterStutter(raw)) return
    this.syncFromHost(false)
    this.noteActivity(false)
    let display = raw
    if (this.settings.voiceCommands) {
      const parsed = QW.processUtterance(raw, this.settings)
      display = isAction(parsed) ? parsed.text : parsed.text || raw
    }
    this.interim = display
    this.render()
  }

  private handleFinal(raw: string, alts: string[]) {
    if (!this.listening || QW.isLetterStutter(raw)) return
    this.syncFromHost(false)
    this.interim = ""
    this.noteActivity(true)

    const lastWord = (this.lastChunk || this.committed).trim().split(/\s+/).pop() || ""
    let incoming = QW.applySpeechConfusion(raw, { lastWord, alts }) || raw

    if (this.held) {
      const held = this.held
      this.clearHold()
      const glued = `${held} ${incoming}`.replace(/\s+/g, " ").trim()
      const s = this.settings
      if (
        QW.isExactCommand(glued, s) ||
        QW.incompleteCommandTail(glued, s) ||
        QW.speechHasCommands(glued, s)
      ) {
        incoming = glued
      } else if (!this.isCommandPrefix(held)) {
        this.apply(QW.processUtterance(held, s))
      }
    }

    this.commit(incoming)
    this.render()
  }

  private commit(raw: string) {
    const s = this.settings
    if (QW.isExactCommand(raw, s)) {
      const exact = QW.processUtterance(raw, s)
      if (exact.undo || exact.clear || exact.undoSentence) {
        this.apply(exact)
        return
      }
    }

    const incomplete = QW.incompleteCommandTail(raw, s)
    if (incomplete) {
      if (incomplete.head) this.apply(this.punctuate(QW.processUtterance(incomplete.head, s), incomplete.head))
      if (QW.isExactCommand(incomplete.tail, s) && !QW.isAmbiguousCommandPrefix(incomplete.tail, s)) {
        this.apply(QW.processUtterance(incomplete.tail, s))
      } else {
        this.hold(incomplete.tail)
      }
      return
    }
    if (QW.isAmbiguousCommandPrefix(raw, s)) {
      this.hold(QW.normalizeSpeech(raw))
      return
    }
    this.apply(this.punctuate(QW.processUtterance(raw, s), raw))
  }

  private handleError(error: RecognizerError) {
    if (!this.listening) return
    if (error === "network") {
      this.error = ERROR_MESSAGES.network
      this.emit()
      return
    }
    this.error = ERROR_MESSAGES[error] ?? ERROR_MESSAGES["start-failed"]
    this.stop()
  }

  // ── applying parsed speech ─────────────────────────────────────────────────

  private apply(parsed: ParsedUtterance) {
    if (parsed.clear) {
      this.committed = ""
      this.anchor = ""
      this.lastChunk = ""
      this.flash("מחדש")
      this.recognizer.restart()
      return
    }
    if (parsed.undoSentence) {
      this.committed = this.lastChunk
        ? deleteLastChunk(this.committed, this.lastChunk)
        : deleteLastSentence(this.committed)
      this.lastChunk = ""
      if (parsed.text) this.append(parsed.text)
      this.flash("מחיקת משפט")
      return
    }
    if (parsed.undo) {
      if (parsed.text) this.append(parsed.text)
      this.committed = deleteLastWord(this.committed)
      this.lastChunk = ""
      this.flash("מחיקה")
      return
    }
    if (parsed.meant) {
      this.committed = replaceLastWord(this.committed, parsed.text)
      this.lastChunk = ""
      this.flash("תיקון")
      return
    }
    if (parsed.send) {
      if (parsed.text) this.append(parsed.text)
      this.finalizePunctuation()
      const text = this.committed
      this.committed = ""
      this.anchor = ""
      this.lastChunk = ""
      this.render()
      if (text.trim()) {
        this.host.send(text)
        this.flash("שליחה")
      }
      if (!this.settings.continueAfterSend) this.stop()
      else this.recognizer.restart()
      return
    }
    if (parsed.text) this.append(parsed.text)
    if (parsed.spaces) this.committed += " ".repeat(parsed.spaces)

    const label = QW.intentLabel(parsed, parsed.text)
    if (label === "שאלה" || label === "קריאה" || label === "שורה חדשה" || label === "משפט מוכן") {
      this.flash(label)
    }
  }

  private append(text: string) {
    this.committed = appendSpoken(this.committed, text)
    this.lastChunk = text
  }

  private punctuate(parsed: ParsedUtterance, raw: string): ParsedUtterance {
    const s = this.settings
    if (!parsed.text || parsed.snippet || parsed.spaces || !s.autoPunctuation) return parsed
    if (QW.isExpandingSnippet(raw, s)) return parsed
    if (parsed.text.includes("\n") && QW.hasExplicitBreakCommand(raw, s)) return parsed
    return { ...parsed, text: QW.autoPunctuate(parsed.text, s, { kind: "chat", close: true }) }
  }

  /** Re-punctuate the last dictated sentence after a pause (adds the closing mark). */
  private finalizePunctuation() {
    if (!this.settings.autoPunctuation) return
    const anchored = this.committed.startsWith(this.anchor)
    const prefix = anchored ? this.anchor : ""
    const dictated = this.committed.slice(prefix.length)
    if (!dictated.trim()) return
    const { head, tail } = QW.splitHeadTailForPunct(dictated)
    if (!tail.trim()) return
    const next = QW.autoPunctuate(tail, this.settings, { kind: "chat", whole: true })
    if (next === tail) return
    this.committed = prefix + head + next
    if (/\?\s*$/.test(next) && !/\?\s*$/.test(tail)) this.flash("שאלה")
    else if (/!\s*$/.test(next) && !/!\s*$/.test(tail)) this.flash("קריאה")
  }

  // ── command hold (e.g. "מחק" may become "מחק הכל") ─────────────────────────

  private hold(tail: string) {
    this.held = tail
    this.clearTimer("holdTimer")
    const s = this.settings
    const long = QW.isAmbiguousCommandPrefix(tail, s) || Boolean(QW.incompleteCommandTail(tail, s))
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null
      const piece = this.held
      this.held = ""
      if (!this.listening || !piece) return
      this.syncFromHost(false)
      if (QW.isExactCommand(piece, s)) this.apply(QW.processUtterance(piece, s))
      else if (!this.isCommandPrefix(piece)) this.apply(QW.processUtterance(piece, s))
      this.render()
    }, long ? 1600 : 700)
  }

  private clearHold() {
    this.clearTimer("holdTimer")
    this.held = ""
  }

  private isCommandPrefix(piece: string) {
    const s = this.settings
    return (
      QW.isBareCommandPrefix(piece, s) ||
      QW.isActionCommandPrefix(piece, s) ||
      Boolean(QW.incompleteCommandTail(piece, s) && !QW.isExactCommand(piece, s))
    )
  }

  // ── timers / host sync ─────────────────────────────────────────────────────

  private noteActivity(isFinal: boolean) {
    if (this.settings.autoPunctuation) {
      this.clearTimer("punctTimer")
      if (isFinal) {
        this.punctTimer = window.setTimeout(() => {
          this.punctTimer = null
          if (!this.listening || this.interim || this.held) return
          this.syncFromHost(false)
          this.finalizePunctuation()
          this.render()
        }, LIVE_PUNCTUATE_MS)
      }
    }
    this.armSilenceStop(isFinal ? SILENCE_AFTER_FINAL_MS : SILENCE_AFTER_INTERIM_MS)
  }

  private armSilenceStop(delay: number) {
    if (!this.settings.autoStopOnSilence) return
    this.clearTimer("silenceTimer")
    this.silenceTimer = window.setTimeout(() => {
      this.silenceTimer = null
      if (!this.listening) return
      if (this.held) {
        this.armSilenceStop(SILENCE_AFTER_FINAL_MS)
        return
      }
      this.stop()
    }, delay)
  }

  /** Adopt edits made outside dictation (typing, manual send, emoji picker). */
  private syncFromHost(resetAnchor: boolean) {
    const current = this.host.getText()
    if (resetAnchor || current !== this.lastRendered) {
      this.committed = current
      this.anchor = current
      this.lastRendered = current
      this.lastChunk = ""
    }
  }

  private render() {
    const next = this.interim ? appendSpoken(this.committed, this.interim) : this.committed
    if (next === this.lastRendered) return
    this.lastRendered = next
    this.host.setText(next)
  }

  private flash(label: string) {
    this.intent = label
    this.clearTimer("intentTimer")
    this.intentTimer = window.setTimeout(() => {
      this.intentTimer = null
      this.intent = null
      this.emit()
    }, INTENT_MS)
    this.emit()
  }

  private clearTimer(key: "holdTimer" | "silenceTimer" | "punctTimer" | "intentTimer") {
    const id = this[key]
    if (id !== null) window.clearTimeout(id)
    this[key] = null
  }

  private emit() {
    this.onChange({
      listening: this.listening,
      starting: this.starting,
      intent: this.intent,
      error: this.error,
    })
  }

  private playTone(ok: boolean) {
    if (!this.settings.soundFeedback) return
    const now = Date.now()
    if (now - this.lastToneAt < 500) return
    this.lastToneAt = now
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      if (!this.toneContext || this.toneContext.state === "closed") this.toneContext = new Ctx()
      const ctx = this.toneContext
      if (ctx.state === "suspended") void ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = ok ? 880 : 420
      gain.gain.value = 0.04
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
      osc.stop(ctx.currentTime + 0.13)
    } catch {
      // audio unavailable
    }
  }
}
