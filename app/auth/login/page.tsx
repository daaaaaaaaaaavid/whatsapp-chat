"use client"

import type React from "react"

import { createClient, ensureSupabaseConfig } from "@/lib/supabase/client"
import { signInWithGoogle } from "@/lib/auth-google"
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, Suspense } from "react"
import { Lock } from "lucide-react"
import { Logo } from "@/components/brand/logo"

function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get("next") || "/chat"

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await ensureSupabaseConfig()
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push(nextPath.startsWith("/") ? nextPath : "/chat")
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
      await signInWithGoogle(nextPath.startsWith("/") ? nextPath : "/chat")
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
    <div className="flex min-h-svh w-full flex-col bg-[var(--wa-header)]">
      <div className="h-32 w-full bg-[#00a884]" />
      <div className="mx-auto -mt-24 w-full max-w-md px-4 pb-10">
        <div className="mb-6 flex justify-center">
          <Logo size={8} withWordmark variant="white" wordmarkClassName="text-sm font-medium tracking-wide" />
        </div>
        <div className="rounded-lg bg-[var(--wa-panel)] p-8 shadow-sm">
          <h1 className="text-2xl font-normal text-[var(--wa-text)]">התחברות</h1>
          <p className="mt-1 text-sm text-[var(--wa-text-secondary)]">הזן את הפרטים שלך כדי להיכנס לחשבון</p>

          <div className="mt-6">
            <GoogleSignInButton onClick={() => void handleGoogle()} disabled={isLoading || googleLoading} />
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e9edef]" />
            <span className="text-xs text-[#8696a0]">או</span>
            <div className="h-px flex-1 bg-[#e9edef]" />
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
                className="rounded-md border border-[#d1d7db] bg-[var(--wa-panel)] px-3 py-2.5 text-[var(--wa-text)] outline-none transition focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]"
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
                className="rounded-md border border-[#d1d7db] bg-[var(--wa-panel)] px-3 py-2.5 text-[var(--wa-text)] outline-none transition focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884]"
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
              className="mt-2 rounded-full bg-[#00a884] px-4 py-2.5 font-medium text-white transition hover:bg-[#008069] disabled:opacity-60"
            >
              {isLoading ? "מתחבר..." : "התחברות"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--wa-text-secondary)]">
            אין לך חשבון?{" "}
            <Link href="/auth/sign-up" className="font-medium text-[#008069] hover:underline">
              הרשמה
            </Link>
          </p>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[var(--wa-text-secondary)]">
          <Lock className="h-3 w-3" />
          ההודעות האישיות שלך מוצפנות מקצה לקצה
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-svh bg-[var(--wa-header)]" />}>
      <LoginForm />
    </Suspense>
  )
}
