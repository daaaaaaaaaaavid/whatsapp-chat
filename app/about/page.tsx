import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { APP_NAME, getSiteUrl, getSupportEmail } from "@/lib/site-config"

export const metadata: Metadata = {
  title: `אודות ${APP_NAME}`,
  description: `${APP_NAME} — אפליקציית הודעות פרטיות ופשוטה.`,
}

export default function AboutPage() {
  const supportEmail = getSupportEmail()

  return (
    <div className="min-h-svh w-full bg-[var(--wa-header)]">
      <header className="bg-[#00a884] px-4 py-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex justify-center">
            <Logo size={12} withWordmark variant="white" wordmarkClassName="text-xl font-semibold" />
          </div>
          <p className="mt-4 text-sm text-white/90">פשוט. אמין. הודעות פרטיות.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 pb-16">
        <section className="rounded-lg bg-[var(--wa-panel)] p-6 shadow-sm sm:p-10">
          <h1 className="text-2xl font-medium text-[var(--wa-text)]">מה זה {APP_NAME}?</h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            {APP_NAME} היא אפליקציית צ&apos;אט שמאפשרת לשלוח הודעות, לשתף מדיה, לבצע שיחות קול ווידאו, ולנהל שיחות
            קבוצתיות — בדומה לחוויית WhatsApp, עם דגש על פרטיות ושליטה במידע שלך.
          </p>

          <h2 className="mt-8 text-lg font-medium text-[var(--wa-text)]">סנכרון אנשי קשר מגוגל</h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            בבחירה מרצונך, ניתן לסנכרן אנשי קשר מחשבון Google כדי למצוא בקלות משתמשים רשומים ב־{APP_NAME} ולהתחיל איתם
            שיחה. הגישה היא לקריאה בלבד (<span dir="ltr">contacts.readonly</span>) — אנחנו לא משנים או מוחקים אנשי
            קשר בחשבון Google שלך.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/login"
              className="rounded-full bg-[#00a884] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-[#008069]"
            >
              התחל להשתמש
            </Link>
            <Link
              href="/privacy"
              className="rounded-full border border-[#d1d7db] bg-[var(--wa-panel)] px-6 py-2.5 text-sm font-medium text-[var(--wa-text)] transition hover:bg-[var(--wa-header)]"
            >
              מדיניות פרטיות
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-lg bg-[var(--wa-panel)] p-6 text-sm text-[var(--wa-text-secondary)] shadow-sm">
          <p>
            <span className="font-medium text-[var(--wa-text)]">יצירת קשר:</span>{" "}
            <a href={`mailto:${supportEmail}`} className="text-[#008069] hover:underline" dir="ltr">
              {supportEmail}
            </a>
          </p>
          <p className="mt-2 break-all" dir="ltr">
            {getSiteUrl()}
          </p>
        </section>

        <nav className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-[var(--wa-text-secondary)]">
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
