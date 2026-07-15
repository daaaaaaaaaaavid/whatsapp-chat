/** Simple in-memory sliding-window rate limiter (per serverless instance). */

type Entry = { timestamps: number[] }

const buckets = new Map<string, Entry>()

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
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
