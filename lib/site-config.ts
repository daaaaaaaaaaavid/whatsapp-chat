export const APP_NAME = "WhaChat"

/**
 * Work Spaces (team hubs + channels + Google Chat webhook UI).
 * Hidden for now — set true to show Spaces again in Work mode.
 */
export const WORK_SPACES_UI_ENABLED = false

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
