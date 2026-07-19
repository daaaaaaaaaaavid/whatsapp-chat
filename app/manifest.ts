import type { MetadataRoute } from "next"
import { APP_NAME } from "@/lib/site-config"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "פשוט. אמין. הודעות פרטיות.",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b141a",
    theme_color: "#00a884",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
