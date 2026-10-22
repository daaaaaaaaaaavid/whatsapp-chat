"use client"

import { avatarColor, initials } from "@/lib/format"
import { useSignedMediaUrl } from "@/lib/use-signed-media-url"
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
  const signedUrl = useSignedMediaUrl(url)

  if (isSelf) {
    return (
      <div
        style={dimension}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-[var(--wa-teal)] text-[#04241c] shadow-[0_6px_16px_var(--wa-glow)]",
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
        src={signedUrl || "/placeholder.svg"}
        alt={name ?? "avatar"}
        style={dimension}
        className={cn("shrink-0 rounded-full object-cover shadow-[0_0_0_1px_color-mix(in_srgb,var(--wa-teal)_28%,transparent)]", className)}
      />
    )
  }

  return (
    <div
      style={{ ...dimension, backgroundColor: isGroup ? "#6a7175" : avatarColor(name ?? "?") }}
      className={cn("flex shrink-0 items-center justify-center rounded-full text-white shadow-[0_8px_18px_rgb(8_20_28/0.12)]", className)}
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
