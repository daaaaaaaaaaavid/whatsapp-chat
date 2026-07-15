import type { Metadata } from "next"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { APP_NAME, getSiteUrl, getSupportEmail } from "@/lib/site-config"

export const metadata: Metadata = {
  title: `מדיניות פרטיות — ${APP_NAME}`,
  description: `מדיניות הפרטיות של ${APP_NAME}, כולל שימוש בגישה לאנשי קשר מגוגל.`,
}

const LAST_UPDATED = "16 ביולי 2026"

export default function PrivacyPage() {
  const supportEmail = getSupportEmail()
  const siteUrl = getSiteUrl()

  return (
    <LegalPageShell title="מדיניות פרטיות" lastUpdated={LAST_UPDATED}>
      <section>
        <h2 className="text-base font-semibold">1. מבוא</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          מדיניות זו מתארת כיצד {APP_NAME} (&quot;האפליקציה&quot;, &quot;אנחנו&quot;) אוספת, משתמשת ושומרת מידע אישי כאשר
          אתה משתמש בשירות. השימוש באפליקציה כפוף גם ל־
          <a href="/terms" className="text-[#008069] hover:underline">
            תנאי השימוש
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">2. איזה מידע אנחנו אוספים</h2>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>
            <strong className="text-[var(--wa-text)]">פרטי חשבון:</strong> שם תצוגה, כתובת אימייל, תמונת פרופיל (אם
            הועלתה), ומזהה משתמש.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">תוכן שיחות:</strong> הודעות טקסט, קבצי מדיה, סטטוסים ומטא־נתונים
            הקשורים לשיחות (זמן שליחה, סטטוס קריאה וכו&apos;).
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">נתוני שימוש טכניים:</strong> מידע על מכשיר, דפדפן, כתובת IP
            (דרך ספק האירוח), ולוגים טכניים לצורכי אבטחה ותפעול.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">אנשי קשר מגוגל (אופציונלי):</strong> רק אם בחרת במפורש
            &quot;סנכרן אנשי קשר מגוגל&quot;. אנחנו מבקשים הרשאת קריאה בלבד (
            <span dir="ltr">contacts.readonly</span>) ומשתמשים במידע כדי להציג אילו אנשי קשר רשומים גם ב־{APP_NAME}.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">3. סנכרון אנשי קשר מגוגל</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          כאשר אתה מאשר גישה לאנשי הקשר שלך בגוגל:
        </p>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>אנחנו קוראים שמות וכתובות אימייל מאנשי הקשר שלך דרך Google People API.</li>
          <li>המידע משמש להתאמה מול משתמשים רשומים ב־{APP_NAME} בלבד.</li>
          <li>אנחנו לא משנים, לא מוחקים ולא מייצאים את אנשי הקשר שלך מחוץ לשירות.</li>
          <li>אנחנו לא משתפים את אנשי הקשר שלך עם משתמשים אחרים או עם צדדים שלישיים למטרות שיווק.</li>
          <li>ניתן להפסיק שימוש על ידי ביטול ההרשאה בחשבון Google שלך (Google Account → Security → Third-party access).</li>
        </ul>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          השימוש במידע מגוגל כפוף גם ל־
          <a
            href="https://policies.google.com/privacy"
            className="text-[#008069] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            מדיניות הפרטיות של Google
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">4. כיצד אנחנו משתמשים במידע</h2>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>מתן השירות: שליחת הודעות, שיחות, סנכרון אנשי קשר (בהסכמתך), והתראות.</li>
          <li>אבטחה: זיהוי שימוש לרעה, מניעת הונאות ושמירה על שלמות המערכת.</li>
          <li>שיפור השירות: תיקון תקלות ושיפור חוויית המשתמש.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">5. שיתוף מידע עם צדדים שלישיים</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו לא מוכרים את המידע האישי שלך. אנחנו משתמשים בספקי תשתית הכרחיים להפעלת השירות:
        </p>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>
            <strong className="text-[var(--wa-text)]">Supabase</strong> — אימות משתמשים, מסד נתונים ואחסון.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">Google</strong> — התחברות OAuth וסנכרון אנשי קשר (רק בהסכמתך).
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">Vercel</strong> (או ספק אירוח דומה) — אירוח האפליקציה.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">6. שמירת מידע</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו שומרים מידע כל עוד החשבון שלך פעיל וכנדרש לצורך מתן השירות, עמידה בחובות משפטיות, או פתרון מחלוקות.
          מדיה בשיחות (תמונות, סרטונים והקלטות) נשמרת עם השיחה. סטטוסים נמחקים אוטומטית לאחר כ־12 שעות.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">7. אבטחה</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו נוקטים אמצעי אבטחה סבירים, כולל הצפנת תעבורה (HTTPS), בקרות גישה במסד הנתונים, ומדיניות הרשאות לפי
          משתמש. עם זאת, אף שיטה אינה מאובטחת ב־100%.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">8. זכויותיך</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          בהתאם לדין החל, עשויה להיות לך הזכות לגשת למידע שלך, לתקן אותו, למחוק אותו, או להגביל עיבוד. לבקשות —
          פנה אלינו בכתובת למטה.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">9. ילדים</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          השירות אינו מיועד לילדים מתחת לגיל 13. אם הנך הורה או אפוטרופוס וסבור שילדך מסר לנו מידע — צור איתנו קשר.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">10. שינויים במדיניות</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו עשויים לעדכן מדיניות זו מעת לעת. תאריך העדכון האחרון מופיע בראש העמוד. המשך שימוש לאחר עדכון מהווה
          הסכמה לגרסה המעודכנת.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">11. יצירת קשר</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          לשאלות בנוגע למדיניות פרטיות זו:
        </p>
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
