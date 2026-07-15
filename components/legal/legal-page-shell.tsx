import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { APP_NAME } from "@/lib/site-config"

type LegalPageShellProps = {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  return (
    <div className="min-h-svh w-full bg-[var(--wa-header)]">
      <header className="bg-[#00a884] px-4 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/about" className="transition opacity-90 hover:opacity-100">
            <Logo size={8} withWordmark variant="white" wordmarkClassName="text-sm font-medium" />
          </Link>
          <Link
            href="/auth/login"
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-white/25"
          >
            התחברות
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 pb-16">
        <article className="rounded-lg bg-[var(--wa-panel)] p-6 shadow-sm sm:p-10">
          <h1 className="text-2xl font-medium text-[var(--wa-text)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--wa-text-secondary)]">עודכן לאחרונה: {lastUpdated}</p>
          <div className="prose-legal mt-8 space-y-5 text-sm leading-relaxed text-[var(--wa-text)]">{children}</div>
        </article>

        <nav className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-[var(--wa-text-secondary)]">
          <Link href="/about" className="hover:text-[#008069] hover:underline">
            אודות {APP_NAME}
          </Link>
          <Link href="/privacy" className="hover:text-[#008069] hover:underline">
            מדיניות פרטיות
          </Link>
          <Link href="/terms" className="hover:text-[#008069] hover:underline">
            תנאי שימוש
          </Link>
        </nav>
      </main>
    </div>
  )
}
