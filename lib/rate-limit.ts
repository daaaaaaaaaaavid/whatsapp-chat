/**
 * Rate limiting for API routes.
 * Prefer shared Upstash Redis when configured (multi-instance safe);
 * fall back to in-memory sliding window (per serverless instance).
 */

type Result = { ok: true } | { ok: false; retryAfterSec: number }

type Entry = { timestamps: number[] }
const buckets = new Map<string, Entry>()

/** In-memory limiter — used as fallback and in unit tests. */
export function checkRateLimitMemory(
  key: string,
  limit: number,
  windowMs: number,
): Result {
  const now = Date.now()
  const entry = buckets.get(key) ?? { timestamps: [] }
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
    buckets.set(key, entry)
    return { ok: false, retryAfterSec }
  }

  entry.timestamps.push(now)
  buckets.set(key, entry)
  return { ok: true }
}

/** @deprecated Prefer checkRateLimit (async). Sync alias kept for tests. */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Result {
  return checkRateLimitMemory(key, limit, windowMs)
}

async function checkUpstash(
  key: string,
  limit: number,
  windowMs: number,
): Promise<Result | null> {
  const base = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "")
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return null

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
  const redisKey = `rl:${key}`

  try {
    const incrRes = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["TTL", redisKey],
      ]),
      cache: "no-store",
    })
    if (!incrRes.ok) return null

    const rows = (await incrRes.json()) as Array<{ result?: number | string } | number | string>
    const parseCell = (cell: (typeof rows)[number] | undefined): number => {
      if (typeof cell === "object" && cell && "result" in cell) return Number(cell.result)
      return Number(cell)
    }
    const count = parseCell(rows[0])
    let ttl = parseCell(rows[1])

    if (!Number.isFinite(count)) return null

    // First hit in a window: key has no TTL yet
    if (!Number.isFinite(ttl) || ttl < 0) {
      await fetch(`${base}/expire/${encodeURIComponent(redisKey)}/${windowSec}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }).catch(() => {})
      ttl = windowSec
    }

    if (count > limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Number.isFinite(ttl) && ttl > 0 ? Math.ceil(ttl) : windowSec),
      }
    }
    return { ok: true }
  } catch {
    return null
  }
}

/**
 * Shared rate limit when Upstash is configured; otherwise in-memory fallback.
 */
export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<Result> {
  const shared = await checkUpstash(key, limit, windowMs)
  if (shared) return shared
  return checkRateLimitMemory(key, limit, windowMs)
}
