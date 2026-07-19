"use client"

import { useCallback, useEffect, useState } from "react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return Boolean(mq || iosStandalone)
}

/**
 * Chrome/Edge expose beforeinstallprompt; Safari needs manual Add to Home Screen.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setInstalled(true)
      return
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isSafari = isIos && !(window as unknown as { MSStream?: unknown }).MSStream
    if (isSafari) setIosHint(true)

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener("beforeinstallprompt", onBip)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const canInstall = Boolean(deferred) && !installed
  const showBanner = !installed

  const install = useCallback(async () => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === "accepted") {
        setInstalled(true)
        setDeferred(null)
      }
      return
    }
    if (iosHint) {
      window.alert(
        "ב־iPhone/iPad: לחץ על Share (שיתוף) ← הוסף למסך הבית כדי להתקין את WhaChat כאפליקציה.",
      )
      return
    }
    window.alert(
      "ההתקנה זמינה ב־Chrome או Edge. אם הכפתור לא נפתח, פתח את האתר בדפדפן הזה ובחר \"התקן אפליקציה\" מתפריט הדפדפן.",
    )
  }, [deferred, iosHint])

  return { showBanner, canInstall, installed, iosHint, install }
}
