import type { Profile, Status } from "@/lib/types"

export type StatusGroup = { profile: Profile; statuses: Status[] }

export type StatusFeed = {
  mine: Status[]
  /** Contacts with at least one status the viewer has not opened yet. */
  recent: StatusGroup[]
  /** Contacts whose statuses were all opened. */
  viewed: StatusGroup[]
}

function byCreatedAsc(a: Status, b: Status) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

function latestAt(group: StatusGroup) {
  return new Date(group.statuses[group.statuses.length - 1].created_at).getTime()
}

export function buildStatusFeed(
  statuses: Status[],
  currentUserId: string,
  viewedIds: ReadonlySet<string>,
): StatusFeed {
  const sorted = [...statuses].sort(byCreatedAsc)
  const mine = sorted.filter((s) => s.user_id === currentUserId)

  const groups = new Map<string, StatusGroup>()
  for (const s of sorted) {
    if (s.user_id === currentUserId || !s.profile) continue
    const group = groups.get(s.user_id)
    if (group) group.statuses.push(s)
    else groups.set(s.user_id, { profile: s.profile, statuses: [s] })
  }

  const recent: StatusGroup[] = []
  const viewed: StatusGroup[] = []
  for (const group of groups.values()) {
    if (group.statuses.every((s) => viewedIds.has(s.id))) viewed.push(group)
    else recent.push(group)
  }
  recent.sort((a, b) => latestAt(b) - latestAt(a))
  viewed.sort((a, b) => latestAt(b) - latestAt(a))

  return { mine, recent, viewed }
}

/** Resume where the viewer left off, like WhatsApp: first unseen status, else the first one. */
export function firstUnviewedIndex(group: StatusGroup, viewedIds: ReadonlySet<string>) {
  const idx = group.statuses.findIndex((s) => !viewedIds.has(s.id))
  return idx === -1 ? 0 : idx
}
