import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { listCampaignsQuerySchema, createCampaignBodySchema } from "@/lib/agent-api/schemas"

export const GET = withAgentAuth(async (ctx, req) => {
  const url = new URL(req.url)
  const parsed = listCampaignsQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
  })
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: "/api/campaigns",
    query: parsed.data,
  })

  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "cheap")

// CreateCampaign on fs-whatsapp keys `flow_id` against chatbot_flows.id (the
// runtime row), but the public agent API exposes magic_flow_projects.id as
// `flow_id` everywhere. Resolve the project -> published_flow_id before
// forwarding. Mirrors the pattern in /v1/flows/[flow_id]/trigger/route.ts.
export const POST = withAgentAuth(async (ctx, req) => {
  const body = await req.json().catch(() => null)
  const parsed = createCampaignBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const project = await proxyToFsWhatsApp<{ project: { published_flow_id: string | null } }>({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/magic-flow/projects/${parsed.data.flow_id}`,
  })
  if (!project.ok) {
    return Response.json(
      { code: project.error?.code ?? "flow_not_found", message: project.error?.message ?? "Flow not found" },
      { status: project.status },
    )
  }
  const publishedFlowId = project.data?.project?.published_flow_id
  if (!publishedFlowId) {
    return Response.json(
      { code: "flow_not_published", message: "This flow has no published version. Publish it before creating a campaign." },
      { status: 400 },
    )
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: "/api/campaigns",
    body: { ...parsed.data, flow_id: publishedFlowId },
  })

  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
