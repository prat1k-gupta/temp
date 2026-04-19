import { getAIClient } from "../core/ai-client"
import { getPlatformGuidelines } from "../core/ai-context"
import type { Platform, TemplateAIMetadata, TemplateResolver, ApprovedTemplate } from "@/types"
import type { Node, Edge } from "@xyflow/react"
import { editFlowPlanSchema, flowPlanSchema } from "@/types/flow-plan"
import { buildFlowFromPlan, buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import { fetchApprovedTemplates } from "./list-approved-templates"
import { validateGeneratedFlow } from "@/utils/flow-validator"
import { buildSystemPrompt, buildUserPrompt } from "./flow-prompts"
import { executeEditMode, executeEditModeStreaming, applyNodeUpdates } from "./generate-flow-edit"
import { executeCreateMode } from "./generate-flow-create"
import { executeCreateModeStreaming } from "./generate-flow-create-streaming"

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
  toolContext?: {
    publishedFlowId?: string
    waAccountName?: string
    authHeader?: string
    /** Project metadata for publish_flow tool. All optional — tool only appears when projectId + authHeader are present. */
    projectId?: string
    projectName?: string
    triggerKeywords?: string[]
    triggerMatchType?: string
    flowSlug?: string
    waAccountId?: string
    waPhoneNumber?: string
    userTimezone?: string
    currentTime?: string
    /**
     * Catalog of Meta-approved WhatsApp templates for the current account,
     * fetched once at session start and passed to the flow-plan builder so
     * templateMessage nodes are resolved authoritatively by (name, language)
     * rather than trusting model-supplied templateId / bodyPreview /
     * parameterMappings. Not surfaced to the AI in the prompt — the AI
     * still discovers templates via the `list_approved_templates` tool
     * when it wants to see bodies/variables. This field is the builder's
     * private reference.
     */
    approvedTemplates?: ApprovedTemplate[]
  }
  /** Agent API context. When source is "agent_api", downstream code may skip UI-specific fields. */
  context?: { source: "agent_api" | "ui" }
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
  /** True if publish_flow tool saved a version during this session — caller should skip duplicate createVersion. */
  versionSavedByTool?: boolean
  templateMetadata?: {
    suggestedName: string
    description: string
    aiMetadata: TemplateAIMetadata
  }
  warnings?: string[]
  debugData?: Record<string, unknown>
}

/**
 * Structured details for a completed tool step. Rendered by the chat UI as
 * an expandable activity log underneath the tool step's headline.
 */
export type ToolStepDetails =
  | {
      kind: 'edit'
      added: NodeBrief[]
      removed: NodeBrief[]
      updated: UpdateBrief[]
      edgesAdded: number
      edgesRemoved: number
    }
  | {
      kind: 'validate'
      valid: boolean
      issues: Array<{ type?: string; nodeLabel?: string; detail: string }>
    }

export interface NodeBrief {
  type: string
  label?: string
  preview?: string
}

export interface UpdateBrief {
  type: string
  label?: string
  fields: string[]
}

export type StreamEvent =
  | {
      type: 'tool_step'
      tool: string
      status: 'running' | 'done'
      summary?: string
      details?: ToolStepDetails
    }
  | { type: 'text_delta'; delta: string }
  | {
      type: 'flow_ready'
      flowData?: GenerateFlowResponse['flowData']
      updates?: GenerateFlowResponse['updates']
      action: 'create' | 'edit'
      warnings?: string[]
      debugData?: Record<string, unknown>
    }
  | { type: 'result'; data: GenerateFlowResponse }
  | { type: 'error'; message: string }

/** Short preview string from a node's content fields, truncated for display. */
function previewFromData(data: Record<string, any> | undefined): string | undefined {
  if (!data) return undefined
  const text = data.question || data.text || data.message
  if (typeof text !== 'string' || !text.trim()) return undefined
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed
}

/** Friendly short label for a node type (e.g., "whatsappQuickReply" → "Quick Reply"). */
function friendlyNodeType(type: string | undefined): string {
  if (!type) return 'node'
  const base = type
    .replace(/^whatsapp|^instagram|^web|^line/i, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
  return base.charAt(0).toUpperCase() + base.slice(1) || type
}

/**
 * Derive a headline + structured details from a tool execution result. Tools
 * that want rich rendering in the chat UI include a `details` field directly
 * on their return value (see apply_edit / validate_result); this function
 * pulls it through and picks the right summary line.
 */
export function buildToolStepPayload(
  toolName: string,
  result: unknown,
): { summary?: string; details?: ToolStepDetails } {
  const r = result as Record<string, any> | null
  if (!r) return {}
  const details = r.details as ToolStepDetails | undefined
  switch (toolName) {
    case 'apply_edit': {
      if (!r.summary) {
        return { summary: r.error ? `Error: ${r.error}` : undefined, details }
      }
      const totalChanges =
        (r.summary.newNodes || 0) +
        (r.summary.nodeUpdates || 0) +
        (r.summary.removedNodes || 0)
      const summary =
        totalChanges > 0
          ? 'Applied edit'
          : r.summary.newEdges > 0
          ? `Rewired ${r.summary.newEdges} edge${r.summary.newEdges > 1 ? 's' : ''}`
          : 'No changes applied'
      return { summary, details }
    }
    case 'validate_result': {
      const issueCount = Array.isArray(r.issues) ? r.issues.length : r.issueCount || 0
      const summary = r.valid
        ? 'No issues found'
        : `Found ${issueCount} issue${issueCount > 1 ? 's' : ''}`
      return { summary, details }
    }
    case 'get_node_details':
      return { summary: r.type ? `Inspected ${friendlyNodeType(r.type)} node` : undefined, details }
    case 'get_node_connections':
      return { summary: r.nodeId ? `Checked connections for ${r.nodeId}` : undefined, details }
    case 'build_and_validate':
      if (r.success) {
        return {
          summary: r.summary
            ? `Built ${r.summary.nodes} nodes, ${r.summary.edges} edges — valid`
            : 'Flow validated',
          details,
        }
      }
      return {
        summary: r.issueCount
          ? `Found ${r.issueCount} issue${r.issueCount > 1 ? 's' : ''} — fixing...`
          : r.error
          ? `Error: ${r.error}`
          : undefined,
        details,
      }
    case 'publish_flow':
      if (r.error) return { summary: `Error: ${r.error}`, details }
      if (r.already_published) return { summary: `Already published (v${r.version})`, details }
      return { summary: r.message || `Published v${r.version}`, details }
    default:
      return { details }
  }
}

/** Back-compat shim for callers that only need the string summary. */
export function buildToolSummary(toolName: string, result: unknown): string | undefined {
  return buildToolStepPayload(toolName, result).summary
}

/** Build a NodeBrief from a raw node (for tool return details). */
export function nodeBrief(node: { type?: string; data?: any } | null | undefined): NodeBrief | null {
  if (!node) return null
  return {
    type: friendlyNodeType(node.type),
    label: (node.data as any)?.label,
    preview: previewFromData(node.data),
  }
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
 * Populate request.toolContext.approvedTemplates with the current account's
 * approved WhatsApp templates. Fetched once per session so the flow-plan
 * builder can resolve templateMessage nodes by (name, language) instead of
 * trusting model-supplied templateId / bodyPreview.
 *
 * Only runs for WhatsApp flows with auth context — other platforms don't
 * have Meta templates. Failure is silent (logged) so a temporary fetch
 * error doesn't block the whole AI session; the builder's passthrough
 * fallback covers it.
 *
 * NOTE: mutates `request.toolContext` in place. The idempotency guard
 * (returns early when approvedTemplates is already set) makes re-entry
 * cheap, but callers should treat `request` as owned by this function
 * for the duration of the session.
 */
async function primeApprovedTemplates(request: GenerateFlowRequest): Promise<void> {
  if (request.platform !== "whatsapp") return
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  const authHeader = request.toolContext?.authHeader
  if (!apiUrl || !authHeader) return
  if (request.toolContext?.approvedTemplates) return // already primed

  const result = await fetchApprovedTemplates(apiUrl, authHeader)
  if (!result.success) {
    console.warn("[generate-flow] Failed to prime approved templates:", result.error)
    return
  }
  request.toolContext = { ...(request.toolContext || {}), approvedTemplates: result.templates }
}

/**
 * Decide whether a request should run as an edit (tool-use agent with 21
 * tools including the broadcast/campaign family) or as a create (2-tool
 * plan-generation agent). Shared by generateFlow + generateFlowStreaming
 * so the non-streaming and streaming paths agree.
 *
 * Rules:
 *  - Canvas has real nodes or any edge → edit. The AI is modifying something
 *    that already exists.
 *  - Empty canvas + prompt mentions broadcast/campaign keywords → edit,
 *    because only the edit agent has the campaign tools the user is asking
 *    for (see promptImpliesBroadcast).
 *  - **Exception**: when the request originates from the public Agent API's
 *    create endpoint (POST /api/v1/agent/flows, empty canvas), stay in
 *    create mode regardless of keywords. That endpoint can't support
 *    publish_flow / create_campaign mid-stream — the project row is saved
 *    by the route handler AFTER the stream ends. Callers schedule broadcasts
 *    in a follow-up POST /api/v1/agent/flows/{id}/edit once the flow_id
 *    exists. The in-app chat and the agent-API /edit endpoint still get
 *    broadcast-aware promotion — they always have project context.
 */
function decideRequestMode(request: GenerateFlowRequest): boolean {
  const hasRealNodes = Boolean(request.existingFlow &&
    request.existingFlow.nodes.some(n => n.type !== "start"))
  const hasEdges = Boolean(request.existingFlow &&
    request.existingFlow.edges.length > 0)
  const isAgentApiCreate = request.context?.source === "agent_api" &&
    !hasRealNodes && !hasEdges
  return (hasRealNodes || hasEdges) ||
    (!isAgentApiCreate && promptImpliesBroadcast(request.prompt))
}

/**
 * promptImpliesBroadcast returns true when the user's instruction references
 * broadcasting / scheduling a campaign. Used to force the edit-mode agent
 * (which has the 11 broadcast/campaign tools) even for a canvas that only
 * has a start node — otherwise the create-mode agent runs with just 2 flow-
 * generation tools, the model has no way to actually invoke preview/create
 * campaign, and it hallucinates XML-tag-shaped pretend-tool output.
 *
 * Whole-word match on a small keyword set — a phrase like "I'm creating
 * a flow to send a broadcast" triggers correctly, while "don't schedule
 * this meeting" shouldn't appear in flow-builder prompts. Acceptable
 * false-positive rate for the upside of tools always being available
 * when the user expects them.
 */
function promptImpliesBroadcast(prompt: string | undefined | null): boolean {
  if (!prompt) return false
  return /\b(broadcast|broadcasts|broadcasting|campaign|campaigns|schedule|scheduled|scheduling|audience)\b/i.test(prompt)
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
    await primeApprovedTemplates(request)
    const aiClient = getAIClient()
    const platformGuidelines = getPlatformGuidelines(request.platform)

    const isEditRequest = decideRequestMode(request)

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
    model: 'claude-sonnet',
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
          templateResolver,
          request.toolContext?.approvedTemplates,
        )
        const updatedNodes = applyNodeUpdates(nodeUpdates, existingNodes, request.platform)

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
        const build = buildFlowFromPlan(plan, request.platform, templateResolver, request.toolContext?.approvedTemplates)

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

/**
 * Streaming variant of generateFlow.
 * Edit mode streams tool steps + text deltas via emit callback.
 * Create mode runs blocking then emits a single result event.
 */
export async function generateFlowStreaming(
  request: GenerateFlowRequest,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  try {
    await primeApprovedTemplates(request)
    const aiClient = getAIClient()
    const platformGuidelines = getPlatformGuidelines(request.platform)

    const isEditRequest = decideRequestMode(request)

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
        await executeEditModeStreaming(request, systemPrompt, userPrompt, templateResolver, emit)
      } else {
        await executeCreateModeStreaming(request, systemPrompt, userPrompt, templateResolver, emit)
      }
    } catch (error) {
      console.warn("[generate-flow] Streaming failed, falling back:", error)
      const fallback = await handleFallback(aiClient, request, systemPrompt, userPrompt, isEditRequest, templateResolver)
      if (fallback) {
        emit({ type: 'result', data: fallback })
      } else {
        emit({ type: 'error', message: 'Flow generation failed after fallback' })
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error("[generate-flow] Streaming error:", error)
    emit({ type: 'error', message })
  }
}
