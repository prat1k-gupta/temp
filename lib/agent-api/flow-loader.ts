import { getProject } from "./publisher"
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
    waPhoneNumber?: string
  }
}

export async function loadFlowForEdit(
  ctx: AgentContext,
  projectId: string,
): Promise<FlowEditContext> {
  const project = await getProject(ctx, projectId)

  if (!project.latestVersion) {
    throw new AgentError(
      "flow_not_found",
      `Flow ${projectId} has no published version to edit`,
    )
  }

  const version = project.latestVersion

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
      waPhoneNumber: ctx.account.phone_number,
    },
  }
}
