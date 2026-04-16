import { RATE_LIMIT_BUCKETS, type RateLimitBucket } from "./constants"

type BucketKey = `${string}:${RateLimitBucket}`

interface BucketState {
  count: number
  resetAt: number // unix ms
}

/**
 * In-memory rate limit store keyed by `${apiKey}:${bucket}`. Lives for the
 * lifetime of the Next.js process. On hot reload or restart, limits reset.
 * This is intentionally simple — not Redis-backed, not per-IP, not durable.
 *
 * Good enough for v1. See spec decision #14 and edge case #7.
 */
const store = new Map<BucketKey, BucketState>()

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

export function rateLimitCheck(apiKey: string, bucket: RateLimitBucket): RateLimitResult {
  const key: BucketKey = `${apiKey}:${bucket}`
  const now = Date.now()
  const limit = RATE_LIMIT_BUCKETS[bucket].maxPerMinute
  const state = store.get(key)

  if (!state || state.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + 60_000 })
    return { ok: true }
  }

  if (state.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((state.resetAt - now) / 1000) }
  }

  state.count += 1
  return { ok: true }
}

/** TEST ONLY. Clears the store. Not exported from the module index. */
export function __resetRateLimitForTests(): void {
  store.clear()
}
