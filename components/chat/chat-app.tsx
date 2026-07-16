"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useConversations } from "@/lib/use-conversations"
import type { Conversation, Message, Profile, StatusReply } from "@/lib/types"
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
import {
  filterConversationsBySpace,
  setConversationSpace,
  shouldSuppressSpaceNotification,
  unreadInSpace,
  type ChatSpace,
} from "@/lib/chat-space"
import { SidebarHeader } from "./sidebar-header"
import { ChatList } from "./chat-list"
import { SpaceSwitcher } from "./space-switcher"
import { ConversationView } from "./conversation-view"
import { ConversationInfo } from "./conversation-info"
import { ConversationInfoBoundary, ChatPaneBoundary } from "./conversation-info-boundary"
import { EmptyState } from "./empty-state"
import { NewChatDialog } from "./new-chat-dialog"
import { NewGroupDialog } from "./new-group-dialog"
import { NewSpaceDialog } from "./new-space-dialog"
import { NewChannelDialog } from "./new-channel-dialog"
import { ProfileDialog } from "./profile-dialog"
import { StatusDialog } from "./status-dialog"
import { NavRail, type NavTab } from "./nav-rail"
import { CallsPanel } from "./calls-panel"
import { CommunitiesPanel } from "./communities-panel"
import { SpacesPanel } from "./spaces-panel"
import { SpaceFilterChips } from "./space-filter-chips"
import { CallOverlay } from "./call-overlay"
import { useWorkSpaces } from "@/lib/use-work-spaces"
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
import { startChatOrInviteByEmail } from "@/lib/chat-actions"
import { WORK_SPACES_UI_ENABLED, PERSONAL_WORK_UI_ENABLED } from "@/lib/site-config"

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
  const [autoSyncGoogle, setAutoSyncGoogle] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [navTab, setNavTab] = useState<NavTab>("chats")
  const [prefs, setPrefs] = useState<ChatPrefs>(() => loadChatPrefs(initialUser.id))
  const [infoGalleryMessageId, setInfoGalleryMessageId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<MessageToastItem[]>([])
  const [selectedWorkSpaceId, setSelectedWorkSpaceId] = useState<string | null>(null)
  const [newSpaceOpen, setNewSpaceOpen] = useState(false)
  const [newChannelSpaceId, setNewChannelSpaceId] = useState<string | null>(null)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  const statusOpenRef = useRef(statusOpen)
  statusOpenRef.current = statusOpen

  const openStatusTab = useCallback(() => {
    setNavTab("status")
    setStatusOpen(true)
  }, [])

  const pushToast = useCallback((item: Omit<MessageToastItem, "id">) => {
    const id = `toast-${crypto.randomUUID()}`
    setToasts((prev) => [...prev.slice(-2), { ...item, id }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Deep link: /chat?c=, ?tab=status|communities, ?space=, ?google_contacts=1
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const c = params.get("c")
    const tab = params.get("tab")
    const space = params.get("space")
    const googleContacts = params.get("google_contacts")
    const url = new URL(window.location.href)
    let changed = false

    if (c) {
      setActiveId(c)
      setNavTab("chats")
      url.searchParams.delete("c")
      changed = true
    }

    if (tab === "status") {
      setNavTab("status")
      setStatusOpen(true)
      url.searchParams.delete("tab")
      changed = true
    }

    if (tab === "communities") {
      setNavTab("communities")
      url.searchParams.delete("tab")
      changed = true
    }

    if (space && WORK_SPACES_UI_ENABLED) {
      setSelectedWorkSpaceId(space)
      setNavTab("communities")
      // Ensure Work mode so Spaces UI is visible
      const next = { ...prefsRef.current, activeSpace: "work" as ChatSpace }
      setPrefs(next)
      saveChatPrefs(initialUser.id, next)
      url.searchParams.delete("space")
      changed = true
    } else if (space) {
      url.searchParams.delete("space")
      changed = true
    }

    if (googleContacts === "1") {
      setNavTab("chats")
      setNewChatOpen(true)
      setAutoSyncGoogle(true)
      url.searchParams.delete("google_contacts")
      changed = true
    }

    if (changed) {
      const qs = url.searchParams.toString()
      window.history.replaceState({}, "", qs ? `${url.pathname}?${qs}` : url.pathname)
    }
  }, [initialUser.id])

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

  const personalUnread = useMemo(
    () => unreadInSpace(conversations, prefs, "personal"),
    [conversations, prefs],
  )
  const workUnread = useMemo(() => unreadInSpace(conversations, prefs, "work"), [conversations, prefs])

  const spaceConversations = useMemo(() => {
    if (!PERSONAL_WORK_UI_ENABLED) return conversations
    return filterConversationsBySpace(conversations, prefs, prefs.activeSpace)
  }, [conversations, prefs])

  const visibleConversations = useMemo(() => {
    if (!PERSONAL_WORK_UI_ENABLED || !WORK_SPACES_UI_ENABLED) return spaceConversations
    if (prefs.activeSpace !== "work" || !selectedWorkSpaceId) return spaceConversations
    return spaceConversations.filter((c) => c.work_space_id === selectedWorkSpaceId)
  }, [spaceConversations, prefs.activeSpace, selectedWorkSpaceId])

  const {
    spaces: workSpaces,
    loading: spacesLoading,
    error: spacesError,
    reload: reloadSpaces,
  } = useWorkSpaces(
    currentUser.id,
    WORK_SPACES_UI_ENABLED && prefs.activeSpace === "work",
  )

  const channelSpace = useMemo(
    () => workSpaces.find((s) => s.id === newChannelSpaceId) ?? null,
    [workSpaces, newChannelSpaceId],
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

  // Incoming message / status-reply sound + in-app toasts + browser / push notifications
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
        | {
            type?: string
            conversationId?: string
            title?: string
            body?: string
            openStatus?: boolean
          }
        | undefined
      if (!data?.type) return
      if (data.type === "open-status") {
        openStatusTab()
        return
      }
      if (data.type === "open-conversation" && data.conversationId) {
        setActiveId(data.conversationId)
        setNavTab("chats")
        return
      }
      if (data.type === "push-message") {
        if (data.openStatus) {
          if (statusOpenRef.current && document.visibilityState === "visible") return
          pushToast({
            title: data.title || "תגובה לסטטוס",
            body: data.body || "",
            openStatus: true,
          })
          return
        }
        if (!data.conversationId) return
        const isActiveChat =
          activeIdRef.current === data.conversationId && document.visibilityState === "visible"
        if (isActiveChat) return
          if (prefsRef.current.muted.includes(data.conversationId)) return
        const convMeta = conversationsRef.current.find((c) => c.id === data.conversationId)
        if (
          shouldSuppressSpaceNotification(
            prefsRef.current,
            data.conversationId,
            new Date(),
            convMeta?.work_space_id,
          )
        )
          return
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
          const convMeta = conversationsRef.current.find((c) => c.id === msg.conversation_id)
          if (
            shouldSuppressSpaceNotification(
              prefsRef.current,
              msg.conversation_id,
              new Date(),
              convMeta?.work_space_id,
            )
          )
            return

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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "status_replies" },
        (payload) => {
          void (async () => {
            const reply = payload.new as StatusReply
            if (!reply || reply.user_id === currentUser.id) return

            const { data: status } = await supabase
              .from("statuses")
              .select("user_id")
              .eq("id", reply.status_id)
              .maybeSingle()
            if (!status || status.user_id !== currentUser.id) return

            if (statusOpenRef.current && document.visibilityState === "visible") return

            const { data: sender } = await supabase
              .from("profiles")
              .select("display_name, email")
              .eq("id", reply.user_id)
              .maybeSingle()

            const title = sender?.display_name || sender?.email || "תגובה לסטטוס"
            const body = reply.content?.trim() || "הגיב לסטטוס שלך"

            playIncomingMessageSound()
            pushToast({ title, body, openStatus: true })
            void showIncomingMessageNotification({
              title,
              body,
              tag: `status-reply-${reply.status_id}`,
              url: "/chat?tab=status",
              onClick: openStatusTab,
            })
          })()
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
  }, [currentUser.id, pushToast, openStatusTab])

  const updatePrefs = useCallback(
    (next: ChatPrefs) => {
      setPrefs(next)
      saveChatPrefs(currentUser.id, next)
    },
    [currentUser.id],
  )

  const setActiveSpace = useCallback(
    (space: ChatSpace) => {
      const next = { ...prefsRef.current, activeSpace: space }
      setPrefs(next)
      saveChatPrefs(currentUser.id, next)
      setActiveId(null)
      setShowInfo(false)
      setNavTab("chats")
    },
    [currentUser.id],
  )

  const moveConversationToSpace = useCallback(
    (conversationId: string, space: ChatSpace) => {
      const next = setConversationSpace(prefsRef.current, conversationId, space)
      // Follow the chat into its new inbox so the user isn't dropped on an empty pane
      next.activeSpace = space
      updatePrefs(next)
      setActiveId(conversationId)
      setNavTab("chats")
    },
    [updatePrefs],
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
      if (document.visibilityState !== "visible") return
      try {
        const supabase = createClient()
        supabase
          .from("profiles")
          .update({ last_seen: new Date().toISOString() })
          .eq("id", currentUser.id)
          .then(({ error }) => {
            if (error) console.error("last_seen bump failed", error.message)
          })
      } catch {
        // ignore
      }
    }
    const id = window.setInterval(bump, 60_000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump()
    }
    document.addEventListener("visibilitychange", onVisibility)
    bump()
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [currentUser.id, currentUser.email, currentUser.display_name])

  const selectConversation = useCallback((conv: Conversation) => {
    setActiveId(conv.id)
    setShowInfo(false)
    setNavTab("chats")
    if (conv.work_space_id) {
      setSelectedWorkSpaceId(conv.work_space_id)
    }
  }, [])

  const openCreated = useCallback(
    async (conversationId: string) => {
      setNewChatOpen(false)
      setNewGroupOpen(false)
      // Tag new chats into the active space (personal = default, no list entry needed)
      if (prefsRef.current.activeSpace === "work") {
        updatePrefs(setConversationSpace(prefsRef.current, conversationId, "work"))
      }
      await reload()
      setActiveId(conversationId)
      setShowInfo(false)
      setNavTab("chats")
    },
    [reload, updatePrefs],
  )

  const openSpaceChannel = useCallback(
    async (channelId: string, spaceId: string) => {
      updatePrefs(setConversationSpace(prefsRef.current, channelId, "work"))
      await reload()
      void reloadSpaces()
      setSelectedWorkSpaceId(spaceId)
      setActiveId(channelId)
      setShowInfo(false)
      setNavTab("chats")
    },
    [reload, reloadSpaces, updatePrefs],
  )

  const handleStartChatByEmail = useCallback(
    async (email: string) => {
      const result = await startChatOrInviteByEmail(currentUser.id, email)
      if (result.status === "invited") {
        try {
          await navigator.clipboard.writeText(result.inviteUrl)
        } catch {
          // ignore clipboard failures
        }
        window.alert(
          result.emailSent
            ? `נשלחה הזמנה אל ${result.email}. קישור ההזמנה הועתק — אפשר גם להדביק בגוגל צ'אט.`
            : `נוצרה הזמנה עבור ${result.email}. קישור ההזמנה הועתק — שלח אותו במייל או בגוגל צ'אט.`,
        )
        return
      }
      const conversationId = result.conversationId
      if (prefsRef.current.activeSpace === "work") {
        updatePrefs(setConversationSpace(prefsRef.current, conversationId, "work"))
      }
      await reload()
      setActiveId(conversationId)
      setShowInfo(false)
      setNavTab("chats")
    },
    [currentUser.id, reload, updatePrefs],
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
    <div className="flex h-svh w-svw max-w-[100vw] overflow-hidden bg-[var(--wa-panel)]">
      <div className="flex h-full min-w-0 w-full flex-1 overflow-hidden">
        <NavRail
          active={navTab === "settings" ? "settings" : navTab === "status" ? "status" : navTab}
          currentUser={currentUser}
          unreadTotal={unreadTotal}
          workMode={WORK_SPACES_UI_ENABLED && prefs.activeSpace === "work"}
          onChange={handleNavChange}
          onOpenProfile={() => setProfileOpen(true)}
        />

        {/* Chat list pane */}
        <aside
          className={`flex min-w-0 flex-col border-l border-[var(--wa-border)] bg-[var(--wa-panel)] ${
            showChatPane ? "hidden md:flex md:w-[min(30%,420px)] md:min-w-[340px] md:max-w-[420px]" : "flex w-full md:w-[min(30%,420px)] md:min-w-[340px] md:max-w-[420px]"
          }`}
        >
          {navTab === "calls" ? (
            <CallsPanel conversations={conversations} currentUser={currentUser} onCall={handleStartCall} />
          ) : navTab === "communities" ? (
            WORK_SPACES_UI_ENABLED && prefs.activeSpace === "work" ? (
              <SpacesPanel
                spaces={workSpaces}
                conversations={conversations}
                currentUser={currentUser}
                selectedSpaceId={selectedWorkSpaceId}
                loading={spacesLoading}
                error={spacesError}
                onSelectSpace={setSelectedWorkSpaceId}
                onSelectChannel={selectConversation}
                onCreateSpace={() => setNewSpaceOpen(true)}
                onCreateChannel={(id) => setNewChannelSpaceId(id)}
                onSpacesChanged={() => void reloadSpaces()}
              />
            ) : (
              <CommunitiesPanel
                conversations={spaceConversations}
                currentUser={currentUser}
                onSelect={selectConversation}
              />
            )
          ) : (
            <>
              <SidebarHeader
                currentUserId={currentUser.id}
                space={PERSONAL_WORK_UI_ENABLED ? prefs.activeSpace : "personal"}
                onNewChat={() => setNewChatOpen(true)}
                onNewGroup={() => setNewGroupOpen(true)}
                onOpenProfile={() => setProfileOpen(true)}
                onLogout={handleLogout}
              />
              {PERSONAL_WORK_UI_ENABLED && (
                <SpaceSwitcher
                  active={prefs.activeSpace}
                  personalUnread={personalUnread}
                  workUnread={workUnread}
                  onChange={setActiveSpace}
                />
              )}
              {WORK_SPACES_UI_ENABLED && prefs.activeSpace === "work" && (
                <SpaceFilterChips
                  spaces={workSpaces}
                  selectedSpaceId={selectedWorkSpaceId}
                  onSelect={setSelectedWorkSpaceId}
                  onCreateSpace={() => setNewSpaceOpen(true)}
                />
              )}
              <ChatList
                conversations={visibleConversations}
                loading={loading}
                currentUser={currentUser}
                activeId={activeId}
                prefs={prefs}
                activeSpace={prefs.activeSpace}
                onSelect={selectConversation}
                onToggleArchive={(id) => updatePrefs(toggleArchived(prefs, id))}
                onToggleFavorite={(id) => updatePrefs(toggleFavorite(prefs, id))}
                onTogglePinned={(id) => updatePrefs(togglePinned(prefs, id))}
                onMoveToSpace={PERSONAL_WORK_UI_ENABLED ? moveConversationToSpace : undefined}
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
              {WORK_SPACES_UI_ENABLED && prefs.activeSpace === "work" ? (
                <SpacesPanel
                  spaces={workSpaces}
                  conversations={conversations}
                  currentUser={currentUser}
                  selectedSpaceId={selectedWorkSpaceId}
                  loading={spacesLoading}
                  error={spacesError}
                  onSelectSpace={setSelectedWorkSpaceId}
                  onSelectChannel={selectConversation}
                  onCreateSpace={() => setNewSpaceOpen(true)}
                  onCreateChannel={(id) => setNewChannelSpaceId(id)}
                  onSpacesChanged={() => void reloadSpaces()}
                />
              ) : (
                <CommunitiesPanel
                  conversations={spaceConversations}
                  currentUser={currentUser}
                  onSelect={selectConversation}
                />
              )}
            </div>
          ) : navTab === "calls" ? (
            <div className="flex h-full min-w-0 flex-1 flex-col">
              <EmptyState title="שיחות" subtitle="בחר שיחה מהרשימה או התחל שיחה מצ'אט." />
            </div>
          ) : activeConversation &&
            (!PERSONAL_WORK_UI_ENABLED ||
              filterConversationsBySpace([activeConversation], prefs, prefs.activeSpace).length >
                0) ? (
            <ChatPaneBoundary onClose={() => setActiveId(null)}>
            <div className="flex h-full min-w-0 flex-1">
              <div className={`min-h-0 min-w-0 flex-1 ${showInfo ? "hidden lg:block" : "block"}`}>
                <ConversationView
                  key={activeConversation.id}
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
                  onMoveToSpace={
                    PERSONAL_WORK_UI_ENABLED
                      ? (space) => moveConversationToSpace(activeConversation.id, space)
                      : undefined
                  }
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
                  onStartChatByEmail={handleStartChatByEmail}
                />
              </div>
              {showInfo && (
                <ConversationInfoBoundary onClose={() => setShowInfo(false)}>
                  <ConversationInfo
                    conversation={activeConversation}
                    currentUser={currentUser}
                    onClose={() => setShowInfo(false)}
                    onToggleArchive={() => updatePrefs(toggleArchived(prefs, activeConversation.id))}
                    onToggleFavorite={() => updatePrefs(toggleFavorite(prefs, activeConversation.id))}
                    onToggleMute={() => updatePrefs(toggleMuted(prefs, activeConversation.id))}
                    onTogglePinned={() => updatePrefs(togglePinned(prefs, activeConversation.id))}
                    onMoveToSpace={
                      PERSONAL_WORK_UI_ENABLED
                        ? (space) => moveConversationToSpace(activeConversation.id, space)
                        : undefined
                    }
                    isArchived={prefs.archived.includes(activeConversation.id)}
                    isFavorite={prefs.favorites.includes(activeConversation.id)}
                    isMuted={prefs.muted.includes(activeConversation.id)}
                    isPinned={prefs.pinned.includes(activeConversation.id)}
                    conversationSpace={
                      prefs.workConversations.includes(activeConversation.id) ? "work" : "personal"
                    }
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
                </ConversationInfoBoundary>
              )}
            </div>
            </ChatPaneBoundary>
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
        onClose={() => {
          setNewChatOpen(false)
          setAutoSyncGoogle(false)
        }}
        onCreated={openCreated}
        onNewGroup={() => {
          setNewChatOpen(false)
          setAutoSyncGoogle(false)
          setNewGroupOpen(true)
        }}
        autoSyncGoogle={autoSyncGoogle}
        onAutoSyncGoogleConsumed={() => setAutoSyncGoogle(false)}
      />
      <NewGroupDialog
        open={newGroupOpen}
        currentUserId={currentUser.id}
        onClose={() => setNewGroupOpen(false)}
        onCreated={openCreated}
      />
      {WORK_SPACES_UI_ENABLED && (
        <>
          <NewSpaceDialog
            open={newSpaceOpen}
            currentUserId={currentUser.id}
            onClose={() => setNewSpaceOpen(false)}
            onCreated={({ spaceId, channelId }) => {
              void openSpaceChannel(channelId, spaceId)
            }}
          />
          {channelSpace && (
            <NewChannelDialog
              open={Boolean(newChannelSpaceId)}
              currentUserId={currentUser.id}
              spaceId={channelSpace.id}
              spaceName={channelSpace.name}
              onClose={() => setNewChannelSpaceId(null)}
              onCreated={(channelId) => {
                void openSpaceChannel(channelId, channelSpace.id)
              }}
            />
          )}
        </>
      )}
      <ProfileDialog
        open={profileOpen}
        currentUser={currentUser}
        prefs={PERSONAL_WORK_UI_ENABLED ? prefs : undefined}
        onPrefsChange={PERSONAL_WORK_UI_ENABLED ? updatePrefs : undefined}
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
        onOpen={(toast) => {
          if (toast.openStatus) {
            openStatusTab()
            return
          }
          if (toast.conversationId) {
            const space: ChatSpace = prefsRef.current.workConversations.includes(toast.conversationId)
              ? "work"
              : "personal"
            if (prefsRef.current.activeSpace !== space) {
              const next: ChatPrefs = { ...prefsRef.current, activeSpace: space }
              setPrefs(next)
              saveChatPrefs(currentUser.id, next)
            }
            setActiveId(toast.conversationId)
            setNavTab("chats")
          }
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
          onDismissError={() => setCallError(null)}
        />
      )}
    </div>
  )
}
