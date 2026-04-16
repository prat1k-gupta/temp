import { FS_WHATSAPP_URL } from "./constants"
import { AgentError } from "./errors"
import type { AgentContext } from "./types"

/**
 * Public flow shape returned by our agent API. Purposefully narrower than
 * fs-whatsapp's MagicFlowProjectResponse — we omit org-internal fields.
 */
export interface PublicFlow {
  flow_id: string
  name: string
  trigger_keyword: string | undefined
  node_count: number
  current_version: number
  magic_flow_url: string
  test_url: string | undefined
  created_at: string
  updated_at: string
}

export interface ListFlowsResult {
  flows: PublicFlow[]
  total: number
}

/** Shape fs-whatsapp returns from GET /api/magic-flow/projects — wrapped in SendEnvelope */
interface FsProjectsEnvelope {
  status?: string
  data?: {
    projects: Array<{
      id: string
      name: string
      created_at: string
      updated_at: string
      trigger_keywords?: string[]
      node_count?: number
      latest_version?: number
    }>
    total: number
    page?: number
    limit?: number
  }
}

/**
 * Call fs-whatsapp's magic-flow projects list, forwarding the agent's API key.
 * Normalizes each project into our public flow shape with computed URLs.
 */
export async function listFlows(ctx: AgentContext, limit: number): Promise<ListFlowsResult> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects?limit=${encodeURIComponent(String(limit))}`

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when listing projects`)
  }

  let body: FsProjectsEnvelope
  try {
    body = (await res.json()) as FsProjectsEnvelope
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable projects response")
  }

  const projects = body.data?.projects ?? []
  const flows: PublicFlow[] = projects.map((p) => {
    const firstKeyword = (p.trigger_keywords ?? [])[0]
    return {
      flow_id: p.id,
      name: p.name,
      trigger_keyword: firstKeyword,
      node_count: p.node_count ?? 0,
      current_version: p.latest_version ?? 1,
      magic_flow_url: buildMagicFlowUrl(p.id),
      test_url: buildTestUrl(ctx.account.phone_number, firstKeyword),
      created_at: p.created_at,
      updated_at: p.updated_at,
    }
  })

  return { flows, total: body.data?.total ?? flows.length }
}

// ---------------------------------------------------------------------------
// Project lifecycle (Phase 2)
// ---------------------------------------------------------------------------

export interface CreateProjectOpts {
  name: string
  platform: string
  triggerKeywords?: string[]
  triggerMatchType?: string
  waAccountId?: string
  waPhoneNumber?: string
}

export async function createProject(
  ctx: AgentContext,
  opts: CreateProjectOpts,
): Promise<{ id: string }> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects`

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: opts.name,
        platform: opts.platform,
        trigger_keywords: opts.triggerKeywords,
        trigger_match_type: opts.triggerMatchType,
        ...(opts.waAccountId ? { wa_account_id: opts.waAccountId } : {}),
        ...(opts.waPhoneNumber ? { wa_phone_number: opts.waPhoneNumber } : {}),
      }),
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when creating project`)
  }

  let body: { status?: string; data?: { project?: { id?: string } } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable project response")
  }

  const projectId = body.data?.project?.id
  if (!projectId) {
    throw new AgentError("internal_error", "fs-whatsapp did not return a project ID")
  }

  return { id: projectId }
}

export async function updateProject(
  ctx: AgentContext,
  projectId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when updating project ${projectId}`)
  }
}

// ---------------------------------------------------------------------------
// Project + version read (Phase 3)
// ---------------------------------------------------------------------------

export interface VersionInfo {
  id: string
  versionNumber: number
  nodes: any[]
  edges: any[]
  platform: string
  isPublished: boolean
  publishedAt: string | undefined
  changes: any[]
}

export interface ProjectInfo {
  id: string
  name: string
  platform: string
  publishedFlowId: string | undefined
  flowSlug: string
  triggerKeywords: string[]
  triggerMatchType: string
  waAccountId: string
  waPhoneNumber: string
  latestVersion: VersionInfo | undefined
}

function parseVersionInfo(v: {
  id: string
  version_number: number
  nodes: any[]
  edges: any[]
  platform: string
  is_published: boolean
  published_at?: string
  changes: any[]
}): VersionInfo {
  return {
    id: v.id,
    versionNumber: v.version_number,
    nodes: v.nodes,
    edges: v.edges,
    platform: v.platform,
    isPublished: v.is_published,
    publishedAt: v.published_at,
    changes: v.changes,
  }
}

export async function getProject(ctx: AgentContext, projectId: string): Promise<ProjectInfo> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (res.status === 404) {
    throw new AgentError("flow_not_found", `Project ${projectId} not found`)
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when fetching project ${projectId}`)
  }

  let body: { status?: string; data?: { project?: Record<string, any> } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable project response")
  }

  const p = body.data?.project
  if (!p) {
    throw new AgentError("flow_not_found", `Project ${projectId} not found in response`)
  }

  return {
    id: p.id,
    name: p.name,
    platform: p.platform,
    publishedFlowId: p.published_flow_id ?? undefined,
    flowSlug: p.flow_slug,
    triggerKeywords: p.trigger_keywords ?? [],
    triggerMatchType: p.trigger_match_type,
    waAccountId: p.wa_account_id,
    waPhoneNumber: p.wa_phone_number,
    latestVersion: p.latest_version ? parseVersionInfo(p.latest_version) : undefined,
  }
}

export async function listVersions(ctx: AgentContext, projectId: string): Promise<VersionInfo[]> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}/versions`

  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError(
      "internal_error",
      `fs-whatsapp returned ${res.status} when listing versions for project ${projectId}`,
    )
  }

  let body: { status?: string; data?: { versions?: any[] } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable versions response")
  }

  const versions = body.data?.versions ?? []
  return versions
    .map(parseVersionInfo)
    .sort((a: VersionInfo, b: VersionInfo) => b.versionNumber - a.versionNumber)
}

export async function deleteProject(ctx: AgentContext, projectId: string): Promise<void> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when deleting project ${projectId}`)
  }
}

// ---------------------------------------------------------------------------
// Version management (Phase 2, Tasks 2+3)
// ---------------------------------------------------------------------------

export async function createVersion(
  ctx: AgentContext,
  projectId: string,
  nodes: unknown[],
  edges: unknown[],
  changes?: Record<string, unknown>,
): Promise<{ id: string; version_number: number }> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}/versions`

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Agent API edit",
        nodes,
        edges,
        changes: changes ?? {},
        platform: "whatsapp",
      }),
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("internal_error", `fs-whatsapp returned ${res.status} when creating version`)
  }

  let body: { status?: string; data?: { version?: { id?: string; version_number?: number } } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("internal_error", "fs-whatsapp returned unparseable version response")
  }

  const version = body.data?.version
  if (!version?.id || version.version_number === undefined) {
    throw new AgentError("internal_error", "fs-whatsapp did not return a valid version")
  }

  return { id: version.id, version_number: version.version_number }
}

export async function publishVersion(
  ctx: AgentContext,
  projectId: string,
  versionId: string,
): Promise<void> {
  const url = `${FS_WHATSAPP_URL}/api/magic-flow/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/publish`

  let res: Response
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })
  } catch (err) {
    throw new AgentError(
      "internal_error",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError(
      "internal_error",
      `fs-whatsapp returned ${res.status} when publishing version ${versionId}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Runtime flow publishing (Phase 2, Task 4)
// ---------------------------------------------------------------------------

export interface PublishRuntimeFlowOpts {
  flowData: Record<string, unknown>
  triggerKeywords: string[]
  triggerMatchType: string
  existingRuntimeFlowId?: string
}

export async function publishRuntimeFlow(
  ctx: AgentContext,
  opts: PublishRuntimeFlowOpts,
): Promise<{ runtimeFlowId: string }> {
  const isUpdate = Boolean(opts.existingRuntimeFlowId)
  const url = isUpdate
    ? `${FS_WHATSAPP_URL}/api/chatbot/flows/${encodeURIComponent(opts.existingRuntimeFlowId!)}`
    : `${FS_WHATSAPP_URL}/api/chatbot/flows`

  let res: Response
  try {
    res = await fetch(url, {
      method: isUpdate ? "PUT" : "POST",
      headers: {
        "X-API-Key": ctx.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...opts.flowData,
        trigger_keywords: opts.triggerKeywords,
        trigger_match_type: opts.triggerMatchType,
      }),
    })
  } catch (err) {
    throw new AgentError(
      "publish_failed",
      `Failed to reach fs-whatsapp: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AgentError("publish_failed", `fs-whatsapp returned ${res.status} when publishing runtime flow`)
  }

  let body: { status?: string; data?: { id?: string; flow_slug?: string } }
  try {
    body = await res.json()
  } catch {
    throw new AgentError("publish_failed", "fs-whatsapp returned unparseable runtime flow response")
  }

  const runtimeFlowId = body.data?.id
  if (!runtimeFlowId) {
    throw new AgentError("publish_failed", "fs-whatsapp did not return a runtime flow ID")
  }

  return { runtimeFlowId }
}

// ---------------------------------------------------------------------------
// Keyword conflict detection (Phase 2, Task 4)
// ---------------------------------------------------------------------------

export async function checkKeywordConflict(
  ctx: AgentContext,
  normalizedKeyword: string,
): Promise<{ id: string; name: string; magic_flow_url: string } | null> {
  const { flows } = await listFlows(ctx, 50)

  const lowerKeyword = normalizedKeyword.toLowerCase()
  const match = flows.find(
    (flow) => flow.trigger_keyword !== undefined && flow.trigger_keyword.toLowerCase() === lowerKeyword,
  )

  if (!match) return null

  return {
    id: match.flow_id,
    name: match.name,
    magic_flow_url: match.magic_flow_url,
  }
}

function buildMagicFlowUrl(flowId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3002"
  return `${base}/flow/${flowId}`
}

function buildTestUrl(phoneNumber: string | undefined, keyword: string | undefined): string | undefined {
  if (!phoneNumber || !keyword) return undefined
  // Strip non-digit chars from the phone number for wa.me compatibility.
  const digits = phoneNumber.replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(keyword)}`
}
