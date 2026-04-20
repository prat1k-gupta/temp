import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"

function getFlowId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const flowsIdx = segments.indexOf("flows")
  return segments[flowsIdx + 1] ?? ""
}

// Variables live in fs-whatsapp's chatbot_flow_steps table, keyed by the
// published_flow_id (NOT the magic-flow project id). Resolve the project
// first so callers can pass the project id everywhere uniformly.
export const GET = withAgentAuth(async (ctx, req) => {
  const projectId = getFlowId(req)

  const project = await proxyToFsWhatsApp<{ project: { published_flow_id: string | null; has_published: boolean } }>({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/magic-flow/projects/${projectId}`,
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
      { code: "flow_not_published", message: "This flow has no published version. Publish it before reading variables." },
      { status: 400 },
    )
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "GET",
    path: `/api/campaigns/flow-variables/${publishedFlowId}`,
  })
  return result.ok
    ? Response.json(result.data, { status: 200 })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "cheap")
