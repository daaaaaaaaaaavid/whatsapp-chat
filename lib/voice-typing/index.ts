import engine from "./engine.js"

export type VoiceCommandAction =
  | "text"
  | "newline"
  | "paragraph"
  | "space"
  | "send"
  | "undo"
  | "undoSentence"
  | "clear"

export type VoiceCommand = {
  id: string
  group: string
  phrase: string
  action: VoiceCommandAction
  value: string
  enabled: boolean
  trailing?: boolean
}

export type VoiceSettings = {
  language: string
  voiceCommands: boolean
  sendCommand: boolean
  soundFeedback: boolean
  autoCapitalize: boolean
  autoPunctuation: boolean
  autoStopOnSilence: boolean
  continueAfterSend: boolean
  commands: VoiceCommand[]
  composerKind?: "chat" | "mail"
}

export type ParsedUtterance = {
  text: string
  send: boolean
  undo: boolean
  clear: boolean
  undoSentence: boolean
  meant: boolean
  spaces: number
  snippet: boolean
}

type PunctuateCtx = { kind?: "chat" | "mail"; whole?: boolean; close?: boolean }

type VoiceEngine = {
  DEFAULTS: Omit<VoiceSettings, "commands">
  LANGUAGES: { code: string; label: string; dir: "rtl" | "ltr" }[]
  DEFAULT_COMMANDS: VoiceCommand[]
  cloneCommands: (list: VoiceCommand[]) => VoiceCommand[]
  mergeCommands: (stored: unknown) => VoiceCommand[]
  processUtterance: (raw: string, settings: VoiceSettings) => ParsedUtterance
  autoPunctuate: (text: string, settings: VoiceSettings, ctx?: PunctuateCtx) => string
  splitHeadTailForPunct: (text: string) => { head: string; tail: string }
  incompleteCommandTail: (raw: string, settings: VoiceSettings) => { head: string; tail: string } | null
  isAmbiguousCommandPrefix: (raw: string, settings: VoiceSettings) => boolean
  isExactCommand: (raw: string, settings: VoiceSettings) => boolean
  isBareCommandPrefix: (raw: string, settings: VoiceSettings) => boolean
  isActionCommandPrefix: (raw: string, settings: VoiceSettings) => boolean
  hasExplicitBreakCommand: (raw: string, settings: VoiceSettings) => boolean
  speechHasCommands: (raw: string, settings: VoiceSettings) => boolean
  isExpandingSnippet: (raw: string, settings: VoiceSettings) => boolean
  applySpeechConfusion: (
    text: string,
    opts: { lastWord?: string; alts?: string[]; rewrites?: Record<string, string> },
  ) => string
  intentLabel: (parsed: Partial<ParsedUtterance>, written?: string, raw?: string) => string
  normalizeSpeech: (text: string) => string
  isLetterStutter: (text: string) => boolean
  isRtl: (lang: string) => boolean
}

export const voiceEngine = engine as unknown as VoiceEngine
