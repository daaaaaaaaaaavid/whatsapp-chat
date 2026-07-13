"use client"

import { useCallback, useEffect, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { StatusViewer, type GroupedStatus } from "./status-viewer"
import { createClient } from "@/lib/supabase/client"
import type { Profile, Status } from "@/lib/types"
import { formatChatListTime } from "@/lib/format"
import { Plus, Type } from "lucide-react"

type Props = {
  open: boolean
  currentUser: Profile
  onClose: () => void
}

const BG_COLORS = ["#075E54", "#00a884", "#e542a3", "#f5b800", "#0088cc", "#d9534f", "#845ec2", "#4caf50"]

export function StatusDialog({ open, currentUser, onClose }: Props) {
  const [statuses, setStatuses] = useState<Status[]>([])
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState("")
  const [bgColor, setBgColor] = useState(BG_COLORS[0])
  const [viewing, setViewing] = useState<GroupedStatus | null>(null)
  const [viewIndex, setViewIndex] = useState(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("statuses")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
    if (!data) return
    const uids = Array.from(new Set(data.map((s) => s.user_id)))
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", uids)
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p as Profile]))
    setStatuses(data.map((s) => ({ ...s, profile: pmap.get(s.user_id) })) as Status[])
  }, [])

  useEffect(() => {
    if (open) {
      load()
      setCreating(false)
      setViewing(null)
    }
  }, [open, load])

  const myStatuses = statuses.filter((s) => s.user_id === currentUser.id)
  const others = statuses.filter((s) => s.user_id !== currentUser.id)
  const grouped: GroupedStatus[] = []
  for (const s of others) {
    let g = grouped.find((x) => x.profile.id === s.user_id)
    if (!g && s.profile) {
      g = { profile: s.profile, statuses: [] }
      grouped.push(g)
    }
    g?.statuses.push(s)
  }

  const allGroups: GroupedStatus[] = [
    ...(myStatuses.length ? [{ profile: currentUser, statuses: myStatuses }] : []),
    ...grouped,
  ]

  const handlePost = async () => {
    if (!text.trim()) return
    const supabase = createClient()
    await supabase.from("statuses").insert({
      user_id: currentUser.id,
      content: text.trim(),
      background_color: bgColor,
    })
    setText("")
    setCreating(false)
    load()
  }

  const openViewer = (g: GroupedStatus) => {
    setViewing(g)
    setViewIndex(0)
  }

  return (
    <Modal open={open} onClose={onClose} title="סטטוס">
      {creating ? (
        <div className="flex flex-col">
          <div
            className="flex min-h-64 items-center justify-center p-8 text-center"
            style={{ backgroundColor: bgColor }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder="הקלד סטטוס"
              className="w-full resize-none bg-transparent text-center text-2xl font-medium text-white outline-none placeholder:text-white/70"
              rows={3}
            />
          </div>
          <div className="flex items-center justify-center gap-2 p-4">
            {BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBgColor(c)}
                style={{ backgroundColor: c }}
                className={`h-8 w-8 rounded-full ${bgColor === c ? "ring-2 ring-offset-2 ring-[#00a884]" : ""}`}
                aria-label="צבע רקע"
              />
            ))}
          </div>
          <div className="flex justify-between p-4">
            <button onClick={() => setCreating(false)} className="text-sm text-[#667781]">
              ביטול
            </button>
            <button
              onClick={handlePost}
              disabled={!text.trim()}
              className="rounded-full bg-[#00a884] px-6 py-2 font-medium text-white disabled:opacity-50"
            >
              פרסם
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() =>
              myStatuses.length
                ? openViewer({ profile: currentUser, statuses: myStatuses })
                : setCreating(true)
            }
            className="flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#f5f6f6]"
          >
            <div className="relative">
              <Avatar name={currentUser.display_name} url={currentUser.avatar_url} size={49} />
              {myStatuses.length === 0 && (
                <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#00a884]">
                  <Plus className="h-3 w-3 text-white" />
                </span>
              )}
            </div>
            <div className="flex-1 border-b border-[#e9edef] pb-3">
              <div className="text-[#111b21]">הסטטוס שלי</div>
              <div className="text-sm text-[#667781]">
                {myStatuses.length
                  ? formatChatListTime(myStatuses[myStatuses.length - 1].created_at)
                  : "הקש כדי להוסיף עדכון סטטוס"}
              </div>
            </div>
          </button>

          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-3 border-b border-[#e9edef] px-5 py-3 text-right transition hover:bg-[#f5f6f6]"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white">
              <Type className="h-5 w-5" />
            </div>
            <span className="text-[#111b21]">כתוב סטטוס טקסט חדש</span>
          </button>

          {grouped.length > 0 && (
            <>
              <div className="px-5 py-2 text-xs font-medium text-[#667781]">עדכונים אחרונים</div>
              {grouped.map((g) => (
                <button
                  key={g.profile.id}
                  onClick={() => openViewer(g)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-right transition hover:bg-[#f5f6f6]"
                >
                  <div className="rounded-full p-0.5 ring-2 ring-[#00a884]">
                    <Avatar name={g.profile.display_name} url={g.profile.avatar_url} size={45} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[#111b21]">{g.profile.display_name ?? g.profile.email}</div>
                    <div className="text-sm text-[#667781]">
                      {formatChatListTime(g.statuses[g.statuses.length - 1].created_at)}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}

          {grouped.length === 0 && myStatuses.length === 0 && (
            <div className="p-6 text-center text-sm text-[#667781]">אין עדכוני סטטוס עדיין</div>
          )}
        </div>
      )}

      {viewing && (
        <StatusViewer
          group={viewing}
          groups={allGroups}
          index={viewIndex}
          currentUserId={currentUser.id}
          onIndexChange={setViewIndex}
          onGroupChange={(g, i) => {
            setViewing(g)
            setViewIndex(i)
          }}
          onClose={() => setViewing(null)}
        />
      )}
    </Modal>
  )
}
