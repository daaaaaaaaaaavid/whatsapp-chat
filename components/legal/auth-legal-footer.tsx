import Link from "next/link"

export function AuthLegalFooter() {
  return (
    <p className="mt-4 text-center text-xs leading-relaxed text-[var(--wa-text-secondary)]">
      בהמשך השימוש אתה מסכים ל־
      <Link href="/terms" className="mx-1 text-[#008069] hover:underline">
        תנאי השימוש
      </Link>
      ול־
      <Link href="/privacy" className="mx-1 text-[#008069] hover:underline">
        מדיניות הפרטיות
      </Link>
    </p>
  )
}
