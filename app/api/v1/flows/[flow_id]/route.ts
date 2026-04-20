import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { patchFlowBodySchema } from "@/lib/agent-api/schemas"

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

// PATCH updates project metadata only (name, trigger_*). Flow content
// edits go through POST /v1/agent/flows/{id}/edit (AI-driven).
// fs-whatsapp cascades these fields to the runtime chatbot_flows row
// when the project is published, so changes take effect without
// re-publishing.
export const PATCH = withAgentAuth(async (ctx, req) => {
  const flowId = getFlowId(req)
  const body = await req.json().catch(() => null)
  const parsed = patchFlowBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "PUT",
    path: `/api/magic-flow/projects/${flowId}`,
    body: parsed.data,
  })
  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")

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
