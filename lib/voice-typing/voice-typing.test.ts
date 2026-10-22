import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { voiceEngine as QW, type VoiceSettings } from "@/lib/voice-typing"
import { appendSpoken, deleteLastSentence, deleteLastWord } from "@/lib/voice-typing/text-ops"
import { DEFAULT_VOICE_PREFS } from "@/lib/voice-typing/prefs"

const settings: VoiceSettings = {
  ...QW.DEFAULTS,
  ...DEFAULT_VOICE_PREFS,
  autoCapitalize: true,
  commands: QW.cloneCommands(QW.DEFAULT_COMMANDS),
  composerKind: "chat",
}

describe("voice engine (from the extension)", () => {
  it("turns spoken punctuation into marks", () => {
    expect(QW.processUtterance("מה נשמע סימן שאלה", settings).text).toBe("מה נשמע?")
  })

  it("detects send and edit commands", () => {
    expect(QW.processUtterance("שלח", settings).send).toBe(true)
    expect(QW.processUtterance("מחק הכל", settings).clear).toBe(true)
    expect(QW.processUtterance("מחק", settings).undo).toBe(true)
  })

  it("inserts emoji by name", () => {
    expect(QW.processUtterance("אימוג'י לב", settings).text).toBe("❤️")
  })
})

describe("text ops", () => {
  it("appends with natural spacing", () => {
    expect(appendSpoken("שלום", "מה נשמע")).toBe("שלום מה נשמע")
    expect(appendSpoken("שלום", ",")).toBe("שלום,")
    expect(appendSpoken("שלום ", "\n")).toBe("שלום\n")
    expect(appendSpoken("", "היי")).toBe("היי")
  })

  it("deletes the last word and sentence", () => {
    expect(deleteLastWord("שלום מה נשמע")).toBe("שלום מה")
    expect(deleteLastSentence("היי. מה שלומך היום")).toBe("היי.")
    expect(deleteLastSentence("רק משפט אחד")).toBe("")
  })
})

type FakeEvent = {
  resultIndex: number
  results: { isFinal: boolean; length: number; 0: { transcript: string } }[]
}

class FakeRecognition {
  static last: FakeRecognition | null = null
  continuous = false
  interimResults = false
  maxAlternatives = 1
  lang = ""
  onresult: ((event: FakeEvent) => void) | null = null
  onerror: ((event: { error?: string }) => void) | null = null
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    queueMicrotask(() => this.onstart?.())
  }
  stop() {}
  abort() {}
  private results: FakeEvent["results"] = []
  /** Like Chrome: finals accumulate, the trailing interim result is replaced. */
  say(transcript: string, isFinal: boolean) {
    if (this.results.length && !this.results[this.results.length - 1].isFinal) this.results.pop()
    this.results.push({ isFinal, length: 1, 0: { transcript } })
    this.onresult?.({ resultIndex: this.results.length - 1, results: [...this.results] })
  }
}

describe("VoiceTypingController", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      webkitSpeechRecognition: FakeRecognition,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    FakeRecognition.last = null
  })

  async function setup(initial = "") {
    const { VoiceTypingController } = await import("@/lib/voice-typing/controller")
    let text = initial
    const sent: string[] = []
    const controller = new VoiceTypingController(
      {
        getText: () => text,
        setText: (next) => {
          text = next
        },
        send: (value) => {
          sent.push(value)
          text = ""
        },
      },
      { ...DEFAULT_VOICE_PREFS, soundFeedback: false },
      () => {},
    )
    controller.start()
    const rec = FakeRecognition.last!
    return { controller, rec, sent, text: () => text }
  }

  it("streams interim text and commits finals with punctuation", async () => {
    const { rec, text } = await setup()
    rec.say("מה נשמע", false)
    expect(text()).toBe("מה נשמע")
    rec.say("מה נשמע סימן שאלה", true)
    expect(text()).toBe("מה נשמע?")
  })

  it("keeps text typed before dictation and appends after it", async () => {
    const { rec, text } = await setup("היי")
    rec.say("אני בדרך", true)
    expect(text()).toBe("היי אני בדרך")
  })

  it("sends by voice and stops listening by default", async () => {
    const { controller, rec, sent, text } = await setup()
    rec.say("נתראה מחר", true)
    rec.say("שלח", true)
    vi.advanceTimersByTime(2000)
    expect(sent).toEqual(["נתראה מחר"])
    expect(text()).toBe("")
    expect(controller.isListening).toBe(false)
  })

  it("clears everything on «מחק הכל»", async () => {
    const { rec, text } = await setup()
    rec.say("טקסט מיותר", true)
    rec.say("מחק הכל", true)
    expect(text()).toBe("")
  })
})
