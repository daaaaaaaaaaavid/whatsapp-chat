"use client"

import { avatarColor, initials } from "@/lib/format"
import { Bookmark, Users } from "lucide-react"
import { cn } from "@/lib/utils"

type AvatarProps = {
  name: string | null | undefined
  url?: string | null
  size?: number
  isGroup?: boolean
  isSelf?: boolean
  className?: string
}

export function Avatar({ name, url, size = 40, isGroup = false, isSelf = false, className }: AvatarProps) {
  const dimension = { width: size, height: size }

  if (isSelf) {
    return (
      <div
        style={dimension}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white",
          className,
        )}
      >
        <Bookmark style={{ width: size * 0.45, height: size * 0.45 }} fill="currentColor" />
      </div>
    )
  }

  if (url) {
    return (
      <img
        src={url || "/placeholder.svg"}
        alt={name ?? "avatar"}
        style={dimension}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    )
  }

  return (
    <div
      style={{ ...dimension, backgroundColor: isGroup ? "#6a7175" : avatarColor(name ?? "?") }}
      className={cn("flex shrink-0 items-center justify-center rounded-full text-white", className)}
    >
      {isGroup ? (
        <Users style={{ width: size * 0.5, height: size * 0.5 }} />
      ) : (
        <span style={{ fontSize: size * 0.4 }} className="font-medium">
          {initials(name)}
        </span>
      )}
    </div>
  )
}
