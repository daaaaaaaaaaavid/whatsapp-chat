/**
 * Smoke-check PWA installability assets on production.
 * Run: npx tsx scripts/check-pwa.ts
 */
const BASE = process.env.PWA_CHECK_URL || "https://whatsapp-chat-beta.vercel.app"

async function check(path: string, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" })
  const ok = res.status === expectStatus
  const ct = res.headers.get("content-type") || ""
  console.log(`${ok ? "OK" : "FAIL"} ${path} → ${res.status} ${ct}`)
  return { ok, res, ct }
}

async function main() {
  let failed = 0

  const man = await check("/manifest.webmanifest")
  if (!man.ok) failed++
  else {
    const json = (await man.res.json()) as {
      name?: string
      start_url?: string
      display?: string
      icons?: { src: string; sizes?: string }[]
    }
    const checks = [
      Boolean(json.name),
      json.display === "standalone" || json.display === "fullscreen" || json.display === "minimal-ui",
      Boolean(json.start_url),
      (json.icons?.length ?? 0) >= 2,
      json.icons?.some((i) => i.sizes?.includes("192")),
      json.icons?.some((i) => i.sizes?.includes("512")),
    ]
    if (checks.every(Boolean)) console.log("OK manifest fields")
    else {
      console.log("FAIL manifest fields", json)
      failed++
    }
  }

  for (const p of ["/icon-192.png", "/icon-512.png", "/sw.js", "/logo.svg"]) {
    const r = await check(p)
    if (!r.ok) failed++
  }

  const sw = await fetch(`${BASE}/sw.js`).then((r) => r.text())
  if (sw.includes('addEventListener("fetch"') || sw.includes("addEventListener('fetch'")) {
    console.log("OK service worker has fetch handler")
  } else {
    console.log("FAIL service worker missing fetch handler")
    failed++
  }

  if (failed) {
    console.error(`\nPWA check failed (${failed})`)
    process.exit(1)
  }
  console.log("\nPWA assets look installable (Chrome still needs engagement + HTTPS).")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
