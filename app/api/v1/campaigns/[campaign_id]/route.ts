import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { updateCampaignBodySchema } from "@/lib/agent-api/schemas"

function getCampaignId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const campaignsIdx = segments.indexOf("campaigns")
  return segments[campaignsIdx + 1] ?? ""
}

export const GET = withAgentAuth(async (ctx, req) => {
  const campaignId = getCampaignId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/campaigns/${campaignId}`,
  })
  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "cheap")

export const PUT = withAgentAuth(async (ctx, req) => {
  const campaignId = getCampaignId(req)
  const body = await req.json().catch(() => null)
  const parsed = updateCampaignBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "PUT",
    path: `/api/campaigns/${campaignId}`,
    body: parsed.data,
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")

export const DELETE = withAgentAuth(async (ctx, req) => {
  const campaignId = getCampaignId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "DELETE",
    path: `/api/campaigns/${campaignId}`,
  })
  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
