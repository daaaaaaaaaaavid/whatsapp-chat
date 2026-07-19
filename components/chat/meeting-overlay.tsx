"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react"
import { Track } from "livekit-client"
import type { TrackReference } from "@livekit/components-react"
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
} from "lucide-react"
import type { ActiveMeeting } from "@/lib/use-livekit-meeting"

type Props = {
  meeting: ActiveMeeting
  conversationLabel: string
  onLeave: () => void
  onEndForAll: () => void
  /** Compact strip when Watch Together is also open */
  mediaOnly?: boolean
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
  const room = useRoomContext()
  const [copied, setCopied] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [sharing, setSharing] = useState(false)

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

  const participantCount = room.remoteParticipants.size + 1

  return (
    <div
      className={`flex shrink-0 flex-wrap items-center justify-center gap-2 ${
        compact ? "px-2 py-2" : "gap-3 px-4 py-4"
      }`}
    >
      {!compact && (
        <span className="me-auto flex items-center gap-1.5 text-xs text-white/70">
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
      >
        <MonitorUp className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => void copyLink()}
        className="flex h-12 items-center gap-2 rounded-full bg-white/15 px-4 text-sm transition hover:bg-white/25"
        aria-label="העתק קישור הזמנה"
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
        >
          סיים לכולם
        </button>
      )}
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
    <VideoTrack
      trackRef={trackRef}
      className="h-full w-full bg-black object-contain"
    />
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
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

  const screenTrack = useMemo(() => {
    const hit = tracks.find(
      (t): t is TrackReference =>
        t.source === Track.Source.ScreenShare && "publication" in t && Boolean(t.publication),
    )
    return hit
  }, [tracks])
  const cameraTracks = useMemo(
    () => tracks.filter((t) => t.source === Track.Source.Camera),
    [tracks],
  )

  if (screenTrack) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="min-h-0 flex-1">
          <ScreenShareViewer trackRef={screenTrack} />
        </div>
        {cameraTracks.length > 0 && (
          <div className="h-28 shrink-0 sm:h-32">
            <GridLayout tracks={cameraTracks} className="h-full w-full">
              <ParticipantTile />
            </GridLayout>
          </div>
        )}
      </div>
    )
  }

  return (
    <GridLayout tracks={tracks} className="h-full min-h-0 w-full">
      <ParticipantTile />
    </GridLayout>
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
        <header className="flex shrink-0 items-center gap-3 px-4 py-3">
          <Users className="h-5 w-5 shrink-0 text-[#25d366]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">פגישה · {conversationLabel}</h2>
            <p className="truncate text-xs text-white/60">וידאו · קול · שיתוף מסך</p>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20"
            aria-label="יציאה"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 px-2 pb-1">
          <MeetingStage />
        </div>

        <RoomAudioRenderer />
        <MeetingControls
          isHost={meeting.isHost}
          inviteUrl={inviteUrl}
          onLeave={onLeave}
          onEndForAll={onEndForAll}
        />
      </LiveKitRoom>
    </div>
  )
}
