export const APP_NAME = "WhaChat"

/**
 * Work Spaces (team hubs + channels + Google Chat webhook UI).
 * Hidden for now — set true to show Spaces again in Work mode.
 */
export const WORK_SPACES_UI_ENABLED = false

/**
 * Personal / Work inbox switcher and "move to work/personal" actions.
 * Hidden for now — set true to show again.
 */
export const PERSONAL_WORK_UI_ENABLED = false

/**
 * Watch Together (synced YouTube in chat).
 * Hidden for now — set true to show again.
 */
export const WATCH_TOGETHER_UI_ENABLED = false

/**
 * Legacy 1:1 WebRTC voice/video calls (header phone buttons + Calls tab).
 * Disabled — DM “meetings” now ring via LiveKit (`useMeetingRing`).
 * Set true only if you need the old WebRTC mesh path again.
 */
export const WEBRTC_CALLS_UI_ENABLED = false

/** Production site URL for legal pages and OAuth verification (no trailing slash). */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")
  if (fromEnv) return fromEnv
  return "https://whatsapp-chat-beta.vercel.app"
}

/** Support / contact email (e.g. Google Group). Shown in legal pages. */
export function getSupportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "whachat-support@googlegroups.com"
}
