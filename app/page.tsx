import { redirect } from "next/navigation"
import { getSupabaseEnv } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const { url, anonKey } = getSupabaseEnv()

  if (!url || !anonKey) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#f0f2f5] px-6 text-center">
        <h1 className="text-2xl font-medium text-[#111b21]">חסרים מפתחות Supabase</h1>
        <p className="max-w-md text-sm leading-relaxed text-[#667781]">
          צור קובץ <code className="rounded bg-white px-1.5 py-0.5">.env.local</code> בתיקיית הפרויקט
          (ליד <code className="rounded bg-white px-1.5 py-0.5">.env.example</code>) והדבק את הערכים מ־
          Supabase → Project Settings → API:
        </p>
        <pre className="max-w-lg overflow-x-auto rounded-lg bg-[#111b21] p-4 text-left text-xs text-[#d9fdd3]" dir="ltr">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...`}
        </pre>
        <p className="text-sm text-[#667781]">אחרי השמירה — עצור את השרת והרץ שוב npm run dev</p>
      </main>
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect("/chat")
  }
  redirect("/auth/login")
}
