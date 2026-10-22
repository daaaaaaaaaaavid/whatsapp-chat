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

  // Chrome often leaves the last phrase as interim — these cover that path.
  const live = () => FakeRecognition.last!

  it("keeps the shown text when stopping before Chrome finalizes", async () => {
    const { controller, text } = await setup()
    live().say("שלום לכולם", false)
    controller.stop()
    expect(text()).toBe("שלום לכולם")
    expect(controller.isListening).toBe(false)
  })

  it("sends on «שלח» even when it never becomes final", async () => {
    const { sent, text } = await setup()
    live().say("נתראה מחר", true)
    live().say("שלח", false)
    vi.advanceTimersByTime(800)
    expect(sent).toEqual(["נתראה מחר"])
    expect(text()).toBe("")
  })

  it("sends a whole interim phrase ending with «שלח»", async () => {
    const { sent } = await setup()
    live().say("נתראה מחר שלח", false)
    vi.advanceTimersByTime(800)
    expect(sent).toEqual(["נתראה מחר"])
  })

  it("sends on «אנטר» and «שלח הודעה»", async () => {
    const a = await setup()
    live().say("בוקר טוב", true)
    live().say("אנטר", false)
    vi.advanceTimersByTime(800)
    expect(a.sent).toEqual(["בוקר טוב"])

    const b = await setup()
    live().say("בוקר טוב", true)
    live().say("שלח הודעה", true)
    expect(b.sent).toEqual(["בוקר טוב"])
  })

  it("stopping right after «שלח» still sends", async () => {
    const { controller, sent } = await setup()
    live().say("נתראה מחר שלח", false)
    controller.stop()
    expect(sent).toEqual(["נתראה מחר"])
  })

  it("deletes the last word on «מחק» (interim)", async () => {
    const { text } = await setup()
    live().say("אני בבית", true)
    live().say("מחק", false)
    vi.advanceTimersByTime(3000)
    expect(text()).toBe("אני")
  })

  it("clears on «מחק הכל» (interim)", async () => {
    const { text } = await setup()
    live().say("טקסט מיותר", true)
    live().say("מחק הכל", false)
    vi.advanceTimersByTime(800)
    expect(text()).toBe("")
  })

  it("removes the last phrase on «לא את זה»", async () => {
    const { text } = await setup()
    live().say("היי", true)
    live().say("אני מאחר", true)
    live().say("לא את זה", false)
    vi.advanceTimersByTime(800)
    expect(text()).toBe("היי")
  })

  it("inserts a line break, punctuation and emoji", async () => {
    const { text } = await setup()
    live().say("שלום", true)
    live().say("שורה חדשה", false)
    vi.advanceTimersByTime(800)
    expect(text()).toBe("שלום\n")
    live().say("אני בדרך פסיק חבר", true)
    live().say("אימוג'י לב", true)
    expect(text()).toBe("שלום\nאני בדרך, חבר ❤️")
  })

  it("«מחק הכל» then continuing to talk does not bring the old text back", async () => {
    const { text } = await setup()
    live().say("טקסט ישן", false)
    live().say("טקסט ישן מחק הכל", false)
    expect(text()).toBe("")
    live().say("טקסט חדש", false)
    expect(text()).toBe("טקסט חדש")
    live().say("טקסט חדש לגמרי", true)
    expect(text()).toBe("טקסט חדש לגמרי")
  })

  it("strips the deleted words if Chrome replays them after «מחק הכל»", async () => {
    const { text } = await setup()
    live().say("טקסט ישן", true)
    live().say("מחק הכל", true)
    expect(text()).toBe("")
    live().say("מחק הכל ועכשיו טקסט חדש", false)
    expect(text()).toBe("ועכשיו טקסט חדש")
    live().say("מחק הכל ועכשיו טקסט חדש", true)
    expect(text()).toBe("ועכשיו טקסט חדש")
  })

  it("«לא את זה» then continuing keeps only the new words", async () => {
    const { text } = await setup()
    live().say("היי", true)
    live().say("אני מאחר לא את זה", false)
    expect(text()).toBe("היי")
    live().say("אני מאחר לא את זה אני מגיע", false)
    expect(text()).toBe("היי אני מגיע")
  })

  it("after a voice send, the sent words are not typed again", async () => {
    const { controller, sent, text } = await setup()
    controller.updatePrefs({ ...DEFAULT_VOICE_PREFS, soundFeedback: false, continueAfterSend: true })
    live().say("נתראה מחר שלח", false)
    vi.advanceTimersByTime(800)
    expect(sent).toEqual(["נתראה מחר"])
    live().say("נתראה מחר שלח", true)
    expect(text()).toBe("")
    live().say("הודעה הבאה", true)
    expect(text()).toBe("הודעה הבאה")
    expect(sent).toEqual(["נתראה מחר"])
  })

  it("ignores Chrome's late final for an interim we already committed", async () => {
    const { text } = await setup()
    live().say("אני בבית", false)
    vi.advanceTimersByTime(1700)
    expect(text()).toBe("אני בבית")
    live().say("אני בבית", true)
    expect(text()).toBe("אני בבית")
  })
})
