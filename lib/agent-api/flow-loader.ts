import { getProject, getLatestVersion } from "./publisher"
import type { ProjectInfo, VersionInfo } from "./publisher"
import { AgentError } from "./errors"
import type { AgentContext } from "./types"
import type { Node, Edge } from "@xyflow/react"

export interface FlowEditContext {
  project: ProjectInfo
  version: VersionInfo
  existingFlow: {
    nodes: Node[]
    edges: Edge[]
  }
  /** toolContext to pass to generateFlowStreaming */
  toolContext: {
    authHeader: string
    projectId: string
    projectName: string
    publishedFlowId?: string
    triggerKeywords: string[]
    triggerMatchType: string
    flowSlug: string
    waAccountId: string
    waAccountName: string
    waPhoneNumber?: string
    userTimezone?: string
    currentTime: string
  }
}

export async function loadFlowForEdit(
  ctx: AgentContext,
  projectId: string,
): Promise<FlowEditContext> {
  const [project, version] = await Promise.all([
    getProject(ctx, projectId),
    getLatestVersion(ctx, projectId),
  ])

  if (!version) {
    throw new AgentError(
      "flow_not_found",
      `Flow ${projectId} has no versions to edit`,
    )
  }

  return {
    project,
    version,
    existingFlow: {
      nodes: version.nodes as Node[],
      edges: version.edges as Edge[],
    },
    toolContext: {
      authHeader: ctx.apiKey,
      projectId: project.id,
      projectName: project.name,
      publishedFlowId: project.publishedFlowId,
      triggerKeywords: project.triggerKeywords,
      triggerMatchType: project.triggerMatchType,
      flowSlug: project.flowSlug,
      waAccountId: project.waAccountId,
      waAccountName: ctx.account.name,
      waPhoneNumber: ctx.account.phone_number,
      // Server-side "now" so the AI can resolve relative times ("tomorrow 6 PM")
      // without relying on training-data priors. Public agent callers have no
      // browser timezone; defaults to UTC at the prompt level.
      currentTime: new Date().toISOString(),
    },
  }
}
