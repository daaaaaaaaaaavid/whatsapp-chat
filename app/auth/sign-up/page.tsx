"use client"

import type React from "react"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import { signInWithGoogle } from "@/lib/auth-google"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, Suspense } from "react"
import { Lock } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"
import { AuthLegalFooter } from "@/components/legal/auth-legal-footer"
import { safeRedirectPath } from "@/lib/safe-redirect"

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === "string" && msg.trim()) return msg
  }
  if (typeof err === "string" && err.trim()) return err
  return "אירעה שגיאה לא צפויה. נסה שוב."
}

function SignUpForm() {
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [repeatPassword, setRepeatPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeRedirectPath(searchParams.get("next"))

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!displayName.trim()) {
      setError("נא להזין שם תצוגה")
      return
    }
    if (!email.trim()) {
      setError("נא להזין כתובת אימייל")
      return
    }
    if (password.length < 6) {
      setError("הסיסמה חייבת להכיל לפחות 6 תווים")
      return
    }
    if (password !== repeatPassword) {
      setError("הסיסמאות אינן תואמות")
      return
    }

    setIsLoading(true)
    try {
      await ensureSupabaseConfig()
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { display_name: displayName.trim() },
        },
      })

      if (signUpError) {
        setError(signUpError.message || "ההרשמה נכשלה")
        return
      }

      if (!data.user) {
        setError("לא נוצר משתמש. בדוק את הגדרות Authentication ב־Supabase.")
        return
      }

      // If email confirmation is disabled, session exists — go straight to next
      if (data.session) {
        router.push(nextPath)
        router.refresh()
        return
      }

      router.push("/auth/sign-up-success")
      router.refresh()
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle(nextPath)
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "התחברות עם Google נכשלה. ודא שהפעלת Google ב־Supabase Authentication.",
      )
      setGoogleLoading(false)
    }
  }

  return (
    <AuthFrame
      footer={
        <>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--wa-text-secondary)]">
            <Lock className="h-3 w-3" />
            השיחות מוגנות ב־HTTPS ובהרשאות גישה
          </p>
          <AuthLegalFooter />
        </>
      }
    >
          <h1 className="text-2xl font-medium text-[var(--wa-text)]">יצירת חשבון</h1>
          <p className="mt-1 text-sm text-[var(--wa-text-secondary)]">הצטרף כדי להתחיל לשלוח הודעות</p>

          <div className="mt-6">
            <GoogleSignInButton
              onClick={() => void handleGoogle()}
              disabled={isLoading || googleLoading}
              label="הרשמה עם Google"
            />
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--wa-border)]" />
            <span className="text-xs text-[var(--wa-text-secondary)]">או</span>
            <div className="h-px flex-1 bg-[var(--wa-border)]" />
          </div>

          <form onSubmit={handleSignUp} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="name" className="text-sm font-medium text-[var(--wa-text)]">
                שם תצוגה
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="השם שיראו אחרים"
                className="wa-field"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-[var(--wa-text)]">
                כתובת אימייל
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="wa-field"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-[var(--wa-text)]">
                סיסמה (לפחות 6 תווים)
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="wa-field"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="repeat-password" className="text-sm font-medium text-[var(--wa-text)]">
                אימות סיסמה
              </label>
              <input
                id="repeat-password"
                type="password"
                autoComplete="new-password"
                minLength={6}
                dir="ltr"
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                className="wa-field"
              />
            </div>

            {error && (
              <p
                className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || googleLoading}
              className="wa-btn mt-2 px-4 py-3 disabled:opacity-60"
            >
              {isLoading ? "יוצר חשבון..." : "הרשמה"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--wa-text-secondary)]">
            כבר יש לך חשבון?{" "}
            <Link
              href={
                nextPath && nextPath !== "/chat"
                  ? `/auth/login?next=${encodeURIComponent(nextPath)}`
                  : "/auth/login"
              }
              className="font-medium text-[var(--wa-teal-dark)] hover:underline"
            >
              התחברות
            </Link>
          </p>
    </AuthFrame>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-[var(--wa-header)]" />}>
      <SignUpForm />
    </Suspense>
  )
}
