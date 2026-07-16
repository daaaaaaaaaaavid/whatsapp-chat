import { APP_NAME, getSiteUrl } from "@/lib/site-config"

export type DmInviteShareInput = {
  inviterName: string
  inviteUrl: string
}

/** Plain text to paste in email / Google Chat / WhatsApp. */
export function buildDmInviteShareText(input: DmInviteShareInput): string {
  const name = input.inviterName.trim() || "מישהו"
  return (
    `${name} הזמין אותך לשיחה ב-${APP_NAME}.\n` +
    `לכניסה לחץ כאן:\n${input.inviteUrl}`
  )
}

export function dmInvitePageUrl(token: string): string {
  return `${getSiteUrl()}/invite/${token}`
}
