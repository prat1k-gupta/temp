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
