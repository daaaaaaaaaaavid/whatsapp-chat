import type { Metadata } from "next"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { APP_NAME, getSiteUrl, getSupportEmail } from "@/lib/site-config"

export const metadata: Metadata = {
  title: `תנאי שימוש — ${APP_NAME}`,
  description: `תנאי השימוש של ${APP_NAME}, כולל חיבור לגוגל דרייב.`,
}

const LAST_UPDATED = "26 באוקטובר 2026"

export default function TermsPage() {
  const supportEmail = getSupportEmail()
  const siteUrl = getSiteUrl()

  return (
    <LegalPageShell title="תנאי שימוש" lastUpdated={LAST_UPDATED}>
      <section>
        <h2 className="text-base font-semibold">1. הסכמה לתנאים</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          בגישה או שימוש ב־{APP_NAME} (&quot;השירות&quot;) אתה מסכים לתנאים אלה ול־
          <a href="/privacy" className="text-[#008069] hover:underline">
            מדיניות הפרטיות
          </a>
          . אם אינך מסכים — אל תשתמש בשירות.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">2. תיאור השירות</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          {APP_NAME} מספקת פלטפורמת הודעות מיידיות הכוללת צ&apos;אטים, קבוצות, שיחות קול/וידאו, שמירת מדיה בגוגל דרייב
          שלך (אופציונלי), ואפשרות אופציונלית לסנכרן אנשי קשר מגוגל לצורך מציאת משתמשים קיימים.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">3. חשבון משתמש</h2>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>עליך לספק מידע מדויק בעת ההרשמה.</li>
          <li>אתה אחראי לשמירה על סודיות פרטי הגישה לחשבונך.</li>
          <li>אתה אחראי לכל פעילות שמתבצעת דרך החשבון שלך.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">4. שימוש מותר ואסור</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">אסור להשתמש בשירות כדי:</p>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>להפר חוק, זכויות צד שלישי, או תנאים אלה.</li>
          <li>לשלוח תוכן פוגעני, מטעה, מאיים, או בלתי חוקי.</li>
          <li>לנסות לפרוץ, לשבש או לעקוף אמצעי אבטחה.</li>
          <li>לאסוף מידע על משתמשים אחרים ללא הרשאה.</li>
          <li>להשתמש בשירות לספאם או הטרדה.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">5. תוכן משתמש ודרייב</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אתה שומר על הבעלות בתוכן שאתה שולח, כולל קבצים שנשמרים בגוגל דרייב שלך. אתה מעניק לנו רישיון מוגבל להציג,
          להעביר ולהעתיק תוכן זה רק לצורך הפעלת השירות עבורך ועבור משתתפי השיחה (למשל העתקה לדרייב של נמען שלחץ
          להוריד).
        </p>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          כשאתה מחבר דרייב, הקבצים יושבים בחשבון Google שלך. מכסת האחסון, החיוב והגיבוי הם מול Google, לא מולנו.
          אם תנתק את הדרייב או תמחק קובץ משם, הנמען עלול שלא לצפות בו. מדיה עשויה להימחק אוטומטית לפי מדיניות השמירה
          שבמדיניות הפרטיות.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">6. אינטגרציה עם Google</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אם תבחר לחבר את חשבון Google שלך (התחברות, דרייב או אנשי קשר), השימוש כפוף גם לתנאי Google הרלוונטיים,
          כולל{" "}
          <a
            href="https://policies.google.com/terms"
            className="text-[#008069] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            תנאי השימוש של Google
          </a>
          . אנחנו מבקשים רק את ההרשאות הדרושות לתכונה שבחרת. אפשר לבטל כל הרשאה בכל עת דרך הפרופיל ב־{APP_NAME} או
          דרך הגדרות חשבון Google.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">7. זמינות והפסקת שירות</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו שואפים לשמור על זמינות גבוהה, אך השירות מסופק &quot;כמות שהוא&quot; (AS IS). אנחנו רשאים להשעות או
          לסגור חשבונות שמפרים תנאים אלה, או לשנות/להפסיק חלקים מהשירות.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">8. הגבלת אחריות</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          במידה המרבית המותרת בדין, {APP_NAME} ומפעיליה לא יישאו באחריות לנזקים עקיפים, תוצאתיים, או אובדן נתונים
          הנובע משימוש בשירות, כולל מחיקה או אי־זמינות של קבצים בגוגל דרייב.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">9. שינויים בתנאים</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו עשויים לעדכן תנאים אלה. שינויים מהותיים יפורסמו בעמוד זה עם תאריך עדכון חדש.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">10. יצירת קשר</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">לשאלות בנוגע לתנאי שימוש אלה:</p>
        <ul className="mt-2 space-y-1 text-[var(--wa-text-secondary)]">
          <li>
            אימייל:{" "}
            <a href={`mailto:${supportEmail}`} className="text-[#008069] hover:underline" dir="ltr">
              {supportEmail}
            </a>
          </li>
          <li dir="ltr" className="break-all">
            אתר: {siteUrl}
          </li>
        </ul>
      </section>
    </LegalPageShell>
  )
}
