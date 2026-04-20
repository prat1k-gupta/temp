import { withAgentAuth } from "@/lib/agent-api/auth"
import { AgentError } from "@/lib/agent-api/errors"
import { publishFlowBodySchema } from "@/lib/agent-api/schemas"
import { getProject, getLatestVersion, publishVersion, publishRuntimeFlow, updateProject } from "@/lib/agent-api/publisher"
import { convertToFsWhatsApp } from "@/utils/whatsapp-converter"
import { flattenFlow } from "@/utils/flow-flattener"

/**
 * POST /v1/agent/flows/{flow_id}/publish — publish the latest version of a flow.
 *
 * Idempotent: if the latest version is already published, returns 200 with
 * already_published: true without re-deploying.
 *
 * Body: empty in v1 (unknowns stripped for forward compat).
 *
 * Auth: X-API-Key header with a whm_* key. See withAgentAuth.
 * Rate limit bucket: publish (30/min).
 */
export const POST = withAgentAuth(async (ctx, req) => {
  // Extract flow_id from URL path: /v1/agent/flows/{flow_id}/publish
  const url = new URL(req.url)
  const segments = url.pathname.split("/")
  // pathname: /api/v1/agent/flows/{flow_id}/publish
  // index:     0  1  2  3      4       5        6
  const flowId = segments[segments.indexOf("flows") + 1]
  if (!flowId) {
    throw new AgentError("invalid_param", "Missing flow_id in URL path")
  }

  // Parse body — gracefully handle empty bodies
  let body: unknown = {}
  try {
    const text = await req.text()
    if (text.trim()) body = JSON.parse(text)
  } catch {
    throw new AgentError("invalid_param", "Invalid JSON body")
  }
  publishFlowBodySchema.parse(body)

  // Load project + latest version (published or not)
  const [project, latestVersion] = await Promise.all([
    getProject(ctx, flowId),
    getLatestVersion(ctx, flowId),
  ])

  if (!latestVersion) {
    throw new AgentError("flow_not_found", "Flow has no versions")
  }

  const phoneDigits = ctx.account.phone_number?.replace(/\D/g, "")
  const firstKeyword = (project.triggerKeywords ?? [])[0]
  const testUrl =
    phoneDigits && firstKeyword
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(firstKeyword)}`
      : undefined

  // Idempotent: already published
  if (latestVersion.isPublished) {
    return Response.json(
      {
        flow_id: project.id,
        version: latestVersion.versionNumber,
        published: true,
        already_published: true,
        published_at: latestVersion.publishedAt,
        test_url: testUrl,
        trigger_keyword: firstKeyword,
        platform_url: project.platformUrl,
      },
      { status: 200 },
    )
  }

  // 1. Publish version in magic-flow DB
  await publishVersion(ctx, flowId, latestVersion.id)

  // 2. Flatten template nodes + convert to runtime format
  const flat = flattenFlow(latestVersion.nodes, latestVersion.edges)
  const converted = convertToFsWhatsApp(
    flat.nodes,
    flat.edges,
    project.name,           // flowName
    undefined,              // flowDescription
    [],                     // triggerIds (empty is fine)
    project.triggerKeywords,
    project.triggerMatchType,
    undefined,              // triggerRef
    project.flowSlug,       // flowSlug
    project.waAccountId,    // whatsappAccount
  )

  // 3. Deploy to runtime (create or update based on publishedFlowId)
  const runtime = await publishRuntimeFlow(ctx, {
    flowData: converted as unknown as Record<string, unknown>,
    triggerKeywords: project.triggerKeywords,
    triggerMatchType: project.triggerMatchType,
    existingRuntimeFlowId: project.publishedFlowId, // undefined = create, string = update
  })

  // 4. Save the runtime flow ID (and first-time flow_slug) back to the
  //    project. flow_slug is only set once — matches UI onPublished.
  await updateProject(ctx, flowId, {
    published_flow_id: runtime.runtimeFlowId,
    ...(runtime.flowSlug && !project.flowSlug ? { flow_slug: runtime.flowSlug } : {}),
  })

  return Response.json(
    {
      flow_id: project.id,
      version: latestVersion.versionNumber,
      published: true,
      already_published: false,
      published_at: new Date().toISOString(),
      test_url: testUrl,
      trigger_keyword: firstKeyword,
      platform_url: project.platformUrl,
    },
    { status: 200 },
  )
}, "publish")
