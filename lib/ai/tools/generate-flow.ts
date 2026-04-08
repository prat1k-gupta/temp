import { getAIClient } from "../core/ai-client"
import { getPlatformGuidelines } from "../core/ai-context"
import type { Platform, TemplateAIMetadata, TemplateResolver } from "@/types"
import type { Node, Edge } from "@xyflow/react"
import { editFlowPlanSchema, flowPlanSchema } from "@/types/flow-plan"
import { buildFlowFromPlan, buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import { buildSystemPrompt, buildUserPrompt } from "./flow-prompts"
import { executeEditMode, applyNodeUpdates } from "./generate-flow-edit"
import { executeCreateMode } from "./generate-flow-create"

export interface GenerateFlowRequest {
  prompt: string
  platform: Platform
  flowContext?: string
  conversationHistory?: Array<{ role: string; content: string }>
  existingFlow?: {
    nodes: Node[]
    edges: Edge[]
  }
  selectedNode?: Node
  userTemplates?: Array<{ id: string; name: string; aiMetadata?: TemplateAIMetadata }>
  userTemplateData?: Array<{ id: string; name: string; nodes: Node[]; edges: Edge[] }>
}

export interface GenerateFlowResponse {
  message: string
  flowData?: {
    nodes: Node[]
    edges: Edge[]
    nodeOrder?: string[]
  }
  updates?: {
    nodes?: Node[]
    edges?: Edge[]
    description?: string
    removeNodeIds?: string[]
    removeEdges?: Array<{ source: string; target: string; sourceHandle?: string }>
    positionShifts?: Array<{ nodeId: string; dx: number }>
  }
  action: "create" | "edit" | "suggest" | "save_as_template"
  templateMetadata?: {
    suggestedName: string
    description: string
    aiMetadata: TemplateAIMetadata
  }
  warnings?: string[]
  debugData?: Record<string, unknown>
}

/**
 * Deduplicate edges so each source+sourceHandle pair has exactly one outgoing edge.
 * Keeps the first edge encountered for each key (first-wins).
 */
export function deduplicateEdges(edges: Edge[]): Edge[] {
  const edgeKeyMap = new Map<string, Edge>()
  edges.forEach((edge) => {
    const edgeKey = `${edge.source}-${edge.sourceHandle || "default"}`
    if (!edgeKeyMap.has(edgeKey)) {
      edgeKeyMap.set(edgeKey, edge)
    }
  })
  return Array.from(edgeKeyMap.values())
}

/**
 * AI Tool: Generate or Edit Flow
 * Determines mode (create vs edit), delegates to the appropriate handler,
 * and provides a text-generation fallback if structured output fails.
 */
export async function generateFlow(
  request: GenerateFlowRequest
): Promise<GenerateFlowResponse | null> {
  try {
    const aiClient = getAIClient()
    const platformGuidelines = getPlatformGuidelines(request.platform)

    // A canvas with only the start node is a fresh flow → create mode
    const hasRealNodes = request.existingFlow &&
      request.existingFlow.nodes.some(n => n.type !== "start")
    const hasEdges = request.existingFlow &&
      request.existingFlow.edges.length > 0
    const isEditRequest = Boolean(hasRealNodes || hasEdges)

    // Build template resolver from user template data
    const templateResolver: TemplateResolver | undefined = request.userTemplateData
      ? (id: string) => {
          const tpl = request.userTemplateData!.find(t => t.id === id)
          return tpl ? { nodes: tpl.nodes, edges: tpl.edges } : null
        }
      : undefined

    const systemPrompt = buildSystemPrompt(request, platformGuidelines, isEditRequest)
    const userPrompt = buildUserPrompt(request, isEditRequest)

    try {
      if (isEditRequest) {
        return await executeEditMode(request, systemPrompt, userPrompt, templateResolver)
      } else {
        return await executeCreateMode(request, systemPrompt, userPrompt, templateResolver)
      }
    } catch (error) {
      console.warn("[generate-flow] Structured output failed, falling back to text generation:", error)
      return await handleFallback(aiClient, request, systemPrompt, userPrompt, isEditRequest, templateResolver)
    }
  } catch (error) {
    console.error("[generate-flow] Error generating flow:", error)
    return null
  }
}

async function handleFallback(
  aiClient: ReturnType<typeof getAIClient>,
  request: GenerateFlowRequest,
  systemPrompt: string,
  userPrompt: string,
  isEditRequest: boolean,
  templateResolver: TemplateResolver | undefined,
): Promise<GenerateFlowResponse | null> {
  const response = await aiClient.generate({
    systemPrompt,
    userPrompt,
    temperature: 0.7,
    maxTokens: 2000,
    model: isEditRequest ? 'claude-sonnet' : 'claude-haiku',
  })

  const content = response.text
  if (!content) {
    console.error("[generate-flow] No content in AI response")
    return null
  }

  // Try to parse as plan
  try {
    const extracted = aiClient.extractJSON(content)
    const jsonText = extracted || content
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const rawPlan = JSON.parse(jsonMatch[0])

      if (isEditRequest) {
        const editPlan = editFlowPlanSchema.parse(rawPlan)
        const existingNodes = request.existingFlow?.nodes || []
        const existingEdgesFallback = request.existingFlow?.edges || []
        const { newNodes, newEdges, nodeUpdates, removeNodeIds, removeEdges, positionShifts, warnings } = buildEditFlowFromPlan(
          editPlan,
          request.platform,
          existingNodes,
          existingEdgesFallback,
          templateResolver
        )
        const updatedNodes = applyNodeUpdates(nodeUpdates, existingNodes)

        return {
          message: editPlan.message || "Flow updated successfully",
          updates: {
            nodes: [...updatedNodes, ...newNodes],
            edges: newEdges,
            description: editPlan.description,
            removeNodeIds: removeNodeIds.length > 0 ? removeNodeIds : undefined,
            removeEdges: removeEdges.length > 0 ? removeEdges : undefined,
            positionShifts: positionShifts.length > 0 ? positionShifts : undefined,
          },
          action: "edit",
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      } else {
        const plan = flowPlanSchema.parse(rawPlan)
        const build = buildFlowFromPlan(plan, request.platform, templateResolver)

        const validation = validateGeneratedFlow(build.nodes, build.edges, request.platform)
        const allWarnings = [
          ...build.warnings,
          ...validation.issues.map(i => `[${i.type}] ${i.detail}`),
        ]

        return {
          message: plan.message || "Flow generated successfully",
          flowData: { nodes: build.nodes, edges: build.edges, nodeOrder: build.nodeOrder },
          action: "create",
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
        }
      }
    }
  } catch (planError) {
    console.warn("[generate-flow] Plan fallback parse failed:", planError)
  }

  return {
    message: content || "I've processed your request. Please review the flow.",
    action: isEditRequest ? "edit" as const : "suggest" as const,
  }
}
