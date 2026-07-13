export function formatTime(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
}

export function formatChatListTime(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  if (isToday) return formatTime(d)
  if (isYesterday) return "אתמול"
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) return d.toLocaleDateString("he-IL", { weekday: "long" })
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

/** WhaChat status timestamp: "היום בשעה 13:16" */
export function formatStatusTime(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const time = formatTime(d)
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  if (isToday) return `היום בשעה ${time}`
  if (isYesterday) return `אתמול בשעה ${time}`
  return `${d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })} בשעה ${time}`
}

export function formatDateDivider(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  if (isToday) return "היום"
  if (isYesterday) return "אתמול"
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) return d.toLocaleDateString("he-IL", { weekday: "long" })
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatCallDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  }
  return `${m}:${String(sec).padStart(2, "0")}`
}

const AVATAR_COLORS = [
  "#00a884",
  "#e542a3",
  "#f5b800",
  "#5bc0de",
  "#d9534f",
  "#845ec2",
  "#0088cc",
  "#ff7f50",
  "#4caf50",
  "#795548",
]

export function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function initials(name: string | null | undefined) {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
