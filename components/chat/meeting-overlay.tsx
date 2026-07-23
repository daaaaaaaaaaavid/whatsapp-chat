"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  useTracks,
  useLocalParticipant,
  useRoomContext,
  useSpeakingParticipants,
  useIsSpeaking,
  useIsMuted,
} from "@livekit/components-react"
import { RoomEvent, Track } from "livekit-client"
import type { TrackReference, TrackReferenceOrPlaceholder } from "@livekit/components-react"
import "@livekit/components-styles"
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Copy,
  Check,
  Users,
  X,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Hand,
  ArrowLeftRight,
  SmilePlus,
} from "lucide-react"
import type { ActiveMeeting } from "@/lib/use-livekit-meeting"
import {
  MEETING_REACTION_EMOJIS,
  encodeMeetingData,
  parseMeetingData,
  hashStr,
  participantDisplayName,
  initialsFromName,
  type FloatingMeetingReaction,
} from "@/lib/meeting-data"

type Props = {
  meeting: ActiveMeeting
  conversationLabel: string
  onLeave: () => void
  onEndForAll: () => void
  /** Compact strip when Watch Together is also open */
  mediaOnly?: boolean
}

type MeetingUiCtx = {
  raisedHands: ReadonlySet<string>
  floatingReactions: FloatingMeetingReaction[]
  handRaised: boolean
  sendReaction: (emoji: string) => void
  toggleHand: () => void
  speakingLabel: string | null
  participantCount: number
}

const MeetingUiContext = createContext<MeetingUiCtx | null>(null)

function useMeetingUi() {
  const ctx = useContext(MeetingUiContext)
  if (!ctx) throw new Error("useMeetingUi must be used inside MeetingUiProvider")
  return ctx
}

function trackIdentity(t: TrackReferenceOrPlaceholder): string {
  return t.participant.identity
}

function MeetingUiProvider({ children }: { children: ReactNode }) {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const speakers = useSpeakingParticipants()
  const [raisedHands, setRaisedHands] = useState<Set<string>>(() => new Set())
  const [floatingReactions, setFloatingReactions] = useState<FloatingMeetingReaction[]>([])
  const [handRaised, setHandRaised] = useState(false)

  const speakingLabel = useMemo(() => {
    const remote = speakers.find((p) => p.identity !== localParticipant.identity)
    const p = remote ?? speakers[0]
    if (!p) return null
    return participantDisplayName(p.name, p.identity)
  }, [speakers, localParticipant.identity])

  const participantCount = room.remoteParticipants.size + 1

  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: { identity: string; name?: string }) => {
      const msg = parseMeetingData(payload)
      if (!msg) return
      if (msg.type === "reaction") {
        setFloatingReactions((prev) => [
          ...prev,
          {
            id: msg.id,
            emoji: msg.emoji,
            byName: msg.byName || participantDisplayName(participant?.name, msg.by),
            createdAt: Date.now(),
          },
        ])
      } else if (msg.type === "hand") {
        setRaisedHands((prev) => {
          const next = new Set(prev)
          if (msg.raised) next.add(msg.by)
          else next.delete(msg.by)
          return next
        })
        if (msg.by === localParticipant.identity) setHandRaised(msg.raised)
      }
    }

    const onLeave = (p: { identity: string }) => {
      setRaisedHands((prev) => {
        if (!prev.has(p.identity)) return prev
        const next = new Set(prev)
        next.delete(p.identity)
        return next
      })
    }

    room.on(RoomEvent.DataReceived, onData)
    room.on(RoomEvent.ParticipantDisconnected, onLeave)
    return () => {
      room.off(RoomEvent.DataReceived, onData)
      room.off(RoomEvent.ParticipantDisconnected, onLeave)
    }
  }, [room, localParticipant.identity])

  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 2800
      setFloatingReactions((prev) => {
        const next = prev.filter((r) => r.createdAt > cutoff)
        return next.length === prev.length ? prev : next
      })
    }, 400)
    return () => window.clearInterval(id)
  }, [])

  const sendReaction = useCallback(
    (emoji: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const byName = participantDisplayName(localParticipant.name, localParticipant.identity)
      const msg = {
        type: "reaction" as const,
        id,
        emoji,
        by: localParticipant.identity,
        byName,
      }
      setFloatingReactions((prev) => [
        ...prev,
        { id, emoji, byName, createdAt: Date.now() },
      ])
      void localParticipant.publishData(
        new Uint8Array(encodeMeetingData(msg)),
        { reliable: true },
      )
    },
    [localParticipant],
  )

  const toggleHand = useCallback(() => {
    const next = !handRaised
    setHandRaised(next)
    setRaisedHands((prev) => {
      const s = new Set(prev)
      if (next) s.add(localParticipant.identity)
      else s.delete(localParticipant.identity)
      return s
    })
    void localParticipant.publishData(
      new Uint8Array(
        encodeMeetingData({
          type: "hand",
          raised: next,
          by: localParticipant.identity,
        }),
      ),
      { reliable: true },
    )
  }, [handRaised, localParticipant])

  const value = useMemo<MeetingUiCtx>(
    () => ({
      raisedHands,
      floatingReactions,
      handRaised,
      sendReaction,
      toggleHand,
      speakingLabel,
      participantCount,
    }),
    [
      raisedHands,
      floatingReactions,
      handRaised,
      sendReaction,
      toggleHand,
      speakingLabel,
      participantCount,
    ],
  )

  return <MeetingUiContext.Provider value={value}>{children}</MeetingUiContext.Provider>
}

function MeetingReactionsOverlay() {
  const { floatingReactions } = useMeetingUi()
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {floatingReactions.map((r) => (
        <span
          key={r.id}
          className="meeting-float absolute text-3xl drop-shadow-lg sm:text-4xl"
          style={{
            left: `${10 + (hashStr(r.id) % 78)}%`,
            bottom: "12%",
          }}
          title={r.byName}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  )
}

function MeetingTile({
  trackRef,
  large,
  handRaised,
  onSelect,
  showSwapHint,
}: {
  trackRef: TrackReferenceOrPlaceholder
  large?: boolean
  handRaised?: boolean
  onSelect?: () => void
  showSwapHint?: boolean
}) {
  const participant = trackRef.participant
  const isSpeaking = useIsSpeaking(participant)
  const camMuted = useIsMuted(trackRef)
  const micMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  })
  const isLocal = participant.isLocal
  const name = participantDisplayName(participant.name, participant.identity)
  const hasVideo = isTrackReference(trackRef) && !camMuted && Boolean(trackRef.publication)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`meeting-tile group relative h-full w-full overflow-hidden rounded-xl bg-[#1a242b] text-start transition ${
        isSpeaking ? "meeting-speaking ring-2 ring-[#25d366] ring-offset-1 ring-offset-[#0b141a]" : "ring-1 ring-white/10"
      } ${onSelect ? "cursor-pointer" : "cursor-default"}`}
      aria-label={name}
    >
      {hasVideo && isTrackReference(trackRef) ? (
        <VideoTrack
          trackRef={trackRef}
          className={`h-full w-full object-cover ${isLocal ? "scale-x-[-1]" : ""}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1e2a32] to-[#0f171c]">
          <span
            className={`flex items-center justify-center rounded-full bg-[#00a884]/25 font-semibold text-[#25d366] ${
              large ? "h-24 w-24 text-3xl" : "h-12 w-12 text-sm"
            }`}
          >
            {initialsFromName(name)}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-2 pb-2 pt-8">
        <div className="flex items-center gap-1.5">
          {micMuted ? (
            <MicOff className="h-3.5 w-3.5 shrink-0 text-red-400" />
          ) : isSpeaking ? (
            <Mic className="h-3.5 w-3.5 shrink-0 text-[#25d366]" />
          ) : null}
          <span className={`truncate font-medium text-white ${large ? "text-sm" : "text-[11px]"}`}>
            {isLocal ? `${name} (אתה)` : name}
          </span>
        </div>
      </div>

      {handRaised && (
        <span className="meeting-hand-badge absolute start-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-base shadow-lg">
          ✋
        </span>
      )}

      {showSwapHint && (
        <span className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
          <ArrowLeftRight className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  )
}

function SelfPiP({
  trackRef,
  handRaised,
  onSwap,
}: {
  trackRef: TrackReferenceOrPlaceholder
  handRaised?: boolean
  onSwap: () => void
}) {
  const [pos, setPos] = useState({ x: 16, y: 16 })
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
    moved: boolean
  } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-pip-action]")) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true
    setPos({
      x: Math.max(8, dragRef.current.origX + dx),
      y: Math.max(8, dragRef.current.origY - dy),
    })
  }

  const onPointerUp = () => {
    const wasDrag = dragRef.current?.moved
    dragRef.current = null
    if (!wasDrag) onSwap()
  }

  return (
    <div
      className="absolute z-30 h-36 w-28 touch-none overflow-hidden rounded-xl shadow-2xl shadow-black/50 ring-1 ring-white/20 sm:h-40 sm:w-32"
      style={{ left: pos.x, bottom: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <MeetingTile trackRef={trackRef} handRaised={handRaised} showSwapHint />
      <button
        type="button"
        data-pip-action
        onClick={(e) => {
          e.stopPropagation()
          onSwap()
        }}
        className="absolute end-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-[#00a884]"
        title="החלף עם החלון הגדול"
        aria-label="החלף תצוגה"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function AdaptiveGrid({
  tracks,
  raisedHands,
  onSelect,
}: {
  tracks: TrackReferenceOrPlaceholder[]
  raisedHands: ReadonlySet<string>
  onSelect: (identity: string) => void
}) {
  const n = tracks.length
  const cols =
    n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4

  return (
    <div
      className="grid h-full min-h-0 w-full gap-2"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "minmax(0, 1fr)",
      }}
    >
      {tracks.map((t) => (
        <MeetingTile
          key={`${trackIdentity(t)}-cam`}
          trackRef={t}
          handRaised={raisedHands.has(trackIdentity(t))}
          onSelect={() => onSelect(trackIdentity(t))}
          showSwapHint
        />
      ))}
    </div>
  )
}

function ScreenShareViewer({ trackRef }: { trackRef: TrackReference }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [floating, setFloating] = useState(false)
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  const enterFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen()
    } catch {
      // ignore
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).closest("[data-drag-handle]")) return
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    setPos({
      x: Math.max(8, e.clientX - dragRef.current.dx),
      y: Math.max(8, e.clientY - dragRef.current.dy),
    })
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const toolbar = (
    <div className="absolute end-2 top-2 z-10 flex gap-1.5">
      <button
        type="button"
        onClick={() => void enterFullscreen()}
        className="flex h-9 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs text-white backdrop-blur transition hover:bg-black/80"
        title={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        <span className="hidden sm:inline">{isFullscreen ? "צא" : "מסך מלא"}</span>
      </button>
      <button
        type="button"
        onClick={() => setFloating((v) => !v)}
        className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-xs text-white backdrop-blur transition ${
          floating ? "bg-[#00a884] hover:bg-[#06cf9c]" : "bg-black/60 hover:bg-black/80"
        }`}
        title={floating ? "סגור חלונית צפה" : "חלונית צפה"}
      >
        <PictureInPicture2 className="h-4 w-4" />
        <span className="hidden sm:inline">{floating ? "סגור חלונית" : "חלונית צפה"}</span>
      </button>
    </div>
  )

  const video = (
    <VideoTrack trackRef={trackRef} className="h-full w-full bg-black object-contain" />
  )

  return (
    <>
      {!floating && (
        <div
          ref={stageRef}
          className="relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-black"
        >
          {toolbar}
          {video}
        </div>
      )}

      {floating && (
        <>
          <div className="flex h-full min-h-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 text-sm text-white/50">
            שיתוף המסך בחלונית צפה
          </div>
          <div
            className="fixed z-[95] overflow-hidden rounded-xl border border-white/20 bg-[#0b141a] shadow-2xl"
            style={{
              left: pos.x,
              top: pos.y,
              width: "min(420px, 90vw)",
              height: "min(260px, 40vh)",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div
              data-drag-handle
              className="flex cursor-grab items-center justify-between gap-2 bg-black/50 px-2 py-1.5 active:cursor-grabbing"
            >
              <span className="truncate text-xs text-white/80">שיתוף מסך</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void enterFullscreen()}
                  className="rounded-full p-1.5 hover:bg-white/10"
                  aria-label="מסך מלא"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setFloating(false)}
                  className="rounded-full p-1.5 hover:bg-white/10"
                  aria-label="סגור חלונית"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div ref={stageRef} className="h-[calc(100%-32px)] w-full">
              {video}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function MeetingStage() {
  const { localParticipant } = useLocalParticipant()
  const speakers = useSpeakingParticipants()
  const { raisedHands } = useMeetingUi()
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [selfOnMain, setSelfOnMain] = useState(false)

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  const screenTrack = useMemo(() => {
    return tracks.find(
      (t): t is TrackReference =>
        t.source === Track.Source.ScreenShare && "publication" in t && Boolean(t.publication),
    )
  }, [tracks])

  const cameraTracks = useMemo(
    () => tracks.filter((t) => t.source === Track.Source.Camera),
    [tracks],
  )

  const localTrack = useMemo(
    () => cameraTracks.find((t) => t.participant.identity === localParticipant.identity),
    [cameraTracks, localParticipant.identity],
  )

  const remoteTracks = useMemo(
    () => cameraTracks.filter((t) => t.participant.identity !== localParticipant.identity),
    [cameraTracks, localParticipant.identity],
  )

  const activeSpeakerId = useMemo(() => {
    const remote = speakers.find((p) => p.identity !== localParticipant.identity)
    return remote?.identity ?? speakers[0]?.identity ?? null
  }, [speakers, localParticipant.identity])

  const focusId = useMemo(() => {
    if (selfOnMain) return localParticipant.identity
    if (pinnedId && cameraTracks.some((t) => t.participant.identity === pinnedId)) {
      return pinnedId
    }
    if (activeSpeakerId && cameraTracks.some((t) => t.participant.identity === activeSpeakerId)) {
      return activeSpeakerId
    }
    if (remoteTracks[0]) return remoteTracks[0].participant.identity
    return localParticipant.identity
  }, [
    selfOnMain,
    pinnedId,
    activeSpeakerId,
    cameraTracks,
    remoteTracks,
    localParticipant.identity,
  ])

  const focusTrack = useMemo(
    () => cameraTracks.find((t) => t.participant.identity === focusId) ?? localTrack,
    [cameraTracks, focusId, localTrack],
  )

  const stripTracks = useMemo(
    () => cameraTracks.filter((t) => t.participant.identity !== focusId),
    [cameraTracks, focusId],
  )

  const useEqualGrid =
    !screenTrack &&
    cameraTracks.length >= 5 &&
    !pinnedId &&
    !selfOnMain &&
    !activeSpeakerId

  const selectParticipant = useCallback(
    (identity: string) => {
      if (identity === localParticipant.identity) {
        setSelfOnMain((v) => !v)
        setPinnedId(null)
        return
      }
      if (selfOnMain) {
        setSelfOnMain(false)
        setPinnedId(identity)
        return
      }
      if (pinnedId === identity) {
        setPinnedId(null)
      } else {
        setPinnedId(identity)
      }
    },
    [localParticipant.identity, pinnedId, selfOnMain],
  )

  const swapSelf = useCallback(() => {
    setSelfOnMain((v) => !v)
    if (!selfOnMain) setPinnedId(null)
  }, [selfOnMain])

  if (screenTrack) {
    return (
      <div className="relative flex h-full min-h-0 flex-col gap-2">
        <div className="min-h-0 flex-1">
          <ScreenShareViewer trackRef={screenTrack} />
        </div>
        {cameraTracks.length > 0 && (
          <div className="flex h-28 shrink-0 gap-2 overflow-x-auto sm:h-32">
            {cameraTracks.map((t) => (
              <div key={`${trackIdentity(t)}-ss`} className="h-full w-36 shrink-0 sm:w-40">
                <MeetingTile
                  trackRef={t}
                  handRaised={raisedHands.has(trackIdentity(t))}
                  onSelect={() => selectParticipant(trackIdentity(t))}
                />
              </div>
            ))}
          </div>
        )}
        <MeetingReactionsOverlay />
      </div>
    )
  }

  if (useEqualGrid) {
    return (
      <div className="relative h-full min-h-0 w-full">
        <AdaptiveGrid
          tracks={cameraTracks}
          raisedHands={raisedHands}
          onSelect={selectParticipant}
        />
        <MeetingReactionsOverlay />
      </div>
    )
  }

  const showPip = Boolean(localTrack) && focusId !== localParticipant.identity
  const showFilmstrip = stripTracks.length > 0 && (remoteTracks.length >= 2 || selfOnMain)

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-2">
      <div className="relative min-h-0 flex-1">
        {focusTrack && (
          <MeetingTile
            trackRef={focusTrack}
            large
            handRaised={raisedHands.has(trackIdentity(focusTrack))}
            onSelect={
              focusId === localParticipant.identity
                ? swapSelf
                : () => selectParticipant(focusId)
            }
            showSwapHint={focusId === localParticipant.identity}
          />
        )}
        {showPip && localTrack && (
          <SelfPiP
            trackRef={localTrack}
            handRaised={raisedHands.has(localParticipant.identity)}
            onSwap={swapSelf}
          />
        )}
        <MeetingReactionsOverlay />
      </div>

      {showFilmstrip && (
        <div className="flex h-24 shrink-0 gap-2 overflow-x-auto sm:h-28">
          {stripTracks.map((t) => (
            <div key={`${trackIdentity(t)}-strip`} className="h-full w-32 shrink-0 sm:w-36">
              <MeetingTile
                trackRef={t}
                handRaised={raisedHands.has(trackIdentity(t))}
                onSelect={() => selectParticipant(trackIdentity(t))}
                showSwapHint
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MeetingControls({
  isHost,
  inviteUrl,
  onLeave,
  onEndForAll,
  compact,
}: {
  isHost: boolean
  inviteUrl: string
  onLeave: () => void
  onEndForAll: () => void
  compact?: boolean
}) {
  const { localParticipant } = useLocalParticipant()
  const { handRaised, toggleHand, sendReaction, participantCount } = useMeetingUi()
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [showReactions, setShowReactions] = useState(false)

  useEffect(() => {
    setMicOn(localParticipant.isMicrophoneEnabled)
    setCamOn(localParticipant.isCameraEnabled)
  }, [localParticipant.isMicrophoneEnabled, localParticipant.isCameraEnabled])

  const toggleMic = useCallback(async () => {
    const next = !micOn
    await localParticipant.setMicrophoneEnabled(next)
    setMicOn(next)
  }, [localParticipant, micOn])

  const toggleCam = useCallback(async () => {
    const next = !camOn
    await localParticipant.setCameraEnabled(next)
    setCamOn(next)
  }, [localParticipant, camOn])

  const toggleShare = useCallback(async () => {
    try {
      if (sharing) {
        await localParticipant.setScreenShareEnabled(false)
        setSharing(false)
      } else {
        await localParticipant.setScreenShareEnabled(true)
        setSharing(true)
      }
    } catch {
      setSharing(false)
    }
  }, [localParticipant, sharing])

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [inviteUrl])

  return (
    <div
      className={`relative flex shrink-0 flex-wrap items-center justify-center gap-2 ${
        compact ? "px-2 py-2" : "gap-2.5 px-4 py-4"
      }`}
    >
      {!compact && (
        <span className="me-auto flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/70">
          <Users className="h-3.5 w-3.5" />
          {participantCount}
        </span>
      )}

      <button
        type="button"
        onClick={() => void toggleMic()}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          micOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-600"
        }`}
        aria-label={micOn ? "השתק" : "בטל השתקה"}
        title={micOn ? "השתק" : "בטל השתקה"}
      >
        {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={() => void toggleCam()}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          camOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-600"
        }`}
        aria-label={camOn ? "כבה מצלמה" : "הפעל מצלמה"}
        title={camOn ? "כבה מצלמה" : "הפעל מצלמה"}
      >
        {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={() => void toggleShare()}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          sharing ? "bg-[#00a884] hover:bg-[#06cf9c]" : "bg-white/15 hover:bg-white/25"
        }`}
        aria-label="שיתוף מסך"
        title="שיתוף מסך"
      >
        <MonitorUp className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={toggleHand}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          handRaised
            ? "bg-amber-400 text-[#0b141a] hover:bg-amber-300"
            : "bg-white/15 hover:bg-white/25"
        }`}
        aria-label={handRaised ? "הורד יד" : "הרם יד"}
        title={handRaised ? "הורד יד" : "הרם יד"}
      >
        <Hand className="h-5 w-5" />
      </button>

      <div className="relative">
        <button
          type="button"
          onClick={() => setShowReactions((v) => !v)}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
            showReactions ? "bg-[#00a884] hover:bg-[#06cf9c]" : "bg-white/15 hover:bg-white/25"
          }`}
          aria-label="ריאקציות"
          title="ריאקציות"
        >
          <SmilePlus className="h-5 w-5" />
        </button>
        {showReactions && (
          <div className="absolute bottom-14 start-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-[#1a242b]/95 p-2 shadow-xl backdrop-blur">
            {MEETING_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  sendReaction(emoji)
                  setShowReactions(false)
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:scale-125 hover:bg-white/10"
                aria-label={`תגובה ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void copyLink()}
        className="flex h-12 items-center gap-2 rounded-full bg-white/15 px-4 text-sm transition hover:bg-white/25"
        aria-label="העתק קישור הזמנה"
        title="העתק קישור הזמנה"
      >
        {copied ? <Check className="h-4 w-4 text-[#25d366]" /> : <Copy className="h-4 w-4" />}
        {!compact && <span>{copied ? "הועתק" : "הזמנה"}</span>}
      </button>
      <button
        type="button"
        onClick={onLeave}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 transition hover:bg-red-700"
        aria-label="יציאה"
        title="יציאה מהפגישה"
      >
        <PhoneOff className="h-5 w-5" />
      </button>
      {isHost && (
        <button
          type="button"
          onClick={onEndForAll}
          className="flex h-12 items-center rounded-full bg-red-800 px-4 text-sm transition hover:bg-red-900"
          title="סיים את הפגישה לכולם"
        >
          סיים לכולם
        </button>
      )}
    </div>
  )
}

function MeetingHeader({
  conversationLabel,
  onLeave,
}: {
  conversationLabel: string
  onLeave: () => void
}) {
  const { speakingLabel, participantCount } = useMeetingUi()

  return (
    <header className="flex shrink-0 items-center gap-3 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25d366]/15">
        <Users className="h-5 w-5 text-[#25d366]" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-medium">פגישה · {conversationLabel}</h2>
        <p className="truncate text-xs text-white/60">
          {participantCount} משתתפים
          {speakingLabel ? (
            <>
              {" · "}
              <span className="text-[#25d366]">{speakingLabel} מדבר…</span>
            </>
          ) : (
            " · וידאו · קול · שיתוף מסך"
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onLeave}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
        aria-label="יציאה"
        title="יציאה"
      >
        <X className="h-5 w-5" />
      </button>
    </header>
  )
}

export function MeetingOverlay({
  meeting,
  conversationLabel,
  onLeave,
  onEndForAll,
  mediaOnly = false,
}: Props) {
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/${meeting.inviteToken}`
      : `/invite/${meeting.inviteToken}`

  if (mediaOnly) {
    return (
      <div className="pointer-events-auto fixed bottom-0 start-0 end-0 z-[75] border-t border-white/10 bg-[#0b141a]/95 text-white backdrop-blur-sm">
        <LiveKitRoom
          token={meeting.token}
          serverUrl={meeting.serverUrl}
          connect
          audio
          video={false}
          data-lk-theme="default"
          className="w-full"
          onDisconnected={onLeave}
        >
          <MeetingUiProvider>
            <RoomAudioRenderer />
            <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-white/70">
              <span className="truncate">פגישה · {conversationLabel}</span>
              <button
                type="button"
                onClick={onLeave}
                className="rounded-full p-1 hover:bg-white/10"
                aria-label="סגור"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <MeetingControls
              isHost={meeting.isHost}
              inviteUrl={inviteUrl}
              onLeave={onLeave}
              onEndForAll={onEndForAll}
              compact
            />
          </MeetingUiProvider>
        </LiveKitRoom>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b141a] text-white">
      <LiveKitRoom
        token={meeting.token}
        serverUrl={meeting.serverUrl}
        connect
        audio
        video
        data-lk-theme="default"
        className="flex h-full min-h-0 flex-col"
        onDisconnected={onLeave}
      >
        <MeetingUiProvider>
          <MeetingHeader conversationLabel={conversationLabel} onLeave={onLeave} />

          <div className="relative min-h-0 flex-1 px-2 pb-1">
            <MeetingStage />
          </div>

          <RoomAudioRenderer />
          <MeetingControls
            isHost={meeting.isHost}
            inviteUrl={inviteUrl}
            onLeave={onLeave}
            onEndForAll={onEndForAll}
          />
        </MeetingUiProvider>
      </LiveKitRoom>
    </div>
  )
}
