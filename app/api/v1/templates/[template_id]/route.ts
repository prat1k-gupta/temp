import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { updateTemplateBodySchema } from "@/lib/agent-api/schemas"
import { toFsTemplatePayload } from "@/lib/agent-api/template-payload"

function getTemplateId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const templatesIdx = segments.indexOf("templates")
  return segments[templatesIdx + 1] ?? ""
}

export const GET = withAgentAuth(async (ctx, req) => {
  const templateId = getTemplateId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/templates/${templateId}`,
  })
  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "cheap")

export const PUT = withAgentAuth(async (ctx, req) => {
  const templateId = getTemplateId(req)
  const body = await req.json().catch(() => null)
  const parsed = updateTemplateBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "PUT",
    path: `/api/templates/${templateId}`,
    body: toFsTemplatePayload(parsed.data),
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")

export const DELETE = withAgentAuth(async (ctx, req) => {
  const templateId = getTemplateId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "DELETE",
    path: `/api/templates/${templateId}`,
  })
  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
