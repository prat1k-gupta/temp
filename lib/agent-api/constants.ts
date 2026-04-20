/**
 * URL for the fs-whatsapp backend. Read once at module load.
 *
 * This is SERVER-SIDE code (runs inside the Next.js Node runtime), so when
 * we run in the docker-compose dev stack, "localhost" inside the container
 * means the container itself — not the host. The compose file exposes the
 * correct server-side URL as `FS_WHATSAPP_API_URL` (pointing at
 * `host.docker.internal:8080`), which we use first. Falls back to the
 * client-side env var and finally to localhost for local-machine dev.
 */
export const FS_WHATSAPP_URL =
  process.env.FS_WHATSAPP_API_URL ||
  process.env.NEXT_PUBLIC_FS_WHATSAPP_URL ||
  "http://localhost:8080"

/** Prefix that every general API key carries. Used for fast-fail auth rejection. */
export const AGENT_API_KEY_PREFIX = "whm_"

/**
 * Per-key rate limit buckets. See spec "Edge case #7" and decision #14.
 * Numbers are arbitrary for v1 — tune after we see real traffic.
 * Bucket keys match the rate-limit decision points in each route handler.
 */
export const RATE_LIMIT_BUCKETS = {
  /** Applied to POST /v1/agent/flows and POST /v1/agent/flows/{id}/edit (expensive AI calls) */
  expensive: { maxPerMinute: 10 },
  /** Applied to POST /v1/agent/flows/{id}/publish */
  publish: { maxPerMinute: 30 },
  /** Applied to write endpoints (POST/PUT/DELETE for templates, campaigns, etc.) */
  write: { maxPerMinute: 60 },
  /** Applied to GET /v1/agent/flows (cheap list) */
  cheap: { maxPerMinute: 120 },
} as const

export type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS

/** Max number of flows returned by GET /v1/agent/flows. Hard cap. */
export const FIND_FLOW_MAX_LIMIT = 50

/** Default limit if caller doesn't specify. */
export const FIND_FLOW_DEFAULT_LIMIT = 10
