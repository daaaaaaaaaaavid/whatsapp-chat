import { loadEnvConfig } from "@next/env"
import { createServiceClient } from "@/lib/supabase/admin"
import { mediaCleanupSummary, runMediaCleanup } from "@/lib/media-cleanup"

loadEnvConfig(process.cwd())

async function main() {
  const admin = createServiceClient()
  if (!admin) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or Supabase URL in environment.")
    process.exit(1)
  }

  const result = await runMediaCleanup(admin)
  console.log("Media cleanup complete:", mediaCleanupSummary(result))
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
