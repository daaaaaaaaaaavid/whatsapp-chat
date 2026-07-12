import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { getSupabaseEnv } from "@/lib/supabase/env"
import "./globals.css"

export const metadata: Metadata = {
  title: "WhatsApp",
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
  // Read at request/runtime on the server so Vercel env vars work
  // even when NEXT_PUBLIC_* were not inlined into the client bundle.
  const { url, anonKey } = getSupabaseEnv()
  const bootstrap = `window.__SUPABASE_URL__=${JSON.stringify(url)};window.__SUPABASE_ANON_KEY__=${JSON.stringify(anonKey)};`

  return (
    <html lang="he" dir="rtl" className="light bg-background">
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      </head>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
