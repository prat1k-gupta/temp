import { withAgentAuth } from "@/lib/agent-api/auth"
import { proxyToFsWhatsApp } from "@/lib/agent-api/proxy"
import { triggerFlowBodySchema } from "@/lib/agent-api/schemas"

function getFlowId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  const flowsIdx = segments.indexOf("flows")
  return segments[flowsIdx + 1] ?? ""
}

// Trigger calls fs-whatsapp's /api/chatbot/flows/{publishedFlowId}/send,
// which is keyed by the runtime flow id (NOT the magic-flow project id).
// Resolve the project first, then forward.
export const POST = withAgentAuth(async (ctx, req) => {
  const projectId = getFlowId(req)
  const body = await req.json().catch(() => null)
  const parsed = triggerFlowBodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ code: "invalid_param", message: parsed.error.message }, { status: 400 })
  }

  const project = await proxyToFsWhatsApp<{ project: { published_flow_id: string | null } }>({
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
      { code: "flow_not_published", message: "This flow has no published version. Publish it before triggering a test send." },
      { status: 400 },
    )
  }

  const fsBody: Record<string, unknown> = {
    phone_number: parsed.data.phone,
    whatsapp_account: parsed.data.account_name,
    // Test sends always force a new session so a stuck prior session
    // doesn't block the smoke test with a 409 active_session error.
    force_new_session: true,
  }
  if (parsed.data.variables && Object.keys(parsed.data.variables).length > 0) {
    fsBody.variables = parsed.data.variables
  }

  const result = await proxyToFsWhatsApp({
    apiKey: ctx.apiKey,
    method: "POST",
    path: `/api/chatbot/flows/${publishedFlowId}/send`,
    body: fsBody,
  })
  return result.ok
    ? Response.json(result.data, { status: result.status })
    : Response.json({ code: result.error?.code, message: result.error?.message }, { status: result.status })
}, "write")
