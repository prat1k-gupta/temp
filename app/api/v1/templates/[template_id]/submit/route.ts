import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

function getTemplateId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const templatesIdx = segments.indexOf("templates")
  return segments[templatesIdx + 1] ?? ""
}

export const POST = withAgentAuth(async (ctx, req) => {
  const templateId = getTemplateId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: `/api/templates/${templateId}/publish`,
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "publish")
