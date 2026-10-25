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
import { createClient } from "@/lib/supabase/client"
import { connectGoogleDrive } from "@/lib/auth-google"
import {
  completeGoogleDriveConnectFromSession,
  copyDriveMedia,
  disconnectGoogleDrive,
  downloadDriveFileBlob,
  fetchDriveAccessSession,
  fetchDriveStatus,
  isDriveNotConnectedError,
} from "@/lib/google-drive-client"
import {
  driveCopyKey,
  isDriveMediaUrl,
  parseDriveMediaRef,
} from "@/lib/google-drive"
import type { Profile } from "@/lib/types"
import { DriveConnectDialog } from "./drive-connect-dialog"

type DriveCopyRow = {
  source_owner_id: string
  source_file_id: string
  dest_file_id: string
}

type DriveContextValue = {
  ready: boolean
  connected: boolean
  configured: boolean
  googleEmail: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  requestConnect: () => void
  refresh: () => Promise<void>
  hasCopy: (fileUrl: string | null | undefined) => boolean
  canView: (fileUrl: string | null | undefined) => boolean
  viewFileId: (fileUrl: string | null | undefined) => string | null
  markCopied: (ownerId: string, sourceFileId: string, destFileId: string) => void
  copyToMyDrive: (opts: { kind: "message" | "status"; id: string; fileUrl: string }) => Promise<string>
  getAccessToken: () => Promise<string>
  downloadBlob: (fileId: string) => Promise<Blob>
}

const DriveContext = createContext<DriveContextValue | null>(null)

export function useDrive() {
  const ctx = useContext(DriveContext)
  if (!ctx) throw new Error("useDrive must be used inside DriveProvider")
  return ctx
}

export function useDriveOptional() {
  return useContext(DriveContext)
}

type Props = {
  currentUser: Profile
  onUserUpdated: (profile: Profile) => void
  onToast?: (item: { title: string; body: string }) => void
  children: ReactNode
}

export function DriveProvider({ currentUser, onUserUpdated, onToast, children }: Props) {
  const [ready, setReady] = useState(false)
  const [connected, setConnected] = useState(Boolean(currentUser.google_drive_connected_at))
  const [configured, setConfigured] = useState(true)
  const [googleEmail, setGoogleEmail] = useState<string | null>(null)
  const [copies, setCopies] = useState<Map<string, string>>(() => new Map())
  const [connecting, setConnecting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const tokenRef = useRef<{ token: string; expiresAt: number } | null>(null)
  const userId = currentUser.id

  const loadCopies = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("drive_media_copies")
      .select("source_owner_id, source_file_id, dest_file_id")
      .eq("user_id", userId)
    if (error) return
    const next = new Map<string, string>()
    for (const row of (data ?? []) as DriveCopyRow[]) {
      next.set(driveCopyKey(row.source_owner_id, row.source_file_id), row.dest_file_id)
    }
    setCopies(next)
  }, [userId])

  const refresh = useCallback(async () => {
    try {
      const status = await fetchDriveStatus()
      setConnected(status.connected)
      setConfigured(status.configured)
      setGoogleEmail(status.googleEmail)
      onUserUpdated({
        ...currentUser,
        google_drive_connected_at: status.connected
          ? currentUser.google_drive_connected_at ?? new Date().toISOString()
          : null,
      })
    } catch {
      // keep last known
    } finally {
      setReady(true)
    }
    await loadCopies()
  }, [currentUser, loadCopies, onUserUpdated])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("google_drive") !== "1") return
    const url = new URL(window.location.href)
    url.searchParams.delete("google_drive")
    const qs = url.searchParams.toString()
    window.history.replaceState({}, "", qs ? `${url.pathname}?${qs}` : url.pathname)

    let cancelled = false
    setConnecting(true)
    void completeGoogleDriveConnectFromSession()
      .then(async (result) => {
        if (cancelled) return
        setConnected(true)
        setGoogleEmail(result.googleEmail)
        onUserUpdated({
          ...currentUser,
          google_drive_connected_at: new Date().toISOString(),
        })
        onToast?.({
          title: "גוגל דרייב מחובר",
          body: result.googleEmail
            ? `הקבצים יישמרו בחשבון ${result.googleEmail}`
            : "התמונות והסרטונים יישמרו אצלך בדרייב",
        })
        await loadCopies()
      })
      .catch((err) => {
        if (cancelled) return
        onToast?.({
          title: "חיבור דרייב נכשל",
          body: err instanceof Error ? err.message : "נסה שוב מהפרופיל",
        })
      })
      .finally(() => {
        if (!cancelled) setConnecting(false)
      })

    return () => {
      cancelled = true
    }
    // one-shot after redirect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      await connectGoogleDrive()
    } catch (err) {
      setConnecting(false)
      onToast?.({
        title: "לא ניתן לפתוח את גוגל",
        body: err instanceof Error ? err.message : "נסה שוב",
      })
    }
  }, [onToast])

  const disconnect = useCallback(async () => {
    await disconnectGoogleDrive()
    tokenRef.current = null
    setConnected(false)
    setGoogleEmail(null)
    onUserUpdated({ ...currentUser, google_drive_connected_at: null })
  }, [currentUser, onUserUpdated])

  const hasCopy = useCallback(
    (fileUrl: string | null | undefined) => {
      const ref = parseDriveMediaRef(fileUrl)
      if (!ref) return false
      return copies.has(driveCopyKey(ref.ownerId, ref.fileId))
    },
    [copies],
  )

  const viewFileId = useCallback(
    (fileUrl: string | null | undefined) => {
      const ref = parseDriveMediaRef(fileUrl)
      if (!ref) return null
      if (ref.ownerId === userId) return ref.fileId
      return copies.get(driveCopyKey(ref.ownerId, ref.fileId)) ?? null
    },
    [copies, userId],
  )

  const canView = useCallback(
    (fileUrl: string | null | undefined) => {
      if (!isDriveMediaUrl(fileUrl)) return true
      return Boolean(viewFileId(fileUrl))
    },
    [viewFileId],
  )

  const markCopied = useCallback((ownerId: string, sourceFileId: string, destFileId: string) => {
    setCopies((prev) => {
      const next = new Map(prev)
      next.set(driveCopyKey(ownerId, sourceFileId), destFileId)
      return next
    })
  }, [])

  const getAccessToken = useCallback(async () => {
    const cached = tokenRef.current
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
    const session = await fetchDriveAccessSession()
    tokenRef.current = { token: session.accessToken, expiresAt: session.expiresAt }
    setConnected(true)
    setGoogleEmail(session.googleEmail)
    return session.accessToken
  }, [])

  const downloadBlob = useCallback(
    async (fileId: string) => {
      const token = await getAccessToken()
      return downloadDriveFileBlob(token, fileId)
    },
    [getAccessToken],
  )

  const copyToMyDrive = useCallback(
    async (opts: { kind: "message" | "status"; id: string; fileUrl: string }) => {
      const ref = parseDriveMediaRef(opts.fileUrl)
      if (!ref) throw new Error("הקובץ הזה לא שמור בדרייב")
      if (!connected) {
        setDialogOpen(true)
        throw new DriveConnectNeededError()
      }
      try {
        const result = await copyDriveMedia({ kind: opts.kind, id: opts.id })
        markCopied(ref.ownerId, ref.fileId, result.destFileId)
        return result.destFileId
      } catch (err) {
        if (isDriveNotConnectedError(err)) {
          setDialogOpen(true)
        }
        throw err
      }
    },
    [connected, markCopied],
  )

  const value = useMemo<DriveContextValue>(
    () => ({
      ready,
      connected,
      configured,
      googleEmail,
      connecting,
      connect,
      disconnect,
      requestConnect: () => setDialogOpen(true),
      refresh,
      hasCopy,
      canView,
      viewFileId,
      markCopied,
      copyToMyDrive,
      getAccessToken,
      downloadBlob,
    }),
    [
      ready,
      connected,
      configured,
      googleEmail,
      connecting,
      connect,
      disconnect,
      refresh,
      hasCopy,
      canView,
      viewFileId,
      markCopied,
      copyToMyDrive,
      getAccessToken,
      downloadBlob,
    ],
  )

  return (
    <DriveContext.Provider value={value}>
      {children}
      <DriveConnectDialog
        open={dialogOpen}
        connecting={connecting}
        configured={configured}
        onClose={() => setDialogOpen(false)}
        onConnect={() => void connect()}
      />
    </DriveContext.Provider>
  )
}

export class DriveConnectNeededError extends Error {
  readonly code = "drive_not_connected"
  constructor() {
    super("חבר את גוגל דרייב כדי להמשיך")
    this.name = "DriveConnectNeededError"
  }
}
