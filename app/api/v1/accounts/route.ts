import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

export const GET = withAgentAuth(async (ctx, _req) => {
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: "/api/accounts",
  })

  if (!result.ok) {
    return Response.json(
      { code: result.error?.code ?? "internal_error", message: result.error?.message ?? "Failed to list accounts" },
      { status: result.status },
    )
  }

  return Response.json(result.data, { status: 200 })
}, "cheap")
