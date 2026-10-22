import type { Metadata, Viewport } from "next"
import { Rubik } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "WhaChat",
  description: "הודעות, שיחות ופגישות — שקטות, מהירות, פרטיות.",
  generator: "v0.app",
  applicationName: "WhaChat",
  appleWebApp: {
    capable: true,
    title: "WhaChat",
    statusBarStyle: "default",
  },
  verification: {
    google: "t9baAK2VUiT5qE7LL3lotOcAOIKHVWBfU7CtkZ_M-rQ",
  },
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6eef2" },
    { media: "(prefers-color-scheme: dark)", color: "#070d13" },
  ],
  colorScheme: "light dark",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className="h-full" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className={`${rubik.className} min-h-svh overflow-x-hidden antialiased`}>
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
