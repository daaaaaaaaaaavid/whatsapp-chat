import { APP_NAME, getSiteUrl } from "@/lib/site-config"

export function meetingInvitePageUrl(token: string): string {
  return `${getSiteUrl()}/invite/${token}`
}

export function buildMeetingInviteShareText(opts: {
  hostName: string
  inviteUrl: string
}): string {
  const name = opts.hostName.trim() || "מישהו"
  return (
    `${name} הזמין אותך לפגישה ב-${APP_NAME}.\n` +
    `להצטרפות לחץ כאן:\n${opts.inviteUrl}`
  )
}

export function makeMeetingInviteToken(): string {
  const hex = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`.slice(
    0,
    32,
  )
  return `meet_${hex}`
}
