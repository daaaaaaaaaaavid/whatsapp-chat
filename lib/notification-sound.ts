/** Soft WhaChat sounds via Web Audio API (+ vibration for calls). */
let audioCtx: AudioContext | null = null
let lastPlayedAt = 0
let unlocked = false

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    return audioCtx
  } catch {
    return null
  }
}

/** Call after a user gesture so browsers allow sound. Safe to call often. */
export function unlockNotificationSound() {
  const ctx = getCtx()
  if (!ctx) return
  void ctx.resume().then(() => {
    unlocked = true
  })
  // Silent buffer play helps some mobile browsers unlock audio
  try {
    const buffer = ctx.createBuffer(1, 1, 22050)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // ignore
  }
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, gain = 0.08) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = "sine"
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + 0.015)
  g.gain.exponentialRampToValueAtTime(0.001, start + duration)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export function playIncomingMessageSound() {
  const now = Date.now()
  if (now - lastPlayedAt < 400) return
  lastPlayedAt = now

  const ctx = getCtx()
  if (!ctx) return

  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve()
  void resume.then(() => {
    const t = ctx.currentTime
    tone(ctx, 880, t, 0.12, 0.07)
    tone(ctx, 1175, t + 0.1, 0.18, 0.09)
  })
}

let ringtoneTimer: ReturnType<typeof setInterval> | null = null
let ringtoneGeneration = 0
let ringbackTimer: ReturnType<typeof setInterval> | null = null
let ringbackGeneration = 0

function playRingtoneBurst(ctx: AudioContext) {
  const t = ctx.currentTime
  const pairs: [number, number][] = [
    [0, 440],
    [0, 480],
    [0.4, 440],
    [0.4, 480],
  ]
  for (const [offset, freq] of pairs) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    g.gain.setValueAtTime(0, t + offset)
    g.gain.linearRampToValueAtTime(0.14, t + offset + 0.02)
    g.gain.setValueAtTime(0.14, t + offset + 0.32)
    g.gain.linearRampToValueAtTime(0.001, t + offset + 0.38)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(t + offset)
    osc.stop(t + offset + 0.4)
  }
}

function playRingbackBurst(ctx: AudioContext) {
  const t = ctx.currentTime
  // Softer single-tone ringback for the caller
  for (const offset of [0, 0.35]) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 425
    g.gain.setValueAtTime(0, t + offset)
    g.gain.linearRampToValueAtTime(0.07, t + offset + 0.02)
    g.gain.setValueAtTime(0.07, t + offset + 0.28)
    g.gain.linearRampToValueAtTime(0.001, t + offset + 0.32)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(t + offset)
    osc.stop(t + offset + 0.35)
  }
}

function vibrateRing() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([400, 200, 400, 200, 400])
    }
  } catch {
    // ignore
  }
}

export function startIncomingCallRingtone() {
  stopIncomingCallRingtone()
  unlockNotificationSound()
  vibrateRing()
  const gen = ++ringtoneGeneration
  const ctx = getCtx()
  if (!ctx) return

  const run = () => {
    if (gen !== ringtoneGeneration) return
    playRingtoneBurst(ctx)
    vibrateRing()
  }

  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve()
  void resume.then(() => {
    if (gen !== ringtoneGeneration) return
    run()
    ringtoneTimer = setInterval(() => {
      if (gen !== ringtoneGeneration) return
      const c = getCtx()
      if (!c) return
      void (c.state === "suspended" ? c.resume() : Promise.resolve()).then(() => {
        if (gen !== ringtoneGeneration) return
        playRingtoneBurst(c)
        vibrateRing()
      })
    }, 2000)
  })
}

export function stopIncomingCallRingtone() {
  ringtoneGeneration += 1
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer)
    ringtoneTimer = null
  }
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(0)
    }
  } catch {
    // ignore
  }
}

/** Soft ringback while waiting for the peer to answer. */
export function startOutgoingRingback() {
  stopOutgoingRingback()
  unlockNotificationSound()
  const gen = ++ringbackGeneration
  const ctx = getCtx()
  if (!ctx) return

  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve()
  void resume.then(() => {
    if (gen !== ringbackGeneration) return
    playRingbackBurst(ctx)
    ringbackTimer = setInterval(() => {
      if (gen !== ringbackGeneration) return
      const c = getCtx()
      if (!c) return
      void (c.state === "suspended" ? c.resume() : Promise.resolve()).then(() => {
        if (gen !== ringbackGeneration) return
        playRingbackBurst(c)
      })
    }, 3000)
  })
}

export function stopOutgoingRingback() {
  ringbackGeneration += 1
  if (ringbackTimer) {
    clearInterval(ringbackTimer)
    ringbackTimer = null
  }
}

export function stopAllCallSounds() {
  stopIncomingCallRingtone()
  stopOutgoingRingback()
}

export function isSoundUnlocked() {
  return unlocked
}
