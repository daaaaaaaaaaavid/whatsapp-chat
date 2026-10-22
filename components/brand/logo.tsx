import { useId } from "react"
import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
  /** Icon size in Tailwind units (e.g. 8 = h-8 w-8). Default 8. */
  size?: number
  /** Show "WhaChat" next to the mark. */
  withWordmark?: boolean
  /** color = gradient mark; white = for luminous headers. */
  variant?: "color" | "white"
  wordmarkClassName?: string
}

export function Logo({
  className,
  size = 8,
  withWordmark = false,
  variant = "color",
  wordmarkClassName,
}: LogoProps) {
  const rawId = useId().replace(/:/g, "")
  const px = size * 4
  const isWhite = variant === "white"

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="WhaChat">
      <svg
        viewBox="0 0 80 80"
        width={px}
        height={px}
        className="shrink-0"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${rawId}-g`} x1="8" y1="6" x2="74" y2="76" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isWhite ? "#ffffff" : "#b8ffe9"} />
            <stop offset="38%" stopColor={isWhite ? "#ffffff" : "#12d6a6"} />
            <stop offset="100%" stopColor={isWhite ? "#ffffff" : "#4d6bff"} />
          </linearGradient>
          <radialGradient id={`${rawId}-s`} cx="32%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={isWhite ? 0.35 : 0.7} />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="40" cy="40" r="38" fill={`url(#${rawId}-g)`} />
        <circle cx="40" cy="40" r="38" fill={`url(#${rawId}-s)`} />
        <path
          fill={isWhite ? "#087a68" : "#ffffff"}
          d="M25 28.2c0-3.2 2.6-5.8 5.8-5.8h17.4c3.2 0 5.8 2.6 5.8 5.8v13.6c0 3.2-2.6 5.8-5.8 5.8H37.4L28.2 56.2V47.6h-1.2c-1.1 0-2.2-.3-3.1-.9a5.7 5.7 0 0 1-1.9-4.9V28.2z"
        />
        <circle cx="35.2" cy="35" r="2.05" fill={isWhite ? "#ffffff" : "#06332c"} />
        <circle cx="41.2" cy="35" r="2.05" fill={isWhite ? "#ffffff" : "#06332c"} />
        <circle cx="47.2" cy="35" r="2.05" fill={isWhite ? "#ffffff" : "#06332c"} />
      </svg>
      {withWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight",
            isWhite ? "text-white" : "wa-wordmark",
            wordmarkClassName,
          )}
        >
          WhaChat
        </span>
      )}
    </span>
  )
}
