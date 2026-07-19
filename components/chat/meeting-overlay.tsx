"use client"

import { useCallback, useState } from "react"
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react"
import { Track } from "livekit-client"
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

function MeetingStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )

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

        <div className="min-h-0 flex-1 px-2">
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
