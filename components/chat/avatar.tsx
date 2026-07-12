"use client"

import { avatarColor, initials } from "@/lib/format"
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"

type AvatarProps = {
  name: string | null | undefined
  url?: string | null
  size?: number
  isGroup?: boolean
  className?: string
}

export function Avatar({ name, url, size = 40, isGroup = false, className }: AvatarProps) {
  const dimension = { width: size, height: size }

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
