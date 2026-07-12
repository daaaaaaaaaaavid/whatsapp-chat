import Link from "next/link"
import { MailCheck } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-svh w-full flex-col bg-[#f0f2f5]">
      <div className="h-32 w-full bg-[#00a884]" />
      <div className="mx-auto -mt-24 w-full max-w-md px-4">
        <div className="rounded-lg bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#dcf8c6]">
            <MailCheck className="h-7 w-7 text-[#008069]" />
          </div>
          <h1 className="mt-4 text-2xl font-normal text-[#111b21]">בדוק את המייל שלך</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#667781]">
            שלחנו לך קישור אימות לכתובת המייל. אשר את ההרשמה ואז תוכל להתחבר ולהתחיל לשלוח הודעות.
          </p>
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
