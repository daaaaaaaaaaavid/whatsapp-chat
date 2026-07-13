import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

export const metadata: Metadata = {
  title: "WhaChat",
  description: "פשוט. אמין. הודעות פרטיות.",
  generator: "v0.app",
}

export const viewport: Viewport = {
  themeColor: "#00a884",
  colorScheme: "light",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className="light h-full bg-white">
      <body className="h-full min-h-svh overflow-hidden antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
