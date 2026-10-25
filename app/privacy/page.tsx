import type { Metadata } from "next"
import { LegalPageShell } from "@/components/legal/legal-page-shell"
import { APP_NAME, getSiteUrl, getSupportEmail } from "@/lib/site-config"

export const metadata: Metadata = {
  title: `מדיניות פרטיות — ${APP_NAME}`,
  description: `מדיניות הפרטיות של ${APP_NAME}, כולל גוגל דרייב ואנשי קשר מגוגל.`,
}

const LAST_UPDATED = "26 באוקטובר 2026"

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
            <strong className="text-[var(--wa-text)]">תוכן שיחות:</strong> הודעות טקסט, מטא־נתונים (זמן שליחה, סטטוס
            קריאה), ומזהי קבצים כששולחים מדיה.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">נתוני שימוש טכניים:</strong> מידע על מכשיר, דפדפן, כתובת IP
            (דרך ספק האירוח), ולוגים טכניים לצורכי אבטחה ותפעול.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">גוגל דרייב (אופציונלי):</strong> רק אם בחרת &quot;חבר את גוגל
            דרייב&quot;. אנחנו מבקשים הרשאה מוגבלת (<span dir="ltr">drive.file</span>) לקבצים ש־{APP_NAME} עצמה יוצרת
            בתיקייה ייעודית בחשבון שלך. לא ניגשים לשאר הדרייב.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">אנשי קשר מגוגל (אופציונלי):</strong> רק אם בחרת במפורש
            &quot;סנכרן אנשי קשר מגוגל&quot;. אנחנו מבקשים הרשאת קריאה בלבד (
            <span dir="ltr">contacts.readonly</span>) ומשתמשים במידע כדי להציג אילו אנשי קשר רשומים גם ב־{APP_NAME}.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">3. גוגל דרייב</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          חיבור דרייב הוא רשות. בלי החיבור אפשר להמשיך לשלוח טקסט, אבל לא תמונות, סרטונים או סטטוסים עם מדיה.
        </p>
        <p className="mt-2 text-[var(--wa-text-secondary)]">כשאתה מאשר גישה לדרייב:</p>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>
            נוצרת תיקייה בשם {APP_NAME} בחשבון Google Drive שלך. תמונות, סרטונים, קול וסטטוסים שאתה שולח נשמרים שם.
          </li>
          <li>
            ההרשאה היא <span dir="ltr">https://www.googleapis.com/auth/drive.file</span> בלבד — קבצים שהאפליקציה
            יצרה. אין לנו גישה למסמכים, תמונות או תיקיות אחרות בדרייב.
          </li>
          <li>
            כדי שהנמען יוכל להוריד גם כשאתה לא מחובר, אנחנו שומרים אצלנו אסימון רענון מוצפן ואת כתובת האימייל של
            חשבון הדרייב שחיברת. האסימון משמש רק להעלאה, להעתקה בין חשבונות {APP_NAME} ולמחיקה לפי מדיניות השמירה.
          </li>
          <li>
            כשנמען לוחץ &quot;הורד לחשבון שלי&quot;, הקובץ מועתק לדרייב שלו. אחרי ההעתקה הוא צופה מהחשבון שלו.
          </li>
          <li>
            מדיה של סטטוס נמחקת מהדרייב כשהסטטוס פג (כ־12 שעות). תמונות וסרטונים בצ&apos;אט נמחקים מהדרייב אחרי כ־4
            ימים. ניתוק דרייב או ביטול ההרשאה בחשבון Google מפסיקים גישה חדשה.
          </li>
          <li>אפשר לנתק בכל רגע מתוך הפרופיל ב־{APP_NAME}, או מ־Google Account → Security → Third-party access.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">4. סנכרון אנשי קשר מגוגל</h2>
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
      </section>

      <section>
        <h2 className="text-base font-semibold">5. Google API Limited Use</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          השימוש במידע שהתקבל מ־Google APIs (כולל Drive ו־People) כפוף ל־
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes"
            className="text-[#008069] hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , כולל דרישות Limited Use, ול־
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
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>המידע משמש רק לתכונות גלויות למשתמש: שמירת מדיה בדרייב שלו, הורדה לחשבון הנמען, וסנכרון אנשי קשר.</li>
          <li>אנחנו לא מוכרים את המידע, לא משתמשים בו לפרסום, ולא מעבירים אותו לצורכי AI או אימון מודלים.</li>
          <li>אדם אצלנו לא קורא את תוכן הדרייב או אנשי הקשר, אלא אם ביקשת זאת, או כנדרש לאבטחה / דין.</li>
        </ul>
        <div className="mt-4 rounded-lg bg-[var(--wa-header)] px-4 py-3 text-[var(--wa-text-secondary)]" dir="ltr">
          <p className="font-medium text-[var(--wa-text)]">English — Limited Use</p>
          <p className="mt-2">
            {APP_NAME} uses Google user data only to provide user-facing features: storing chat and status media in
            a {APP_NAME} folder on the user&apos;s own Drive (<span>drive.file</span> only), copying a file to a
            recipient&apos;s Drive when they tap download, and optional contact matching (
            <span>contacts.readonly</span>). We do not sell Google user data, use it for advertising, or allow humans
            to read it except for security, legal compliance, or at the user&apos;s request. Use of information
            received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use
            requirements.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold">6. כיצד אנחנו משתמשים במידע</h2>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>מתן השירות: שליחת הודעות, שיחות, שמירת מדיה בדרייב שלך (בהסכמתך), סנכרון אנשי קשר, והתראות.</li>
          <li>אבטחה: זיהוי שימוש לרעה, מניעת הונאות ושמירה על שלמות המערכת.</li>
          <li>שיפור השירות: תיקון תקלות ושיפור חוויית המשתמש.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">7. שיתוף מידע עם צדדים שלישיים</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו לא מוכרים את המידע האישי שלך. אנחנו משתמשים בספקי תשתית הכרחיים להפעלת השירות:
        </p>
        <ul className="mt-2 list-disc space-y-2 pr-5 text-[var(--wa-text-secondary)]">
          <li>
            <strong className="text-[var(--wa-text)]">Supabase</strong> — אימות משתמשים, מסד נתונים, ואסימוני דרייב
            מוצפנים.
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">Google</strong> — התחברות OAuth, דרייב (רק בהסכמתך), וסנכרון
            אנשי קשר (רק בהסכמתך).
          </li>
          <li>
            <strong className="text-[var(--wa-text)]">Vercel</strong> (או ספק אירוח דומה) — אירוח האפליקציה.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold">8. שמירת מידע</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          הודעות טקסט נשמרות אצלנו כל עוד החשבון פעיל. תמונות, סרטונים וסטטוסים יושבים בדרייב שלך; אנחנו שומרים רק
          מזהה קובץ ואסימון מוצפן. מדיה בצ&apos;אט נמחקת מהדרייב אחרי כ־4 ימים. סטטוסים נמחקים אחרי כ־12 שעות. אסימון
          הדרייב נמחק כשמנתקים את החיבור. מידע נוסף נשמר כנדרש לדין או ליישוב מחלוקות.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">9. אבטחה</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו נוקטים אמצעי אבטחה סבירים, כולל הצפנת תעבורה (HTTPS), הצפנת אסימוני דרייב במנוחה, בקרות גישה במסד
          הנתונים, ומדיניות הרשאות לפי משתמש. עם זאת, אף שיטה אינה מאובטחת ב־100%.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">10. זכויותיך</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          בהתאם לדין החל, עשויה להיות לך הזכות לגשת למידע שלך, לתקן אותו, למחוק אותו, או להגביל עיבוד. אפשר לנתק
          דרייב מהפרופיל, ולבטל הרשאות גוגל מחשבון Google. לבקשות נוספות — פנה אלינו בכתובת למטה.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">11. ילדים</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          השירות אינו מיועד לילדים מתחת לגיל 13. אם הנך הורה או אפוטרופוס וסבור שילדך מסר לנו מידע — צור איתנו קשר.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">12. שינויים במדיניות</h2>
        <p className="mt-2 text-[var(--wa-text-secondary)]">
          אנחנו עשויים לעדכן מדיניות זו מעת לעת. תאריך העדכון האחרון מופיע בראש העמוד. המשך שימוש לאחר עדכון מהווה
          הסכמה לגרסה המעודכנת.
        </p>
      </section>

      <section>
        <h2 className="text-base font-semibold">13. יצירת קשר</h2>
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
