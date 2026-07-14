"use client"

import { useEffect, useState } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

export type ThemePreference = "system" | "light" | "dark"

const STORAGE_KEY = "whachat-theme"

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

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("system")

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    const initial = saved === "light" || saved === "dark" || saved === "system" ? saved : "system"
    setTheme(initial)
    applyTheme(initial)

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onSystemThemeChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? "system") === "system") applyTheme("system")
    }
    media.addEventListener("change", onSystemThemeChange)
    return () => media.removeEventListener("change", onSystemThemeChange)
  }, [])

  function chooseTheme(next: ThemePreference) {
    setTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
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
