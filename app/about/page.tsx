import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { APP_NAME, getSiteUrl, getSupportEmail } from "@/lib/site-config"

export const metadata: Metadata = {
  // Google OAuth branding verification matches the OAuth app name to this page.
  title: APP_NAME,
  description: `${APP_NAME} — אפליקציית הודעות פרטיות ופשוטה.`,
}

export default function AboutPage() {
  const supportEmail = getSupportEmail()

  return (
    <div className="min-h-svh w-full">
      <header className="px-4 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex justify-center">
            <Logo size={14} withWordmark wordmarkClassName="text-3xl" />
          </div>
          <h1 className="mt-6 text-4xl font-semibold text-[var(--wa-heading)]">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-[var(--wa-text-secondary)]">הודעות, שיחות ופגישות — שקטות, מהירות, פרטיות.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <section className="wa-auth-card p-6 sm:p-10">
          <h2 className="text-2xl font-medium text-[var(--wa-text)]">מה זה {APP_NAME}?</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            {APP_NAME} היא אפליקציית צ&apos;אט שמאפשרת לשלוח הודעות, לשתף מדיה, לבצע שיחות קול ווידאו, ולנהל שיחות
            קבוצתיות — בדומה לחוויית WhatsApp, עם דגש על פרטיות ושליטה במידע שלך.
          </p>

          <h3 className="mt-8 text-lg font-medium text-[var(--wa-text)]">גוגל דרייב</h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            בבחירה מרצונך אפשר לחבר את גוגל דרייב. תמונות, סרטונים וסטטוסים נשמרים בתיקייה של {APP_NAME} בחשבון שלך,
            לא אצלנו. ההרשאה היא רק לקבצים שהאפליקציה יוצרת (<span dir="ltr">drive.file</span>). הנמען לוחץ כדי להעתיק
            את הקובץ לדרייב שלו ואז צופה ממנו. אפשר לנתק בכל רגע מהפרופיל.
          </p>

          <h3 className="mt-8 text-lg font-medium text-[var(--wa-text)]">סנכרון אנשי קשר מגוגל</h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--wa-text-secondary)]">
            בבחירה מרצונך, ניתן לסנכרן אנשי קשר מחשבון Google כדי למצוא בקלות משתמשים רשומים ב־{APP_NAME} ולהתחיל איתם
            שיחה. הגישה היא לקריאה בלבד (<span dir="ltr">contacts.readonly</span>) — אנחנו לא משנים או מוחקים אנשי
            קשר בחשבון Google שלך.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/login"
              className="wa-btn px-6 py-2.5 text-sm"
            >
              התחל להשתמש
            </Link>
            <Link
              href="/privacy"
              className="rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] px-6 py-2.5 text-sm font-medium text-[var(--wa-text)] transition hover:bg-[var(--wa-header)]"
            >
              מדיניות פרטיות
            </Link>
            <Link
              href="/terms"
              className="rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] px-6 py-2.5 text-sm font-medium text-[var(--wa-text)] transition hover:bg-[var(--wa-header)]"
            >
              תנאי שימוש
            </Link>
          </div>
        </section>

        <section className="wa-auth-card mt-6 p-6 text-sm text-[var(--wa-text-secondary)]">
          <p>
            <span className="font-medium text-[var(--wa-text)]">יצירת קשר:</span>{" "}
            <a href={`mailto:${supportEmail}`} className="text-[var(--wa-teal-dark)] hover:underline" dir="ltr">
              {supportEmail}
            </a>
          </p>
          <p className="mt-2 break-all" dir="ltr">
            {getSiteUrl()}
          </p>
        </section>

        <nav className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-[var(--wa-text-secondary)]">
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
