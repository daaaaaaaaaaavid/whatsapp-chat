"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

export type ThemePreference = "system" | "light" | "dark"

const STORAGE_KEY = "whachat-theme"
const THEME_EVENT = "whachat-theme-change"

const themes: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "מערכת", icon: Monitor },
  { id: "light", label: "בהיר", icon: Sun },
  { id: "dark", label: "כהה", icon: Moon },
]

function applyTheme(theme: ThemePreference) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  document.documentElement.classList.toggle("dark", isDark)
  document.documentElement.classList.toggle("light", !isDark)
  document.documentElement.style.colorScheme = isDark ? "dark" : "light"
}

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system"
}

function userStorageKey(userId?: string) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY
}

function storedTheme(userId?: string): ThemePreference {
  const personal = localStorage.getItem(userStorageKey(userId))
  if (isThemePreference(personal)) return personal
  const legacy = localStorage.getItem(STORAGE_KEY)
  return isThemePreference(legacy) ? legacy : "system"
}

export function ThemeToggle({ userId }: { userId?: string }) {
  const [theme, setTheme] = useState<ThemePreference>("system")

  useEffect(() => {
    const initial = storedTheme(userId)
    setTheme(initial)
    applyTheme(initial)

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onSystemThemeChange = () => {
      if (storedTheme(userId) === "system") applyTheme("system")
    }
    const onThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; theme: ThemePreference }>).detail
      if (detail?.userId !== userId) return
      setTheme(detail.theme)
      applyTheme(detail.theme)
    }
    media.addEventListener("change", onSystemThemeChange)
    window.addEventListener(THEME_EVENT, onThemeChange)
    return () => {
      media.removeEventListener("change", onSystemThemeChange)
      window.removeEventListener(THEME_EVENT, onThemeChange)
    }
  }, [userId])

  function chooseTheme(next: ThemePreference) {
    setTheme(next)
    localStorage.setItem(userStorageKey(userId), next)
    // Keep the last active choice for the pre-hydration theme script.
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { userId, theme: next } }))
  }

  return (
    <div className="border-t border-[var(--wa-border)] px-3 py-2.5">
      <div className="mb-2 text-xs font-medium text-[var(--wa-text-secondary)]">ערכת נושא</div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--wa-header)] p-1">
        {themes.map(({ id, label, icon: Icon }) => {
          const active = theme === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => chooseTheme(id)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition",
                active
                  ? "bg-[var(--wa-panel)] text-[var(--wa-teal)] shadow-sm"
                  : "text-[var(--wa-text-secondary)] hover:text-[var(--wa-text)]",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
