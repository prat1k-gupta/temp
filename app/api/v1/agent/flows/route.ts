import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import { listFlows } from "@/lib/agent-api/publisher"
import { findFlowQuerySchema } from "@/lib/agent-api/schemas"

/**
 * GET /v1/agent/flows — find/list flows for the authenticated org.
 *
 * Query params:
 *   - query (optional): fuzzy hint string; not used server-side in v1,
 *                       parent LLM does the fuzzy matching on the returned list
 *   - limit (optional): 1-50, default 10
 *
 * Auth: X-API-Key header with a whm_* key. See withAgentAuth.
 * Rate limit bucket: cheap (120/min).
 */
export const GET = withAgentAuth(async (ctx, req) => {
  const url = new URL(req.url)
  const queryParams = {
    query: url.searchParams.get("query") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  }

  const parsed = findFlowQuerySchema.safeParse(queryParams)
  if (!parsed.success) {
    throw new AgentError("invalid_param", "Invalid query parameters", {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    })
  }

  const result = await listFlows(ctx, parsed.data.limit)
  return Response.json(result, { status: 200 })
}, "cheap")
