"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConversations } from "@/lib/use-conversations"
import type { Conversation, Message, Profile } from "@/lib/types"
import {
  loadChatPrefs,
  mergeRemoteChatPrefs,
  saveChatPrefs,
  toggleArchived,
  toggleFavorite,
  toggleMuted,
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
import {
  ensureNotificationPermission,
  showIncomingMessageNotification,
} from "@/lib/browser-notifications"
import { registerPushSubscription, ensureServiceWorker } from "@/lib/push-client"
import { messagePreview, convDisplayName, isSelfConversation } from "@/lib/conversation-display"
import { LoadingScreen } from "./loading-screen"
import { MessageToastStack, type MessageToastItem } from "./message-toast"

type Props = {
  currentUser: Profile
}

export function ChatApp({ currentUser: initialUser }: Props) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<Profile>(initialUser)
  const { conversations, loading, reload, upsertLastMessage, clearUnread, removeConversation } =
    useConversations(currentUser.id)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [navTab, setNavTab] = useState<NavTab>("chats")
  const [prefs, setPrefs] = useState<ChatPrefs>(() => loadChatPrefs(initialUser.id))
  const [infoGalleryMessageId, setInfoGalleryMessageId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<MessageToastItem[]>([])
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations

  const pushToast = useCallback((item: Omit<MessageToastItem, "id">) => {
    const id = `toast-${crypto.randomUUID()}`
    setToasts((prev) => [...prev.slice(-2), { ...item, id }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Deep link: /chat?c=<conversationId>
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const c = params.get("c")
    if (!c) return
    setActiveId(c)
    setNavTab("chats")
    const url = new URL(window.location.href)
    url.searchParams.delete("c")
    window.history.replaceState({}, "", url.pathname)
  }, [])

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
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from("profiles")
          .select("chat_prefs")
          .eq("id", currentUser.id)
          .maybeSingle()
        if (cancelled || !data?.chat_prefs) return
        setPrefs(mergeRemoteChatPrefs(currentUser.id, data.chat_prefs as Partial<ChatPrefs>))
      } catch {
        // column may not exist yet
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUser.id])

  // Incoming message sound + in-app toasts + browser / push notifications
  useEffect(() => {
    const unlock = () => {
      unlockNotificationSound()
      void ensureServiceWorker()
      void ensureNotificationPermission().then((perm) => {
        if (perm === "granted") void registerPushSubscription()
      })
    }
    window.addEventListener("pointerdown", unlock, { once: true })
    window.addEventListener("keydown", unlock, { once: true })

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; conversationId?: string; title?: string; body?: string }
        | undefined
      if (!data?.type) return
      if (data.type === "open-conversation" && data.conversationId) {
        setActiveId(data.conversationId)
        setNavTab("chats")
        return
      }
      if (data.type === "push-message" && data.conversationId) {
        const isActiveChat =
          activeIdRef.current === data.conversationId && document.visibilityState === "visible"
        if (isActiveChat) return
        if (prefsRef.current.muted.includes(data.conversationId)) return
        pushToast({
          title: data.title || "הודעה חדשה",
          body: data.body || "",
          conversationId: data.conversationId,
        })
      }
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onSwMessage)
    }

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

          const mutedIds = prefsRef.current.muted
          if (mutedIds.includes(msg.conversation_id)) return

          const isActiveChat =
            activeIdRef.current === msg.conversation_id && document.visibilityState === "visible"
          if (isActiveChat) return

          playIncomingMessageSound()

          const conv = conversationsRef.current.find((c) => c.id === msg.conversation_id)
          const title = conv ? convDisplayName(conv, currentUser.id) : "הודעה חדשה"
          const body = messagePreview(msg)

          pushToast({ title, body, conversationId: msg.conversation_id })
          void showIncomingMessageNotification({
            title,
            body,
            tag: msg.conversation_id,
            conversationId: msg.conversation_id,
            onClick: () => setActiveId(msg.conversation_id),
          })
        },
      )
      .subscribe()

    return () => {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onSwMessage)
      }
      supabase.removeChannel(channel)
    }
  }, [currentUser.id, pushToast])

  const updatePrefs = useCallback(
    (next: ChatPrefs) => {
      setPrefs(next)
      saveChatPrefs(currentUser.id, next)
    },
    [currentUser.id],
  )

  // Keep "message yourself" permanently pinned at the top
  useEffect(() => {
    const selfIds = conversations
      .filter((c) => isSelfConversation(c, currentUser.id))
      .map((c) => c.id)
    if (!selfIds.length) return
    const currentPinned = prefsRef.current.pinned
    const missing = selfIds.filter((id) => !currentPinned.includes(id))
    if (!missing.length) return
    updatePrefs({ ...prefsRef.current, pinned: [...currentPinned, ...missing] })
  }, [conversations, currentUser.id, updatePrefs])

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
      unlockNotificationSound()
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

  if (loading) {
    return <LoadingScreen label="טוען צ'אטים" />
  }

  return (
    <div className="flex h-svh w-svw max-w-[100vw] overflow-hidden bg-white">
      <div className="flex h-full min-w-0 w-full flex-1 overflow-hidden">
        <NavRail
          active={navTab === "settings" ? "settings" : navTab === "status" ? "status" : navTab}
          currentUser={currentUser}
          unreadTotal={unreadTotal}
          onChange={handleNavChange}
          onOpenProfile={() => setProfileOpen(true)}
        />

        {/* Chat list pane */}
        <aside
          className={`flex min-w-0 flex-col border-l border-[#e9edef] bg-white ${
            showChatPane ? "hidden md:flex md:w-[min(30%,420px)] md:min-w-[340px] md:max-w-[420px]" : "flex w-full md:w-[min(30%,420px)] md:min-w-[340px] md:max-w-[420px]"
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

        {/* Main pane — fills remaining width */}
        <main
          className={`relative min-h-0 min-w-0 flex-1 ${
            showChatPane ? "flex" : "hidden md:flex"
          }`}
        >
          {navTab === "communities" ? (
            <div className="flex h-full min-w-0 flex-1 flex-col">
              <CommunitiesPanel />
            </div>
          ) : navTab === "calls" ? (
            <div className="flex h-full min-w-0 flex-1 flex-col">
              <EmptyState title="שיחות" subtitle="בחר שיחה מהרשימה או התחל שיחה מצ'אט." />
            </div>
          ) : activeConversation ? (
            <div className="flex h-full min-w-0 flex-1">
              <div className={`min-h-0 min-w-0 flex-1 ${showInfo ? "hidden lg:block" : "block"}`}>
                <ConversationView
                  conversation={activeConversation}
                  currentUser={currentUser}
                  conversations={conversations}
                  prefs={prefs}
                  onPrefsChange={updatePrefs}
                  onBack={() => {
                    setActiveId(null)
                    setShowInfo(false)
                  }}
                  onOpenInfo={() => setShowInfo(true)}
                  onStartCall={(video) => handleStartCall(activeConversation, video)}
                  onToggleArchive={() => updatePrefs(toggleArchived(prefs, activeConversation.id))}
                  onToggleFavorite={() => updatePrefs(toggleFavorite(prefs, activeConversation.id))}
                  onTogglePinned={() => updatePrefs(togglePinned(prefs, activeConversation.id))}
                  onMessageActivity={(msg) => {
                    upsertLastMessage(msg)
                    if (msg.sender_id === currentUser.id || activeIdRef.current === msg.conversation_id) {
                      clearUnread(msg.conversation_id)
                    }
                  }}
                  onConversationOpened={clearUnread}
                  isArchived={prefs.archived.includes(activeConversation.id)}
                  isFavorite={prefs.favorites.includes(activeConversation.id)}
                  isPinned={prefs.pinned.includes(activeConversation.id)}
                  initialGalleryMessageId={infoGalleryMessageId}
                  onGalleryOpened={() => setInfoGalleryMessageId(null)}
                />
              </div>
              <ConversationInfo
                open={showInfo}
                conversation={activeConversation}
                currentUser={currentUser}
                onClose={() => setShowInfo(false)}
                onToggleArchive={() => updatePrefs(toggleArchived(prefs, activeConversation.id))}
                onToggleFavorite={() => updatePrefs(toggleFavorite(prefs, activeConversation.id))}
                onToggleMute={() => updatePrefs(toggleMuted(prefs, activeConversation.id))}
                onTogglePinned={() => updatePrefs(togglePinned(prefs, activeConversation.id))}
                isArchived={prefs.archived.includes(activeConversation.id)}
                isFavorite={prefs.favorites.includes(activeConversation.id)}
                isMuted={prefs.muted.includes(activeConversation.id)}
                isPinned={prefs.pinned.includes(activeConversation.id)}
                onOpenMedia={(messageId) => {
                  setInfoGalleryMessageId(messageId)
                  setShowInfo(false)
                }}
                onLeftOrDeleted={() => {
                  removeConversation(activeConversation.id)
                  setActiveId(null)
                  setShowInfo(false)
                }}
              />
            </div>
          ) : (
            <div className="flex h-full min-w-0 flex-1 flex-col">
              <EmptyState />
            </div>
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

      <MessageToastStack
        toasts={toasts}
        onOpen={(id) => {
          setActiveId(id)
          setNavTab("chats")
        }}
        onDismiss={dismissToast}
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
