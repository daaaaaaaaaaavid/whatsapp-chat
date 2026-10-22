import { Lock } from "lucide-react"
import { Logo } from "@/components/brand/logo"

type Props = {
  title?: string
  subtitle?: string
}

export function EmptyState({
  title = "WhaChat",
  subtitle = "שלח וקבל הודעות בלי שהטלפון יהיה מחובר.\nבחר צ'אט מהרשימה כדי להתחיל.",
}: Props) {
  return (
    <div className="wa-chat-bg flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <div className="wa-fade-in flex flex-col items-center">
        <div className="wa-logo-glow flex h-40 w-40 items-center justify-center rounded-full bg-[var(--wa-panel)]/70 shadow-[inset_0_0_0_1px_var(--wa-border)] backdrop-blur-md">
          <Logo size={20} />
        </div>
        <h1 className="mt-8 text-3xl font-medium text-[var(--wa-heading)]">{title}</h1>
        <p className="mt-4 max-w-lg whitespace-pre-line text-sm leading-relaxed text-[var(--wa-text-secondary)]">
          {subtitle}
        </p>
      </div>
      <p className="mt-16 flex items-center gap-1.5 text-xs text-[var(--wa-text-secondary)]">
        <Lock className="h-3 w-3" />
        השיחה נשארת בין המשתתפים
      </p>
    </div>
  )
}
