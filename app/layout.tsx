import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

export const metadata: Metadata = {
  title: "WhaChat",
  description: "פשוט. אמין. הודעות פרטיות.",
  generator: "v0.app",
  verification: {
    google: "t9baAK2VUiT5qE7LL3lotOcAOIKHVWBfU7CtkZ_M-rQ",
  },
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo.svg" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#00a884",
  colorScheme: "light dark",
}

const themeScript = `
  (() => {
    try {
      const saved = localStorage.getItem("whachat-theme") || "system";
      const dark = saved === "dark" ||
        (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.add(dark ? "dark" : "light");
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    } catch {}
  })();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full bg-[var(--wa-panel)]" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full min-h-svh overflow-hidden antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
