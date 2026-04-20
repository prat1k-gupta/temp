import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { previewAudienceBodySchema } from "@/lib/agent-api/schemas"

export const POST = withAgentAuth(async (ctx, req) => {
  const body = await req.json().catch(() => null)
  const parsed = previewAudienceBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  // fs-whatsapp's preview-audience reads filter/search/channel/audience_id
  // from the TOP LEVEL of the body (NOT nested under audience_config the way
  // create-campaign does). Flatten before forwarding so callers can use one
  // consistent shape across the v1 surface.
  const { source, audience_config } = parsed.data
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: "/api/campaigns/preview-audience",
    body: { source, ...audience_config },
  })

  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
