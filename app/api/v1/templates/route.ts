import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { listTemplatesQuerySchema, createTemplateBodySchema } from "@/lib/agent-api/schemas"
import { toFsTemplatePayload } from "@/lib/agent-api/template-payload"

export const GET = withAgentAuth(async (ctx, req) => {
  const url = new URL(req.url)
  const parsed = listTemplatesQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    account_name: url.searchParams.get("account_name") ?? undefined,
  })
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: "/api/templates",
    query: parsed.data,
  })

  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "cheap")

export const POST = withAgentAuth(async (ctx, req) => {
  const body = await req.json().catch(() => null)
  const parsed = createTemplateBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: "/api/templates",
    body: toFsTemplatePayload(parsed.data),
  })

  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
