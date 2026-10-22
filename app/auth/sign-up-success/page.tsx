import Link from "next/link"
import { MailCheck } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"

export default function SignUpSuccessPage() {
  return (
    <AuthFrame>
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wa-accent-soft)]">
          <MailCheck className="h-7 w-7 text-[var(--wa-teal-dark)]" />
        </div>
        <h1 className="mt-4 text-2xl font-medium text-[var(--wa-text)]">בדוק את המייל שלך</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--wa-text-secondary)]">
          שלחנו לך קישור אימות לכתובת המייל. אשר את ההרשמה ואז תוכל להתחבר ולהתחיל לשלוח הודעות.
        </p>
        <Link href="/auth/login" className="wa-btn mt-6 inline-block px-6 py-2.5">
          חזרה להתחברות
        </Link>
      </div>
    </AuthFrame>
  )
}
