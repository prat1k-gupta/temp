import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

function getFlowId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const flowsIdx = segments.indexOf("flows")
  return segments[flowsIdx + 1] ?? ""
}

export const GET = withAgentAuth(async (ctx, req) => {
  const flowId = getFlowId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/magic-flow/projects/${flowId}`,
  })
  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "cheap")

export const DELETE = withAgentAuth(async (ctx, req) => {
  const flowId = getFlowId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "DELETE",
    path: `/api/magic-flow/projects/${flowId}`,
  })
  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
