import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ChatApp } from "@/components/chat/chat-app"
import { ensureProfileServer } from "@/lib/ensure-profile"

export default async function ChatPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const profile = await ensureProfileServer(user)

  return <ChatApp currentUser={profile} />
}
