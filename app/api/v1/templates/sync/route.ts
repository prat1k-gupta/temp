import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

export const POST = withAgentAuth(async (ctx, _req) => {
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: "/api/templates/sync",
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
