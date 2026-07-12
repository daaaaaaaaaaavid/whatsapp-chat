import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ChatApp } from "@/components/chat/chat-app"
import type { Profile } from "@/lib/types"

function toProfile(userId: string, email: string | null, row: Partial<Profile> | null): Profile {
  return {
    id: userId,
    email: row?.email ?? email,
    display_name: row?.display_name ?? email?.split("@")[0] ?? "משתמש",
    avatar_url: row?.avatar_url ?? null,
    about: row?.about ?? "זמין",
    last_seen: row?.last_seen ?? null,
    created_at: row?.created_at ?? new Date().toISOString(),
  }
}

export default async function ChatPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

  return <ChatApp currentUser={toProfile(user.id, user.email ?? null, profile)} />
}
