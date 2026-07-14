"use client"

import { useEffect, useRef, useState } from "react"
import { Modal } from "./modal"
import { Avatar } from "./avatar"
import { createClient } from "@/lib/supabase/client"
import type { Profile } from "@/lib/types"
import { Camera, Check, Pencil } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

type Props = {
  open: boolean
  currentUser: Profile
  onClose: () => void
  onUpdated: (p: Profile) => void
}

export function ProfileDialog({ open, currentUser, onClose, onUpdated }: Props) {
  const [name, setName] = useState(currentUser.display_name ?? "")
  const [about, setAbout] = useState(currentUser.about ?? "זמין")
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url)
  const [editingName, setEditingName] = useState(false)
  const [editingAbout, setEditingAbout] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(currentUser.display_name ?? "")
      setAbout(currentUser.about ?? "זמין")
      setAvatarUrl(currentUser.avatar_url)
    }
  }, [open, currentUser])

  const save = async (fields: Partial<Profile>) => {
    const supabase = createClient()
    const { data } = await supabase
      .from("profiles")
      .update(fields)
      .eq("id", currentUser.id)
      .select()
      .single()
    if (data) onUpdated(data as Profile)
  }

  const handleAvatar = async (file: File) => {
    const supabase = createClient()
    const ext = file.name.split(".").pop()
    const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true })
    if (error) return
    const { data } = supabase.storage.from("media").getPublicUrl(path)
    setAvatarUrl(data.publicUrl)
    await save({ avatar_url: data.publicUrl })
  }

  return (
    <Modal open={open} onClose={onClose} title="הפרופיל שלי">
      <div className="flex flex-col items-center bg-[var(--wa-header)] py-8">
        <div className="relative">
          <Avatar name={name} url={avatarUrl} size={200} />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition hover:opacity-100"
          >
            <Camera className="h-8 w-8" />
            <span className="mt-1 text-xs">שנה תמונת פרופיל</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleAvatar(f)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      <div className="bg-[var(--wa-panel)]">
        <div className="px-6 py-4">
          <label className="text-sm text-[#008069]">שם</label>
          <div className="mt-1 flex items-center gap-2">
            {editingName ? (
              <>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="flex-1 border-b-2 border-[#00a884] bg-transparent py-1 text-[var(--wa-text)] outline-none"
                />
                <button
                  onClick={async () => {
                    await save({ display_name: name })
                    setEditingName(false)
                  }}
                  aria-label="שמור"
                >
                  <Check className="h-5 w-5 text-[var(--wa-text-secondary)]" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[var(--wa-text)]">{name}</span>
                <button onClick={() => setEditingName(true)} aria-label="ערוך שם">
                  <Pencil className="h-4 w-4 text-[var(--wa-text-secondary)]" />
                </button>
              </>
            )}
          </div>
        </div>

        <p className="px-6 pb-4 text-xs text-[var(--wa-text-secondary)]">
          זהו לא שם המשתמש שלך ולא קוד PIN. שם זה יופיע לאנשי הקשר שלך.
        </p>

        <div className="border-t border-[var(--wa-border)] px-6 py-4">
          <label className="text-sm text-[#008069]">מידע (סטטוס)</label>
          <div className="mt-1 flex items-center gap-2">
            {editingAbout ? (
              <>
                <input
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  autoFocus
                  className="flex-1 border-b-2 border-[#00a884] bg-transparent py-1 text-[var(--wa-text)] outline-none"
                />
                <button
                  onClick={async () => {
                    await save({ about })
                    setEditingAbout(false)
                  }}
                  aria-label="שמור"
                >
                  <Check className="h-5 w-5 text-[var(--wa-text-secondary)]" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[var(--wa-text)]">{about}</span>
                <button onClick={() => setEditingAbout(true)} aria-label="ערוך מידע">
                  <Pencil className="h-4 w-4 text-[var(--wa-text-secondary)]" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--wa-border)] px-6 py-4">
          <label className="text-sm text-[#008069]">אימייל</label>
          <div className="mt-1 text-[var(--wa-text)]" dir="ltr">
            {currentUser.email}
          </div>
        </div>

        <div className="border-t border-[var(--wa-border)]">
          <ThemeToggle userId={currentUser.id} />
          <p className="px-3 pb-3 text-xs text-[var(--wa-text-secondary)]">
            הבחירה נשמרת אישית עבור החשבון הזה במכשיר הנוכחי.
          </p>
        </div>
      </div>
    </Modal>
  )
}
