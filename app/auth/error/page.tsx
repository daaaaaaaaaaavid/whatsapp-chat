"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { AlertTriangle } from "lucide-react"

function reasonHint(reason: string | null): string {
  if (!reason) {
    return "לא הצלחנו לאמת את הבקשה שלך. נסה להתחבר שוב."
  }

  const r = reason.toLowerCase()
  if (r.includes("redirect") || r.includes("url not allowed")) {
    return "כתובת ה־Redirect לא מורשית ב־Supabase. הוסף את כתובת האפליקציה תחת Authentication → URL Configuration → Redirect URLs."
  }
  if (r.includes("missing_code") || r.includes("exchange")) {
    return "ההתחברות עם Google לא הושלמה. ודא שב־Google Cloud הוגדר Redirect URI של Supabase, וש־Client ID/Secret תואמים."
  }
  if (r.includes("access_denied")) {
    return "הגישה נדחתה ב־Google. אם האפליקציה במצב Testing, הוסף את המייל שלך כ־Test user."
  }
  return reason
}

function AuthErrorInner() {
  const params = useSearchParams()
  const reason = params.get("reason")

  return (
    <div className="flex min-h-svh w-full flex-col bg-[#f0f2f5]">
      <div className="h-32 w-full bg-[#00a884]" />
      <div className="mx-auto -mt-24 w-full max-w-md px-4">
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="mt-4 text-2xl font-normal text-[#111b21]">משהו השתבש</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#667781]">{reasonHint(reason)}</p>

          <div
            className="mt-5 rounded-md bg-[#f0f2f5] p-3 text-right text-xs leading-relaxed text-[#54656f]"
            dir="rtl"
          >
            <p className="font-medium text-[#111b21]">בדיקות מהירות:</p>
            <ol className="mt-2 list-decimal space-y-1 pr-4">
              <li>
                ב־Google Cloud → Credentials: Authorized redirect URI =
                <span className="block break-all dir-ltr text-left font-mono" dir="ltr">
                  https://YOUR_PROJECT.supabase.co/auth/v1/callback
                </span>
              </li>
              <li>
                ב־Supabase → Authentication → URL Configuration הוסף:
                <span className="block break-all dir-ltr text-left font-mono" dir="ltr">
                  http://localhost:3000/auth/callback
                </span>
                וגם את כתובת Vercel שלך.
              </li>
              <li>Consent screen במצב Testing? הוסף את המייל שלך כ־Test user.</li>
            </ol>
          </div>

          <Link
            href="/auth/login"
            className="mt-6 inline-block rounded-full bg-[#00a884] px-6 py-2.5 font-medium text-white transition hover:bg-[#008069]"
          >
            חזרה להתחברות
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-[#f0f2f5] text-sm text-[#667781]">
          טוען...
        </div>
      }
    >
      <AuthErrorInner />
    </Suspense>
  )
}
