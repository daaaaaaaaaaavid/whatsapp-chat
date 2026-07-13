import { cn } from "@/lib/utils"

type LogoProps = {
  className?: string
  /** Icon size in Tailwind units (e.g. 8 = h-8 w-8). Default 8. */
  size?: number
  /** Show "WhaChat" next to the mark. */
  withWordmark?: boolean
  /** color = green mark; white = for dark/green headers. */
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
  const px = size * 4
  const isWhite = variant === "white"

  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="WhaChat">
      <svg
        viewBox="0 0 80 80"
        width={px}
        height={px}
        className="shrink-0 drop-shadow-sm"
        aria-hidden
      >
        <circle cx="40" cy="40" r="40" fill={isWhite ? "#ffffff" : "#25d366"} />
        <path
          fill={isWhite ? "#00a884" : "#fff"}
          d="M24.5 27.5c0-3.6 2.9-6.5 6.5-6.5h18c3.6 0 6.5 2.9 6.5 6.5v16c0 3.6-2.9 6.5-6.5 6.5H38.2L28 58.5V50H31c-3.6 0-6.5-2.9-6.5-6.5v-16z"
        />
        <circle cx="34" cy="35.5" r="2.2" fill={isWhite ? "#ffffff" : "#25d366"} />
        <circle cx="40" cy="35.5" r="2.2" fill={isWhite ? "#ffffff" : "#25d366"} />
        <circle cx="46" cy="35.5" r="2.2" fill={isWhite ? "#ffffff" : "#25d366"} />
      </svg>
      {withWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight",
            isWhite ? "text-white" : "text-[#00a884]",
            wordmarkClassName,
          )}
        >
          WhaChat
        </span>
      )}
    </span>
  )
}
