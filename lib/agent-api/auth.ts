import { AGENT_API_KEY_PREFIX } from "./constants"
import { AgentError } from "./errors"
import { rateLimitCheck } from "./rate-limit"
import { getActingAccount } from "./account-resolver"
import type { AgentContext } from "./types"
import type { RateLimitBucket } from "./constants"

/**
 * Higher-order function that wraps a Next.js route handler with authentication,
 * rate limiting, and account resolution. Every agent API route uses this.
 *
 * Pipeline:
 *   1. Read X-API-Key header. Fail fast with 401 if missing or wrong prefix.
 *   2. Apply rate limit for the given bucket. Return 429 with retry_after on limit.
 *   3. Call getActingAccount(apiKey). This also validates the key against
 *      fs-whatsapp's real auth layer — a 401 here means the key is invalid.
 *   4. Invoke the inner handler with a populated AgentContext.
 *   5. Catch any errors the handler throws and map them to HTTP responses.
 *      AgentError → its mapped HTTP status. Other errors → 500 internal_error.
 */
export function withAgentAuth(
  handler: (ctx: AgentContext, req: Request) => Promise<Response>,
  bucket: RateLimitBucket,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // 1. API key presence and prefix
    const apiKey = req.headers.get("x-api-key")
    if (!apiKey || !apiKey.startsWith(AGENT_API_KEY_PREFIX)) {
      return new AgentError(
        "unauthorized",
        "Missing or invalid API key. Expected X-API-Key header with whm_ prefix.",
      ).toHttpResponse()
    }

    // 2. Rate limit
    const limit = rateLimitCheck(apiKey, bucket)
    if (!limit.ok) {
      return new AgentError("rate_limited", "Rate limit exceeded", {
        retry_after_seconds: limit.retryAfter,
      }).toHttpResponse()
    }

    // 3. Validate key + load account (one round-trip to fs-whatsapp)
    let account
    try {
      account = await getActingAccount(apiKey)
    } catch (err) {
      return AgentError.fromUnknown(err).toHttpResponse()
    }

    // 4. Invoke handler, 5. Map errors
    try {
      return await handler({ apiKey, account }, req)
    } catch (err) {
      return AgentError.fromUnknown(err).toHttpResponse()
    }
  }
}
