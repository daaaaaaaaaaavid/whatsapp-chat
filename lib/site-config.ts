export const APP_NAME = "WhaChat"

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
