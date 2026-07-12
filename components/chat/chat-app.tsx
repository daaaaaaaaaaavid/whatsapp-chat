"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConversations } from "@/lib/use-conversations"
import type { Conversation, Profile } from "@/lib/types"
import { SidebarHeader } from "./sidebar-header"
import { ChatList } from "./chat-list"
import { ConversationView } from "./conversation-view"
import { ConversationInfo } from "./conversation-info"
import { EmptyState } from "./empty-state"
import { NewChatDialog } from "./new-chat-dialog"
import { NewGroupDialog } from "./new-group-dialog"
import { ProfileDialog } from "./profile-dialog"
import { StatusDialog } from "./status-dialog"

type Props = {
  currentUser: Profile
}

export function ChatApp({ currentUser: initialUser }: Props) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<Profile>(initialUser)
  const { conversations, loading, reload } = useConversations(currentUser.id)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  // Keep last_seen fresh while the app is open
  useEffect(() => {
    const supabase = createClient()
    const bump = () => {
      supabase.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", currentUser.id).then(() => {})
    }
    bump()
    const id = window.setInterval(bump, 60_000)
    return () => window.clearInterval(id)
  }, [currentUser.id])

  const selectConversation = useCallback((conv: Conversation) => {
    setActiveId(conv.id)
    setShowInfo(false)
  }, [])

  const openCreated = useCallback(
    async (conversationId: string) => {
      setNewChatOpen(false)
      setNewGroupOpen(false)
      await reload()
      setActiveId(conversationId)
      setShowInfo(false)
    },
    [reload],
  )

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const showChatPane = Boolean(activeConversation)

  return (
    <div className="flex h-svh w-full overflow-hidden bg-[#d1d7db]">
      <div className="mx-auto flex h-full w-full max-w-[1600px] overflow-hidden bg-white shadow-xl">
        {/* Sidebar */}
        <aside
          className={`flex w-full flex-col border-l border-[#e9edef] md:w-[30%] md:min-w-[320px] md:max-w-[420px] ${
            showChatPane ? "hidden md:flex" : "flex"
          }`}
        >
          <SidebarHeader
            currentUser={currentUser}
            onNewChat={() => setNewChatOpen(true)}
            onNewGroup={() => setNewGroupOpen(true)}
            onOpenStatus={() => setStatusOpen(true)}
            onOpenProfile={() => setProfileOpen(true)}
            onLogout={handleLogout}
          />
          <ChatList
            conversations={conversations}
            loading={loading}
            currentUser={currentUser}
            activeId={activeId}
            onSelect={selectConversation}
          />
        </aside>

        {/* Main pane */}
        <main
          className={`relative flex min-w-0 flex-1 ${showChatPane ? "flex" : "hidden md:flex"}`}
        >
          {activeConversation ? (
            <>
              <div className={`min-w-0 flex-1 ${showInfo ? "hidden lg:block" : "block"}`}>
                <ConversationView
                  conversation={activeConversation}
                  currentUser={currentUser}
                  onBack={() => {
                    setActiveId(null)
                    setShowInfo(false)
                  }}
                  onOpenInfo={() => setShowInfo(true)}
                />
              </div>
              <ConversationInfo
                open={showInfo}
                conversation={activeConversation}
                currentUser={currentUser}
                onClose={() => setShowInfo(false)}
              />
            </>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>

      <NewChatDialog
        open={newChatOpen}
        currentUserId={currentUser.id}
        onClose={() => setNewChatOpen(false)}
        onCreated={openCreated}
        onNewGroup={() => {
          setNewChatOpen(false)
          setNewGroupOpen(true)
        }}
      />
      <NewGroupDialog
        open={newGroupOpen}
        currentUserId={currentUser.id}
        onClose={() => setNewGroupOpen(false)}
        onCreated={openCreated}
      />
      <ProfileDialog
        open={profileOpen}
        currentUser={currentUser}
        onClose={() => setProfileOpen(false)}
        onUpdated={(p) => setCurrentUser(p)}
      />
      <StatusDialog open={statusOpen} currentUser={currentUser} onClose={() => setStatusOpen(false)} />
    </div>
  )
}
