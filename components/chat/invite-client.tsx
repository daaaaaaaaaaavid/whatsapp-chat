"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { joinConversationByInvite } from "@/lib/chat-actions"

type Props = {
  token: string
}

export function InviteClient({ token }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  const [message, setMessage] = useState("מצטרף לשיחה...")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!data.user) {
          const next = encodeURIComponent(`/invite/${token}`)
          router.replace(`/auth/login?next=${next}`)
          return
        }
        const conversationId = await joinConversationByInvite(token)
        if (cancelled) return
        setStatus("ok")
        setMessage("הצטרפת בהצלחה! מעביר לצ'אט...")
        router.replace(`/chat?c=${conversationId}`)
      } catch (err) {
        if (cancelled) return
        setStatus("error")
        setMessage(err instanceof Error ? err.message : "ההצטרפות נכשלה")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, router])

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f0f2f5] px-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="text-2xl font-semibold text-[#00a884]">WhaChat</div>
        <p className={`mt-4 text-sm ${status === "error" ? "text-[#ea0038]" : "text-[#54656f]"}`}>{message}</p>
        {status === "error" && (
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="mt-6 rounded-lg bg-[#00a884] px-4 py-2 text-sm font-medium text-white"
          >
            חזרה לצ&apos;אטים
          </button>
        )}
      </div>
    </main>
  )
}
