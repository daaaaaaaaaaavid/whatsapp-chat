/** Soft WhatsApp-like incoming message chime via Web Audio API. */
let audioCtx: AudioContext | null = null
let lastPlayedAt = 0
let unlocked = false

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    return audioCtx
  } catch {
    return null
  }
}

/** Call once after a user gesture so browsers allow sound. */
export function unlockNotificationSound() {
  if (unlocked) return
  const ctx = getCtx()
  if (!ctx) return
  void ctx.resume().then(() => {
    unlocked = true
  })
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

/** Looping ringtone for incoming calls (stop with stopIncomingCallRingtone). */
let ringtoneTimer: ReturnType<typeof setInterval> | null = null
let ringtoneGeneration = 0

function playRingtoneBurst(ctx: AudioContext) {
  const t = ctx.currentTime
  // Classic dual-tone phone ring: two short pairs, then a gap (handled by interval)
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
    g.gain.linearRampToValueAtTime(0.12, t + offset + 0.02)
    g.gain.setValueAtTime(0.12, t + offset + 0.32)
    g.gain.linearRampToValueAtTime(0.001, t + offset + 0.38)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(t + offset)
    osc.stop(t + offset + 0.4)
  }
}

export function startIncomingCallRingtone() {
  stopIncomingCallRingtone()
  const gen = ++ringtoneGeneration
  const ctx = getCtx()
  if (!ctx) return

  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve()
  void resume.then(() => {
    if (gen !== ringtoneGeneration) return
    playRingtoneBurst(ctx)
    ringtoneTimer = setInterval(() => {
      if (gen !== ringtoneGeneration) return
      const c = getCtx()
      if (!c) return
      void (c.state === "suspended" ? c.resume() : Promise.resolve()).then(() => {
        if (gen !== ringtoneGeneration) return
        playRingtoneBurst(c)
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
}
