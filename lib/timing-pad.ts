/** Ensure a promise takes at least `minMs` (mitigates timing-based enumeration). */
export async function withMinLatency<T>(minMs: number, fn: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    return await fn()
  } finally {
    const elapsed = Date.now() - started
    if (elapsed < minMs) {
      await new Promise((r) => setTimeout(r, minMs - elapsed))
    }
  }
}
