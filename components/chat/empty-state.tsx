import { Lock } from "lucide-react"
import { Logo } from "@/components/brand/logo"

type Props = {
  title?: string
  subtitle?: string
}

export function EmptyState({
  title = "WhaChat Web",
  subtitle = "שלח וקבל הודעות ללא צורך בחיבור הטלפון.\nבחר צ'אט מהרשימה כדי להתחיל לשוחח.",
}: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center border-b-[6px] border-[#25d366] bg-[var(--wa-header)] px-6 text-center">
      <div className="wa-fade-in flex flex-col items-center">
        <div className="relative flex h-44 w-44 items-center justify-center rounded-full bg-[var(--wa-accent-soft)] shadow-[inset_0_0_0_10px_color-mix(in_srgb,var(--wa-teal)_8%,transparent)]">
          <Logo size={24} />
        </div>
        <h1 className="mt-8 text-3xl font-light text-[var(--wa-heading)]">{title}</h1>
        <p className="mt-4 max-w-lg whitespace-pre-line text-sm leading-relaxed text-[var(--wa-text-secondary)]">
          {subtitle}
        </p>
      </div>
      <p className="mt-16 flex items-center gap-1.5 text-xs text-[var(--wa-text-secondary)]">
        <Lock className="h-3 w-3" />
        הפרטיות שלך חשובה לנו
      </p>
    </div>
  )
}
