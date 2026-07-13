"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConversations } from "@/lib/use-conversations"
import type { Conversation, Message, Profile } from "@/lib/types"
import {
  loadChatPrefs,
  saveChatPrefs,
  toggleArchived,
  toggleFavorite,
  togglePinned,
  type ChatPrefs,
} from "@/lib/chat-prefs"
import { SidebarHeader } from "./sidebar-header"
import { ChatList } from "./chat-list"
import { ConversationView } from "./conversation-view"
import { ConversationInfo } from "./conversation-info"
import { EmptyState } from "./empty-state"
import { NewChatDialog } from "./new-chat-dialog"
import { NewGroupDialog } from "./new-group-dialog"
import { ProfileDialog } from "./profile-dialog"
import { StatusDialog } from "./status-dialog"
import { NavRail, type NavTab } from "./nav-rail"
import { CallsPanel } from "./calls-panel"
import { CommunitiesPanel } from "./communities-panel"
import { CallOverlay } from "./call-overlay"
import { useWebRtcCall } from "@/lib/use-webrtc-call"
import { playIncomingMessageSound, unlockNotificationSound } from "@/lib/notification-sound"

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
  const [navTab, setNavTab] = useState<NavTab>("chats")
  const [prefs, setPrefs] = useState<ChatPrefs>(() => loadChatPrefs(initialUser.id))

  const {
    phase,
    call,
    error: callError,
    setError: setCallError,
    seconds,
    muted,
    camOff,
    hasRemoteVideo,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    toggleCamera,
  } = useWebRtcCall({ currentUser, conversations })

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  const unreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
    [conversations],
  )

  useEffect(() => {
    setPrefs(loadChatPrefs(currentUser.id))
  }, [currentUser.id])

  // Incoming message notification sound (any conversation except own messages)
  useEffect(() => {
    const unlock = () => unlockNotificationSound()
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })

    const supabase = createClient()
    const channel = supabase
      .channel(`incoming-sound-${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const msg = payload.new as Message
          if (!msg || msg.sender_id === currentUser.id) return
          if (msg.type === "system") return
          playIncomingMessageSound()
        },
      )
      .subscribe()

    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
      supabase.removeChannel(channel)
    }
  }, [currentUser.id])

  const updatePrefs = useCallback(
    (next: ChatPrefs) => {
      setPrefs(next)
      saveChatPrefs(currentUser.id, next)
    },
    [currentUser.id],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { ensureProfileClient } = await import("@/lib/ensure-profile-client")
        const updated = await ensureProfileClient({
          id: currentUser.id,
          email: currentUser.email,
          display_name: currentUser.display_name,
        })
        if (!cancelled && updated) setCurrentUser(updated)
      } catch {
        // profiles table may not exist yet
      }
    })()

    const bump = () => {
      try {
        const supabase = createClient()
        supabase
          .from("profiles")
          .update({ last_seen: new Date().toISOString() })
          .eq("id", currentUser.id)
          .then(() => {})
      } catch {
        // ignore
      }
    }
    const id = window.setInterval(bump, 60_000)
    bump()
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [currentUser.id, currentUser.email, currentUser.display_name])

  const selectConversation = useCallback((conv: Conversation) => {
    setActiveId(conv.id)
    setShowInfo(false)
    setNavTab("chats")
  }, [])

  const openCreated = useCallback(
    async (conversationId: string) => {
      setNewChatOpen(false)
      setNewGroupOpen(false)
      await reload()
      setActiveId(conversationId)
      setShowInfo(false)
      setNavTab("chats")
    },
    [reload],
  )

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const handleStartCall = useCallback(
    (conv: Conversation, video: boolean) => {
      void startCall(conv, video)
    },
    [startCall],
  )

  const handleNavChange = (tab: NavTab) => {
    setNavTab(tab)
    if (tab === "status") setStatusOpen(true)
    if (tab === "settings") setProfileOpen(true)
    if (tab !== "chats") {
      setActiveId(null)
      setShowInfo(false)
    }
  }

  const showChatPane = Boolean(activeConversation) && navTab === "chats"

  return (
    <div className="flex h-svh w-full overflow-hidden bg-[#d1d7db]">
      <div className="mx-auto flex h-full w-full max-w-[1600px] overflow-hidden bg-white shadow-xl">
        <NavRail
          active={navTab === "settings" ? "settings" : navTab === "status" ? "status" : navTab}
          currentUser={currentUser}
          unreadTotal={unreadTotal}
          onChange={handleNavChange}
          onOpenProfile={() => setProfileOpen(true)}
        />

        {/* Middle pane */}
        <aside
          className={`flex w-full flex-col border-l border-[#e9edef] md:w-[30%] md:min-w-[320px] md:max-w-[420px] ${
            showChatPane ? "hidden md:flex" : "flex"
          }`}
        >
          {navTab === "calls" ? (
            <CallsPanel conversations={conversations} currentUser={currentUser} onCall={handleStartCall} />
          ) : navTab === "communities" ? (
            <CommunitiesPanel />
          ) : (
            <>
              <SidebarHeader
                onNewChat={() => setNewChatOpen(true)}
                onNewGroup={() => setNewGroupOpen(true)}
                onOpenProfile={() => setProfileOpen(true)}
                onLogout={handleLogout}
              />
              <ChatList
                conversations={conversations}
                loading={loading}
                currentUser={currentUser}
                activeId={activeId}
                prefs={prefs}
                onSelect={selectConversation}
                onToggleArchive={(id) => updatePrefs(toggleArchived(prefs, id))}
                onToggleFavorite={(id) => updatePrefs(toggleFavorite(prefs, id))}
                onTogglePinned={(id) => updatePrefs(togglePinned(prefs, id))}
              />
            </>
          )}
        </aside>

        {/* Main pane */}
        <main
          className={`relative flex min-w-0 flex-1 ${showChatPane ? "flex" : "hidden md:flex"}`}
        >
          {navTab === "communities" ? (
            <CommunitiesPanel />
          ) : navTab === "calls" ? (
            <EmptyState title="שיחות" subtitle="בחר שיחה מהרשימה או התחל שיחה מצ'אט." />
          ) : activeConversation ? (
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
                  onStartCall={(video) => handleStartCall(activeConversation, video)}
                  onToggleArchive={() => updatePrefs(toggleArchived(prefs, activeConversation.id))}
                  onToggleFavorite={() => updatePrefs(toggleFavorite(prefs, activeConversation.id))}
                  isArchived={prefs.archived.includes(activeConversation.id)}
                  isFavorite={prefs.favorites.includes(activeConversation.id)}
                />
              </div>
              <ConversationInfo
                open={showInfo}
                conversation={activeConversation}
                currentUser={currentUser}
                onClose={() => setShowInfo(false)}
                onToggleArchive={() => updatePrefs(toggleArchived(prefs, activeConversation.id))}
                onToggleFavorite={() => updatePrefs(toggleFavorite(prefs, activeConversation.id))}
                isArchived={prefs.archived.includes(activeConversation.id)}
                isFavorite={prefs.favorites.includes(activeConversation.id)}
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
        onClose={() => {
          setProfileOpen(false)
          if (navTab === "settings") setNavTab("chats")
        }}
        onUpdated={(p) => setCurrentUser(p)}
      />
      <StatusDialog
        open={statusOpen}
        currentUser={currentUser}
        onClose={() => {
          setStatusOpen(false)
          if (navTab === "status") setNavTab("chats")
        }}
      />

      {callError && phase === "idle" && (
        <div className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-[#111b21] px-4 py-3 text-sm text-white shadow-lg">
          {callError}
          <button type="button" className="mr-3 text-[#25d366]" onClick={() => setCallError(null)}>
            סגור
          </button>
        </div>
      )}

      {call && phase !== "idle" && (
        <CallOverlay
          phase={phase}
          call={call}
          seconds={seconds}
          muted={muted}
          camOff={camOff}
          hasRemoteVideo={hasRemoteVideo}
          error={callError}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          remoteAudioRef={remoteAudioRef}
          onAccept={() => void acceptCall()}
          onReject={() => void rejectCall()}
          onHangup={() => void hangup()}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
        />
      )}
    </div>
  )
}
