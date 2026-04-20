import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

function getCampaignId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const campaignsIdx = segments.indexOf("campaigns")
  return segments[campaignsIdx + 1] ?? ""
}

export const POST = withAgentAuth(async (ctx, req) => {
  const campaignId = getCampaignId(req)
  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: `/api/campaigns/${campaignId}/start`,
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "publish")
