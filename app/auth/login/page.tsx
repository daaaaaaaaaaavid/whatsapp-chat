"use client"

import type React from "react"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import { signInWithGoogle } from "@/lib/auth-google"
import { safeRedirectPath } from "@/lib/safe-redirect"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, Suspense } from "react"
import { Lock } from "lucide-react"
import { AuthFrame } from "@/components/auth/auth-frame"
import { AuthLegalFooter } from "@/components/legal/auth-legal-footer"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeRedirectPath(searchParams.get("next"))

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await ensureSupabaseConfig()
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push(nextPath)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "אירעה שגיאה")
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
          <h1 className="text-2xl font-medium text-[var(--wa-text)]">התחברות</h1>
          <p className="mt-1 text-sm text-[var(--wa-text-secondary)]">הזן את הפרטים שלך כדי להיכנס לחשבון</p>

          <div className="mt-6">
            <GoogleSignInButton onClick={() => void handleGoogle()} disabled={isLoading || googleLoading} />
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--wa-border)]" />
            <span className="text-xs text-[var(--wa-text-secondary)]">או</span>
            <div className="h-px flex-1 bg-[var(--wa-border)]" />
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-[var(--wa-text)]">
                כתובת אימייל
              </label>
              <input
                id="email"
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="wa-field"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-[var(--wa-text)]">
                סיסמה
              </label>
              <input
                id="password"
                type="password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="wa-field"
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || googleLoading}
              className="wa-btn mt-2 px-4 py-3 disabled:opacity-60"
            >
              {isLoading ? "מתחבר..." : "התחברות"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--wa-text-secondary)]">
            אין לך חשבון?{" "}
            <Link
              href={
                nextPath && nextPath !== "/chat"
                  ? `/auth/sign-up?next=${encodeURIComponent(nextPath)}`
                  : "/auth/sign-up"
              }
              className="font-medium text-[var(--wa-teal-dark)] hover:underline"
            >
              הרשמה
            </Link>
          </p>
    </AuthFrame>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-[var(--wa-header)]" />}>
      <LoginForm />
    </Suspense>
  )
}
