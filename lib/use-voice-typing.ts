"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { isVoiceTypingSupported } from "@/lib/voice-typing/recognizer"
import {
  DEFAULT_VOICE_PREFS,
  loadVoicePrefs,
  saveVoicePrefs,
  type VoicePrefs,
} from "@/lib/voice-typing/prefs"
import type {
  VoiceTypingController,
  VoiceTypingHost,
  VoiceTypingSnapshot,
} from "@/lib/voice-typing/controller"

const IDLE: VoiceTypingSnapshot = { listening: false, starting: false, intent: null, error: null }

/**
 * Dictation into a chat composer (port of the "הקלדה קולית" extension).
 * The speech engine (~70 KB) is only loaded the first time the mic is used.
 */
export function useVoiceTyping(host: VoiceTypingHost) {
  const [supported, setSupported] = useState(false)
  const [snapshot, setSnapshot] = useState<VoiceTypingSnapshot>(IDLE)
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS)
  const controllerRef = useRef<VoiceTypingController | null>(null)
  const loadingRef = useRef<Promise<VoiceTypingController> | null>(null)
  const hostRef = useRef(host)
  hostRef.current = host
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  useEffect(() => {
    setSupported(isVoiceTypingSupported())
    setPrefs(loadVoicePrefs())
  }, [])

  const ensureController = useCallback(() => {
    if (controllerRef.current) return Promise.resolve(controllerRef.current)
    loadingRef.current ??= import("@/lib/voice-typing/controller").then(({ VoiceTypingController }) => {
      const controller = new VoiceTypingController(
        {
          getText: () => hostRef.current.getText(),
          setText: (next) => hostRef.current.setText(next),
          send: (text) => hostRef.current.send(text),
        },
        prefsRef.current,
        setSnapshot,
      )
      controllerRef.current = controller
      return controller
    })
    return loadingRef.current
  }, [])

  const toggle = useCallback(() => {
    if (!supported) {
      setSnapshot({ ...IDLE, error: "הדפדפן לא תומך בהקלדה קולית. נסו Chrome או Edge." })
      return
    }
    void ensureController().then((controller) => controller.toggle())
  }, [ensureController, supported])

  const stop = useCallback(() => {
    controllerRef.current?.stop()
  }, [])

  const updatePrefs = useCallback((patch: Partial<VoicePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      saveVoicePrefs(next)
      controllerRef.current?.updatePrefs(next)
      return next
    })
  }, [])

  const clearError = useCallback(() => {
    setSnapshot((prev) => ({ ...prev, error: null }))
  }, [])

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose()
      controllerRef.current = null
    }
  }, [])

  return { supported, ...snapshot, prefs, toggle, stop, updatePrefs, clearError }
}
