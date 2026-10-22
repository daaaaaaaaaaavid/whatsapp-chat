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
    <div className="min-h-svh w-full">
      <header className="px-4 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/about" className="transition opacity-90 hover:opacity-100">
            <Logo size={8} withWordmark wordmarkClassName="text-sm font-medium" />
          </Link>
          <Link
            href="/auth/login"
            className="wa-btn px-4 py-1.5 text-sm"
          >
            התחברות
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <article className="wa-auth-card p-6 sm:p-10">
          <h1 className="text-2xl font-medium text-[var(--wa-text)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--wa-text-secondary)]">עודכן לאחרונה: {lastUpdated}</p>
          <div className="prose-legal mt-8 space-y-5 text-sm leading-relaxed text-[var(--wa-text)]">{children}</div>
        </article>

        <nav className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-[var(--wa-text-secondary)]">
          <Link href="/about" className="hover:text-[var(--wa-teal-dark)] hover:underline">
            אודות {APP_NAME}
          </Link>
          <Link href="/privacy" className="hover:text-[var(--wa-teal-dark)] hover:underline">
            מדיניות פרטיות
          </Link>
          <Link href="/terms" className="hover:text-[var(--wa-teal-dark)] hover:underline">
            תנאי שימוש
          </Link>
        </nav>
      </main>
    </div>
  )
}
