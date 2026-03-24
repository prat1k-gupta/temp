import { getAIClient } from "../core/ai-client"
import { getPlatformGuidelines } from "../core/ai-context"
import { getSimplifiedNodeDocumentation, getNodeSelectionRules, getNodeDependencies, getUserTemplateDocumentation } from "../core/node-documentation"
import { NODE_TEMPLATES } from "@/constants/node-categories"
import { NODE_TYPE_MAPPINGS } from "@/constants/node-types"
import type { Platform, TemplateAIMetadata } from "@/types"
import type { Node, Edge } from "@xyflow/react"
import { z } from "zod"
import { generateText, tool, stepCountIs } from "ai"
import { getModel } from "../core/models"
import { flowPlanSchema, editFlowPlanSchema } from "@/types/flow-plan"
import type { FlowPlan, EditFlowPlan } from "@/types/flow-plan"
import { buildFlowFromPlan, buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import type { BuildEditFlowResult } from "@/utils/flow-plan-builder"
import { isMultiOutputType, getFixedHandles } from "@/utils/platform-helpers"
import { collectFlowVariables } from "@/utils/flow-variables"

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
  action: "create" | "edit" | "suggest"
  warnings?: string[]
  debugData?: Record<string, unknown>
}

function getNodeTypeLabel(nodeType: string): string {
  // Strip platform prefix (e.g. "whatsappQuestion" → "Question")
  if (nodeType.includes("Question")) return "Question"
  if (nodeType.includes("QuickReply")) return "Quick Reply"
  if (nodeType.includes("List")) return "List"

  const template = NODE_TEMPLATES.find(t => t.type === nodeType)
  return template?.label || nodeType.charAt(0).toUpperCase() + nodeType.slice(1)
}

/**
 * Deduplicate edges so each source+sourceHandle pair has exactly one outgoing edge.
 * For button nodes: each button (button-0, button-1, etc.) connects to one target.
 * For non-button nodes: one outgoing edge per node (sourceHandle defaults to 'default').
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
 * Build a human-readable tree representation of the flow graph.
 * Walks the graph via DFS from the start node, showing button labels,
 * convergence points, cycles, and disconnected nodes.
 */
export function buildFlowGraphString(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) return "(empty flow)"

  // Build adjacency: source+sourceHandle → target
  const adjacency = new Map<string, Array<{ target: string; sourceHandle?: string }>>()
  for (const edge of edges) {
    const key = edge.source
    if (!adjacency.has(key)) adjacency.set(key, [])
    adjacency.get(key)!.push({ target: edge.target, sourceHandle: edge.sourceHandle || undefined })
  }

  const nodeMap = new Map<string, Node>(nodes.map(n => [n.id, n]))

  // Find start node
  const startNode = nodes.find(n => n.type === "start")
  const startId = startNode?.id || "1"

  const visited = new Set<string>()
  const dfsStack = new Set<string>() // for cycle detection
  const lines: string[] = ["Flow Graph:\n"]

  function getNodeSummary(node: Node): string {
    const data = node.data as any
    const label = data?.label || ""
    const question = typeof data?.question === "string" ? data.question : ""
    const text = typeof data?.text === "string" ? data.text : ""
    const storeAs = typeof data?.storeAs === "string" ? data.storeAs : ""
    const displayText = question || text
    const labelPart = label ? ` ${label}` : ""
    const contentPart = displayText ? ` — "${displayText.substring(0, 60)}${displayText.length > 60 ? "..." : ""}"` : ""
    const storeAsPart = storeAs ? ` {storeAs: "${storeAs}"}` : ""

    // Flow template nodes: show as collapsed with internal node count
    if (node.type === "flowTemplate") {
      const templateName = data?.templateName || label
      const nodeCount = data?.nodeCount || data?.internalNodes?.length || 0
      return `[${node.id}] [Template: ${templateName}] (flowTemplate) — ${nodeCount} internal nodes`
    }

    return `[${node.id}]${labelPart} (${node.type})${contentPart}${storeAsPart}`
  }

  function getButtonLabel(node: Node, sourceHandle: string | undefined): string | null {
    if (!sourceHandle) return null
    const buttons: Array<{ text?: string; label?: string; id?: string }> = (node.data as any)?.buttons || []
    const options: Array<{ text?: string; id?: string }> = (node.data as any)?.options || []
    // Match by handle ID like "button-0", "button-1"
    const match = sourceHandle.match(/^button-(\d+)$/)
    if (match) {
      const idx = parseInt(match[1], 10)
      if (idx < buttons.length) {
        return buttons[idx]?.text || buttons[idx]?.label || `Button ${idx}`
      }
    }
    // Match by handle ID like "option-0", "option-1"
    const optMatch = sourceHandle.match(/^option-(\d+)$/)
    if (optMatch) {
      const idx = parseInt(optMatch[1], 10)
      if (idx < options.length) {
        return options[idx]?.text || `Option ${idx}`
      }
    }
    // Also try matching by button.id
    const byId = buttons.find(b => b.id === sourceHandle)
    if (byId) return byId.text || byId.label || sourceHandle
    // Also try matching by option.id
    const byOptId = options.find(o => o.id === sourceHandle)
    if (byOptId) return byOptId.text || sourceHandle
    // API fetch success/error handles
    if (sourceHandle === "success") return "Success"
    if (sourceHandle === "error") return "Error"
    // Handle "next-step" or other named handles
    if (sourceHandle === "next-step") return null
    return null
  }

  function getButtonIndex(node: Node, sourceHandle: string | undefined): number {
    if (!sourceHandle) return Infinity
    const buttons: Array<{ text?: string; label?: string; id?: string }> = (node.data as any)?.buttons || []
    const options: Array<{ text?: string; id?: string }> = (node.data as any)?.options || []
    // Check button-N index handles
    const btnMatch = sourceHandle.match(/^button-(\d+)$/)
    if (btnMatch) return parseInt(btnMatch[1], 10)
    // Check option-N index handles
    const optMatch = sourceHandle.match(/^option-(\d+)$/)
    if (optMatch) return buttons.length + parseInt(optMatch[1], 10)
    // Check by button.id
    const btnIdx = buttons.findIndex(b => b.id === sourceHandle)
    if (btnIdx !== -1) return btnIdx
    // Check by option.id (offset by buttons length to avoid collisions)
    const optIdx = options.findIndex(o => o.id === sourceHandle)
    if (optIdx !== -1) return buttons.length + optIdx
    return Infinity
  }

  function dfs(nodeId: string, prefix: string, connector: string) {
    const node = nodeMap.get(nodeId)
    if (!node) return

    // Cycle detection
    if (dfsStack.has(nodeId)) {
      lines.push(`${prefix}${connector} [${nodeId}] (cycle)`)
      return
    }

    // Already visited — convergence
    if (visited.has(nodeId)) {
      lines.push(`${prefix}${connector} ${getNodeSummary(node)} (see above)`)
      return
    }

    visited.add(nodeId)
    dfsStack.add(nodeId)

    lines.push(`${prefix}${connector} ${getNodeSummary(node)}`)

    // Get children
    const children = adjacency.get(nodeId) || []

    // Show output handles for multi-output nodes
    const isButtonNode = node.type ? isMultiOutputType(node.type) : false
    const fixedHandles = node.type ? getFixedHandles(node.type) : null
    const buttons: Array<{ text?: string; label?: string; id?: string }> = (node.data as any)?.buttons || []
    const options: Array<{ text?: string; id?: string }> = (node.data as any)?.options || []

    if (fixedHandles) {
      // Fixed-handle nodes (apiFetch): show "success" and "error" handles
      const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")
      lines.push(`${childPrefix}│ Handles: [${fixedHandles.map(h => `"${h}" (handle: ${h})`).join(", ")}]`)
    } else if (isButtonNode && (buttons.length > 0 || options.length > 0)) {
      const seen = new Set<string>()
      const items: string[] = []
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i]
        const handle = b.id || `button-${i}`
        if (!seen.has(handle)) {
          seen.add(handle)
          items.push(`"${b.text || b.label || "?"}" (handle: ${handle})`)
        }
      }
      for (let i = 0; i < options.length; i++) {
        const o = options[i]
        const handle = o.id || `option-${i}`
        if (!seen.has(handle)) {
          seen.add(handle)
          items.push(`"${o.text || "?"}" (handle: ${handle})`)
        }
      }
      const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")
      lines.push(`${childPrefix}│ Buttons: [${items.join(", ")}]`)
    }

    if (children.length === 0) {
      dfsStack.delete(nodeId)
      return
    }

    const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")

    // For button nodes: sort by button order, filter out redundant unlabeled edges
    // (stale edges whose target is already reached by a labeled button edge)
    let sortedChildren = children
    if (isButtonNode) {
      const labeledTargets = new Set(
        children
          .filter(c => getButtonLabel(node, c.sourceHandle) !== null)
          .map(c => c.target)
      )
      sortedChildren = children
        .filter(c => {
          // Keep all labeled edges; drop unlabeled edges to targets already covered
          if (getButtonLabel(node, c.sourceHandle) !== null) return true
          return !labeledTargets.has(c.target)
        })
        .sort((a, b) => {
          const aLabel = getButtonLabel(node, a.sourceHandle)
          const bLabel = getButtonLabel(node, b.sourceHandle)
          const aIdx = aLabel ? getButtonIndex(node, a.sourceHandle) : Infinity
          const bIdx = bLabel ? getButtonIndex(node, b.sourceHandle) : Infinity
          return aIdx - bIdx
        })
    }

    sortedChildren.forEach((child, idx) => {
      const isLast = idx === sortedChildren.length - 1
      const childConnector = isLast ? "└→ " : "├→ "
      const buttonLabel = getButtonLabel(node, child.sourceHandle)
      if (buttonLabel) {
        const labelPrefix = isLast ? "└─ " : "├─ "
        const handleInfo = child.sourceHandle ? ` [handle: ${child.sourceHandle}]` : ""
        lines.push(`${childPrefix}${labelPrefix}"${buttonLabel}"${handleInfo} →`)
        const deeperPrefix = childPrefix + (isLast ? "   " : "│  ")
        dfs(child.target, deeperPrefix, "└→ ")
      } else {
        dfs(child.target, childPrefix, childConnector)
      }
    })

    dfsStack.delete(nodeId)
  }

  // Walk from start
  dfs(startId, "", "")

  // Find disconnected nodes
  const disconnected = nodes.filter(n => !visited.has(n.id) && n.type !== "start")
  if (disconnected.length > 0) {
    lines.push("\nDisconnected Nodes:")
    for (const node of disconnected) {
      lines.push(`  ${getNodeSummary(node)}`)
    }
  }

  return lines.join("\n")
}

/**
 * Process flow response (from structured output or parsed text)
 */
function processFlowResponse(
  parsed: any,
  platform: Platform,
  isEdit: boolean,
  existingFlow?: { nodes: Node[]; edges: Edge[] }
): GenerateFlowResponse {
  try {
    // Process the parsed response
    if (parsed) {
      
      // Build valid node types dynamically from NODE_TEMPLATES
      const validNodeTypesSet = new Set<string>()
      for (const template of NODE_TEMPLATES) {
        if (!template.platforms.includes(platform)) continue
        // Add the base type
        validNodeTypesSet.add(template.type)
        // Add the platform-specific mapped type (e.g., question → whatsappQuestion)
        const mapped = NODE_TYPE_MAPPINGS[template.type]?.[platform]
        if (mapped) validNodeTypesSet.add(mapped)
      }
      
      // Calculate max X position from existing nodes (for better positioning)
      let maxX = 250 // Start node is at x: 250
      if (existingFlow && existingFlow.nodes.length > 0) {
        const existingMaxX = Math.max(...existingFlow.nodes.map(n => n.position.x || 0))
        maxX = Math.max(maxX, existingMaxX)
      }
      
      // Validate and transform nodes
      if (parsed.flowData?.nodes) {
        parsed.flowData.nodes = parsed.flowData.nodes
          // Filter out start nodes
          .filter((node: any) => node.type !== "start")
          // Filter to only valid nodes for this platform
          .filter((node: any) => validNodeTypesSet.has(node.type || ""))
          // Fix positioning and transform data
          .map((node: any, index: number) => {
            // Fix positioning: space nodes horizontally starting after existing nodes
            const xPosition = node.position?.x && node.position.x > 250
              ? node.position.x
              : maxX + 350 + (index * 350)
            const yPosition = node.position?.y || 150

            // Ensure label is always set
            const nodeLabel = node.data?.label || node.label || getNodeTypeLabel(node.type)

            return {
              ...node,
              position: {
                x: xPosition,
                y: yPosition,
              },
              data: {
                ...node.data,
                platform: node.data.platform || platform,
                label: nodeLabel,
              },
            }
          })
      }

      if (parsed.updates?.nodes) {
        parsed.updates.nodes = parsed.updates.nodes
          // Filter out start nodes
          .filter((node: any) => node.type !== "start")
          // Filter to only valid nodes for this platform
          .filter((node: any) => validNodeTypesSet.has(node.type || ""))
          // Fix positioning
          .map((node: any, index: number) => {
            // Fix positioning: space nodes horizontally
            // If node has a valid x position (> 250), use it, otherwise calculate
            const xPosition = node.position?.x && node.position.x > 250
              ? node.position.x
              : maxX + 350 + (index * 350)
            const yPosition = node.position?.y || 150
            
            // Ensure label is always set
            const nodeLabel = node.data?.label || node.label || getNodeTypeLabel(node.type)
            
            return {
              ...node,
              position: {
                x: xPosition,
                y: yPosition,
              },
              data: {
                ...node.data,
                platform: node.data.platform || platform,
                label: nodeLabel,
              },
            }
          })
      }

      // Fix edges: enforce one outgoing edge per sourceHandle (or one per node if no handle)
      if (parsed.flowData?.nodes && parsed.flowData?.edges) {
        parsed.flowData.edges = deduplicateEdges(parsed.flowData.edges)
        
        // Ensure nodes are connected, but don't force linear chains
        // Allow branching flows as designed by AI
        const nodeIds = parsed.flowData.nodes.map((n: any) => n.id).filter((id: string) => id !== "1") // Exclude start node
        const connectedSources = new Set(parsed.flowData.edges.map((e: Edge) => e.source))
        const connectedTargets = new Set(parsed.flowData.edges.map((e: Edge) => e.target))
        
        // Only connect orphaned nodes (nodes with no incoming edges except start)
        // Don't force sequential chains - respect AI's branching design
        const orphanedNodes = nodeIds.filter((id: string) => !connectedTargets.has(id) && id !== "1")
        
        // Connect orphaned nodes to the flow, but only if they're truly disconnected
        // Prefer connecting to start node if no other connection exists
        if (orphanedNodes.length > 0) {
          const firstOrphan = orphanedNodes[0]
          // Check if start node has any outgoing edges
          const startHasOutgoing = parsed.flowData.edges.some((e: Edge) => e.source === "1")
          
          if (!startHasOutgoing && firstOrphan) {
            // Connect first orphaned node to start
            const startEdge: Edge = {
              id: `e-1-${firstOrphan}`,
              source: "1",
              target: firstOrphan,
              type: "default",
              style: { stroke: "#6366f1", strokeWidth: 2 },
            }
            parsed.flowData.edges.push(startEdge)
            connectedTargets.add(firstOrphan)
          }
        }
      }

      if (parsed.updates?.edges) {
        parsed.updates.edges = deduplicateEdges(parsed.updates.edges)
      }

      // Validate node dependencies from NODE_TEMPLATES metadata
      const allNodes = [...(parsed.flowData?.nodes || []), ...(parsed.updates?.nodes || [])]
      const allBaseTypes = new Set(allNodes.map((n: any) => n.type?.toLowerCase()))
      for (const node of allNodes) {
        const template = NODE_TEMPLATES.find(t => t.type === node.type)
        if (template?.ai?.dependencies) {
          for (const dep of template.ai.dependencies) {
            if (!allBaseTypes.has(dep.toLowerCase())) {
              console.warn(`[generate-flow] "${node.type}" requires "${dep}" but it's missing from the flow`)
            }
          }
        }
      }

      return {
        message: parsed.message || "Flow generated successfully",
        flowData: parsed.flowData,
        updates: parsed.updates,
        action: parsed.action || (isEdit ? "edit" : "create"),
      }
    }

    // Fallback: Return message only
    return {
      message: "Flow generated successfully",
      action: isEdit ? "edit" : "create",
    }
  } catch (error) {
    console.error("[generate-flow] Error processing response:", error)
    return {
      message: "I've processed your request. Please review the flow.",
      action: isEdit ? "edit" : "suggest",
    }
  }
}

/**
 * Parse flow response from text (fallback method)
 */
function parseFlowResponse(
  content: string,
  platform: Platform,
  isEdit: boolean,
  existingFlow?: { nodes: Node[]; edges: Edge[] }
): GenerateFlowResponse {
  try {
    // Try to extract JSON from the response using enhanced extraction
    const aiClient = getAIClient()
    const extracted = aiClient.extractJSON(content)
    const jsonText = extracted || content
    
    // Try to find JSON object
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return processFlowResponse(parsed, platform, isEdit, existingFlow)
    }

    // Fallback: Return message only
    return {
      message: content,
      action: isEdit ? "edit" : "suggest",
    }
  } catch (error) {
    console.error("[generate-flow] Error parsing response:", error)
    return {
      message: content || "I've processed your request. Please review the flow.",
      action: isEdit ? "edit" : "suggest",
    }
  }
}

/**
 * AI Tool: Generate or Edit Flow
 * Creates a complete flow or edits an existing flow based on user prompt
 */
export async function generateFlow(
  request: GenerateFlowRequest
): Promise<GenerateFlowResponse | null> {
  try {
    const aiClient = getAIClient()
    const platformGuidelines = getPlatformGuidelines(request.platform)

    // Determine action type from prompt
    // A canvas with only the start node is a fresh flow → create mode
    const hasRealNodes = request.existingFlow &&
      request.existingFlow.nodes.some(n => n.type !== "start")
    const hasEdges = request.existingFlow &&
      request.existingFlow.edges.length > 0

    const isEditRequest =
      Boolean(hasRealNodes || hasEdges) ||
      request.prompt.toLowerCase().includes("edit") ||
      request.prompt.toLowerCase().includes("update") ||
      request.prompt.toLowerCase().includes("modify") ||
      request.prompt.toLowerCase().includes("change")

    const systemPrompt = buildSystemPrompt(request, platformGuidelines, isEditRequest)
    const userPrompt = buildUserPrompt(request, isEditRequest)

    // Try structured output first, fallback to text generation
    try {
      if (isEditRequest) {
        // EDIT MODE: Use tool-use so the AI can inspect nodes/edges before editing
        const existingNodes = request.existingFlow?.nodes || []
        const existingEdges = request.existingFlow?.edges || []
        let finalEditResult: BuildEditFlowResult | null = null as BuildEditFlowResult | null

        const result = await generateText({
          model: getModel('claude-sonnet'),
          system: systemPrompt,
          prompt: userPrompt,
          tools: {
            get_node_details: tool({
              description: 'Get full details of a node including button/option handle IDs, storeAs, and content. Call this before editing nodes with buttons/options to get exact handle IDs for attachHandle and removeEdges.',
              inputSchema: z.object({
                nodeId: z.string().describe('The node ID (e.g. "plan-quickReply-2-x7f3")'),
              }),
              execute: async ({ nodeId }) => {
                const node = existingNodes.find(n => n.id === nodeId)
                if (!node) return { error: `Node "${nodeId}" not found` }
                const data = node.data as Record<string, any>
                const details: Record<string, any> = {
                  id: node.id,
                  type: node.type,
                  label: data?.label,
                }
                if (data?.question) details.question = data.question
                if (data?.text) details.text = data.text
                if (data?.storeAs) details.storeAs = data.storeAs
                if (data?.buttons) {
                  details.buttons = (data.buttons as any[]).map((b: any, i: number) => ({
                    index: i, text: b.text || b.label, id: b.id, handleId: b.id || `button-${i}`,
                  }))
                }
                if (data?.options) {
                  details.options = (data.options as any[]).map((o: any, i: number) => ({
                    index: i, text: o.text, id: o.id, handleId: o.id || `option-${i}`,
                  }))
                }
                return details
              },
            }),

            get_node_connections: tool({
              description: 'Get all edges connected to a node (incoming and outgoing with handle IDs). Use this to know which edges to remove when rewiring.',
              inputSchema: z.object({
                nodeId: z.string().describe('The node ID to get connections for'),
              }),
              execute: async ({ nodeId }) => {
                const outgoing = existingEdges
                  .filter(e => e.source === nodeId)
                  .map(e => ({ target: e.target, sourceHandle: e.sourceHandle || 'default' }))
                const incoming = existingEdges
                  .filter(e => e.target === nodeId)
                  .map(e => ({ source: e.source, sourceHandle: e.sourceHandle || 'default' }))
                return { nodeId, outgoing, incoming }
              },
            }),

            apply_edit: tool({
              description: 'Apply an edit plan to the flow. Include ALL operations (chains, nodeUpdates, addEdges, removeNodeIds, removeEdges) in a SINGLE call. Do NOT split across multiple calls or call with an empty plan.',
              inputSchema: editFlowPlanSchema,
              execute: async (plan) => {
                try {
                  // Reject empty plans — prevents the AI from wasting a step
                  const hasOperations = (plan.chains && plan.chains.length > 0) ||
                    (plan.nodeUpdates && plan.nodeUpdates.length > 0) ||
                    (plan.addEdges && plan.addEdges.length > 0) ||
                    (plan.removeNodeIds && plan.removeNodeIds.length > 0) ||
                    (plan.removeEdges && plan.removeEdges.length > 0)
                  if (!hasOperations) {
                    return {
                      success: false,
                      error: 'Empty plan — no operations provided. If your edit is complete, just respond with your message. Do NOT call apply_edit again.',
                    }
                  }

                  const editResult = buildEditFlowFromPlan(
                    plan as EditFlowPlan,
                    request.platform,
                    existingNodes,
                    existingEdges
                  )
                  finalEditResult = editResult

                  console.log("[generate-flow] Tool apply_edit result:", {
                    newNodes: editResult.newNodes.length,
                    newEdges: editResult.newEdges.map(e => `${e.source} → ${e.target} (handle: ${e.sourceHandle || "default"})`),
                    nodeUpdates: editResult.nodeUpdates.length,
                    removeNodeIds: editResult.removeNodeIds,
                    removeEdges: editResult.removeEdges,
                    warnings: editResult.warnings,
                  })

                  return {
                    success: true,
                    summary: {
                      newNodes: editResult.newNodes.length,
                      newEdges: editResult.newEdges.length,
                      nodeUpdates: editResult.nodeUpdates.length,
                      removedNodes: editResult.removeNodeIds.length,
                      removedEdges: editResult.removeEdges.length,
                    },
                    warnings: editResult.warnings.length > 0 ? editResult.warnings : undefined,
                  }
                } catch (error) {
                  console.error("[generate-flow] Tool apply_edit error:", error)
                  return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error building edit',
                  }
                }
              },
            }),
          },
          stopWhen: stepCountIs(8),
          temperature: 0.3,
          onStepFinish: (step) => {
            const calls = step.toolCalls?.map((tc: any) => ({
              tool: tc.toolName,
              input: tc.toolName === 'apply_edit'
                ? { chains: tc.args?.chains?.length, nodeUpdates: tc.args?.nodeUpdates?.length, removeNodeIds: tc.args?.removeNodeIds?.length, addEdges: tc.args?.addEdges?.length }
                : tc.args,
            }))
            const results = step.toolResults?.map((tr: any) => ({
              tool: tr.toolName,
              result: tr.result,
            }))
            console.log(`[generate-flow] Step (${step.finishReason}):`, JSON.stringify({ calls, results }, null, 2))
          },
        })

        // Extract the AI's conversational message
        const aiMessage = result.text || 'Flow updated successfully'

        console.log("[generate-flow] Tool-use edit completed:", {
          steps: result.steps.length,
          hasEditResult: !!finalEditResult,
          message: aiMessage.substring(0, 100),
        })

        if (!finalEditResult) {
          // AI didn't call apply_edit — return message only
          return {
            message: aiMessage,
            action: "edit",
          }
        }

        // Convert nodeUpdates to full node objects for handleUpdateFlow
        const updatedNodes: Node[] = finalEditResult.nodeUpdates.map((update) => {
          const existing = existingNodes.find((n) => n.id === update.nodeId)
          if (!existing) return null
          return {
            ...existing,
            type: update.newType || existing.type,
            data: { ...existing.data, ...update.data },
          }
        }).filter(Boolean) as Node[]

        return {
          message: aiMessage,
          updates: {
            nodes: [...updatedNodes, ...finalEditResult.newNodes],
            edges: finalEditResult.newEdges,
            removeNodeIds: finalEditResult.removeNodeIds.length > 0 ? finalEditResult.removeNodeIds : undefined,
            removeEdges: finalEditResult.removeEdges.length > 0 ? finalEditResult.removeEdges : undefined,
            positionShifts: finalEditResult.positionShifts.length > 0 ? finalEditResult.positionShifts : undefined,
          },
          action: "edit",
          warnings: finalEditResult.warnings.length > 0 ? finalEditResult.warnings : undefined,
          debugData: {
            toolSteps: result.steps.length,
            toolTrace: result.steps.map((s: any) => ({
              finishReason: s.finishReason,
              toolCalls: s.toolCalls?.map((tc: any) => tc.toolName),
              warnings: s.toolResults?.flatMap((tr: any) => tr.result?.warnings || []),
            })),
          },
        }
      } else {
        // CREATE MODE: LLM outputs a semantic plan, code builds the flow
        // Use Haiku for speed — plan structure is simple and well-constrained by the schema
        const plan = await aiClient.generateJSON<FlowPlan>({
          systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
          userPrompt,
          schema: flowPlanSchema,
          model: 'claude-haiku',
        })

        // Convert plan → ReactFlow nodes + edges
        const { nodes, edges, nodeOrder, warnings } = buildFlowFromPlan(plan, request.platform)

        return {
          message: plan.message || "Flow generated successfully",
          flowData: { nodes, edges, nodeOrder },
          action: "create",
          warnings: warnings.length > 0 ? warnings : undefined,
          debugData: { rawPlan: plan },
        }
      }
    } catch (error) {
      console.warn("[generate-flow] Structured output failed, falling back to text generation:", error)

      // Fallback to text generation with parsing
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

      // Try to parse as plan first (both create and edit)
      try {
        const aiClientRef = getAIClient()
        const extracted = aiClientRef.extractJSON(content)
        const jsonText = extracted || content
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const rawPlan = JSON.parse(jsonMatch[0])

          if (isEditRequest) {
            const editPlan = editFlowPlanSchema.parse(rawPlan)
            const existingNodes = request.existingFlow?.nodes || []
            const { newNodes, newEdges, nodeOrder, nodeUpdates, removeNodeIds, removeEdges, positionShifts, warnings } = buildEditFlowFromPlan(
              editPlan,
              request.platform,
              existingNodes
            )
            const updatedNodes: Node[] = nodeUpdates.map((update) => {
              const existing = existingNodes.find((n) => n.id === update.nodeId)
              if (!existing) return null
              return {
                ...existing,
                type: update.newType || existing.type,
                data: { ...existing.data, ...update.data },
              }
            }).filter(Boolean) as Node[]

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
            const { nodes, edges, nodeOrder, warnings } = buildFlowFromPlan(plan, request.platform)
            return {
              message: plan.message || "Flow generated successfully",
              flowData: { nodes, edges, nodeOrder },
              action: "create",
              warnings: warnings.length > 0 ? warnings : undefined,
            }
          }
        }
      } catch (planError) {
        console.warn("[generate-flow] Plan fallback parse failed, using legacy parser:", planError)
      }

      // Final fallback: legacy parser (raw nodes/edges)
      const parsed = parseFlowResponse(content, request.platform, isEditRequest, request.existingFlow)
      return parsed
    }
  } catch (error) {
    console.error("[generate-flow] Error generating flow:", error)
    return null
  }
}

function buildSystemPrompt(
  request: GenerateFlowRequest,
  platformGuidelines: string,
  isEdit: boolean
): string {
  const action = isEdit ? "edit" : "create"

  // Both modes are plan-based now — use compact docs
  const nodeDocs = getSimplifiedNodeDocumentation(request.platform)
  const userTemplateDocs = getUserTemplateDocumentation(request.platform, request.userTemplates || [])

  const selectionRules = getNodeSelectionRules(request.platform, request.userTemplates)
  const dependencyRules = getNodeDependencies(request.platform)

  let prompt = `You are an expert conversational flow designer for ${request.platform} platforms.

Your task is to ${action} a conversational flow based on user requirements.

**Platform Guidelines:**
${platformGuidelines}

**${isEdit ? "COMPREHENSIVE NODE DOCUMENTATION" : "AVAILABLE NODE TYPES"}:**
${nodeDocs}${userTemplateDocs}

${selectionRules}
${dependencyRules ? `\n${dependencyRules}` : ""}

**Instructions:**
${isEdit ? getEditInstructions() : getCreateInstructions()}

**${isEdit ? "apply_edit Tool Input Format (examples)" : "Response Format (JSON)"}:**
${isEdit ? getEditResponseFormat() : getCreateResponseFormat()}`

  return prompt
}

function buildUserPrompt(request: GenerateFlowRequest, isEdit: boolean): string {
  let prompt = `User Request: ${request.prompt}
Platform: ${request.platform}`

  // Add flow context if provided
  if (request.flowContext) {
    prompt += `\n\nFlow Context: ${request.flowContext}`
  }

  // Add existing flow information if editing
  if (isEdit && request.existingFlow) {
    const startNode = request.existingFlow.nodes.find(n => n.type === "start")
    if (startNode) {
      prompt += `\n\nStart Node: id="${startNode.id}" (DO NOT create a new start node, connect to this one)`
    }

    // Tree-based flow representation
    const graphTree = buildFlowGraphString(request.existingFlow.nodes, request.existingFlow.edges)
    console.log("[generate-flow] Flow graph sent to AI:\n" + graphTree)
    prompt += `\n\n${graphTree}`

    // Focus area: if user has a node selected, scope edits around it
    if (request.selectedNode) {
      const sn = request.selectedNode
      const snLabel = (sn.data as any)?.label || ""
      prompt += `\n\n**Focus Area:** The user has node [${sn.id}] "${snLabel}" (${sn.type}) selected.`
      prompt += `\nApply your changes relative to this node. Do NOT modify nodes or edges far from this area unless explicitly asked.`
    }

    // Include available variables from existing nodes
    const existingVars = collectFlowVariables(request.existingFlow.nodes)
    if (existingVars.length > 0) {
      prompt += `\n\nAvailable variables (from storeAs fields — use {{variable_name}} to reference in messages):\n${existingVars.map(v => `  - {{${v}}}`).join("\n")}`
    }

    prompt += `\n\nIMPORTANT: Each source node can only have ONE edge per sourceHandle. If you need to change a connection, replace the existing edge.`
  }

  if (!isEdit) {
    prompt += `\n\nOnly include nodes that are directly relevant to the user's request. Do NOT add name, email, address, or other data-collection nodes unless the user asks for them or the flow logically requires them. Use quickReply for choices with branches.`
  }

  // Always include start node info for new flows
  if (!isEdit || !request.existingFlow) {
    prompt += `\n\nThe flow already has a start node — your first step connects to it automatically.`
  }

  // Add conversation history if available
  if (request.conversationHistory && request.conversationHistory.length > 0) {
    prompt += `\n\nConversation History:`
    request.conversationHistory.slice(-5).forEach((msg) => {
      prompt += `\n${msg.role}: ${msg.content}`
    })
  }

  return prompt
}

function getCreateInstructions(): string {
  // NOTE: Using array join to avoid esbuild template literal parse issues with { } chars
  return [
    'Output a semantic flow PLAN (not raw nodes/edges). The system will build the actual flow.',
    '',
    '**CRITICAL: Only use nodeType values from the "AVAILABLE NODE TYPES" list. Use BASE type names (e.g. "question", "quickReply"), NOT platform-prefixed names.**',
    '',
    '**Plan Structure:**',
    '- "steps" is an ordered array of NodeStep and BranchStep objects',
    '- NodeStep: \\{ "step": "node", "nodeType": "<base-type>", "content": \\{ ... \\} \\}',
    '- BranchStep: \\{ "step": "branch", "buttonIndex": <n>, "steps": [...] \\}',
    '  - Branches MUST follow a quickReply or interactiveList node',
    '  - buttonIndex 0 = first button, 1 = second, etc.',
    '',
    '**Content fields (all optional — factory provides defaults):**',
    '- question: string — for question, quickReply, interactiveList, super nodes',
    '- buttons: string[] — plain labels for quickReply (e.g. ["Yes", "No"])',
    '- options: string[] — plain labels for interactiveList',
    '- listTitle: string — for interactiveList',
    '- text: string — for whatsappMessage, instagramDM, instagramStory',
    '- label: string — custom display label (otherwise auto-generated)',
    '- message: string — for trackingNotification',
    '- storeAs: string — variable name to store the user\'s response (e.g. "selected_flavor"). ALWAYS provide this for question, quickReply, and interactiveList nodes so later nodes can reference the answer via {{storeAs_value}}.',
    '',
    '**CRITICAL — quickReply vs interactiveList:**',
    '- **≤3 choices → ALWAYS use quickReply** (with buttons[]). NEVER use interactiveList for 3 or fewer options.',
    '- **4+ choices → use interactiveList** (with options[] and listTitle).',
    '- This rule is absolute and has no exceptions.',
    '',
    '**VARIABLE INTERPOLATION (referencing previous answers):**',
    '- Nodes that collect input (question, quickReply, interactiveList, super nodes) store the user\'s response in a variable.',
    '- ALWAYS set `storeAs` in the content field for question, quickReply, and interactiveList nodes. Use short, descriptive snake_case names (e.g. "selected_flavor", "delivery_slot", "feedback_rating").',
    '- To reference a stored value in later messages/questions, use double curly braces: {{variable_name}}',
    '- **Button/list responses store TWO variables:** {{storeAs}} holds the internal ID, {{storeAs_title}} holds the display text the user chose. ALWAYS use {{storeAs_title}} when showing the user\'s choice in messages.',
    '- Example: A quickReply with storeAs "selected_flavor" → use {{selected_flavor_title}} in messages: "Great choice! We\'ll send you {{selected_flavor_title}} right away."',
    '- For text input nodes (question, super nodes), just use {{storeAs}} directly — there is no _title variant.',
    '- Super nodes have fixed variables: name→user_name, email→user_email, dob→user_dob, address→user_address.',
    '- **System variables** (available in all flows, no node needed): {{system.contact_name}}, {{system.phone_number}}. Use these in API bodies, messages, etc.',
    '- **Global variables** (organization-wide): {{global.variable_name}} — e.g. {{global.api_base_url}}, {{global.support_email}}.',
    '- NEVER use square brackets like [flavor] or [selected_flavor]. ALWAYS use {{variable_name}} with double curly braces.',
    '- Only reference variables from nodes that appear EARLIER in the flow (system/global variables are always available).',
    '',
    '**Key Rules:**',
    '- Only include nodes directly relevant to the user\'s request — do NOT add name, email, dob, or address unless the flow logically needs that data',
    '- **After a quickReply/interactiveList:**',
    '  - If ALL buttons lead to the SAME follow-up: place node steps directly after the quickReply (no branches needed) — every button will connect to the same node.',
    '  - If buttons lead to DIFFERENT paths: create a branch step for EVERY button (one per buttonIndex). **Every button MUST have a branch — buttons without branches become dead ends with no outgoing edge.**',
    '  - If branches converge to shared follow-up steps: place the shared steps AFTER all branch steps — they\'ll be created once and all branches will connect to them.',
    '  - Do NOT duplicate identical nodes inside every branch.',
    '  - **Do NOT nest quickReply/interactiveList inside a branch.** Keep flows flat — a branch should end with a message or simple node, not another quickReply that needs its own branches.',
    '- **apiFetch node** has TWO output handles: "success" and "error". After an apiFetch step, use branch steps with buttonIndex 0 for success path and buttonIndex 1 for error path.',
    '  - Content fields: url, method (GET/POST/PUT/DELETE), headers (object), body (JSON string — can include {{variables}}), responseMapping ({varName: "jsonPath"} e.g. {"user_id": "data.user_id"}), fallbackMessage (shown on error).',
    '  - responseMapping maps API response JSON paths to session variables usable as {{varName}} in later nodes.',
    '- Include integrations (metaAudience, shopify, etc.) only when relevant',
    '- Write full sentences for questions, not "Choose:" or "Select:"',
    '- Each branch must have a unique buttonIndex',
    '- Max branches per platform: web=10, whatsapp=3, instagram=3',
    '- Each branch should contain ONLY the steps that are UNIQUE to that button choice.',
  ].join("\n")
}

function getEditInstructions(): string {
  // NOTE: Using array join to avoid esbuild template literal parse issues with { } chars
  return [
    '**You have tools to inspect and edit the flow.** Follow this workflow:',
    '1. Call `get_node_details` / `get_node_connections` to inspect relevant nodes',
    '2. Call `apply_edit` ONCE with your COMPLETE edit plan — include ALL chains, edges, removals, and updates in a single call',
    '3. If apply_edit returns warnings, you may call it again with corrections — otherwise you are DONE, just respond with your message',
    '',
    '**CRITICAL RULES:**',
    '- **ONE apply_edit call** — put everything in a single call. Do NOT split across multiple calls.',
    '- **NEVER call apply_edit with an empty plan** — it will return an error.',
    '- **NEVER create disconnected nodes** — every new node MUST connect to the existing flow via chains (with connectTo) or addEdges.',
    '- Use BASE type names (e.g. "question", "quickReply"), NOT platform-prefixed names.',
    '',
    '**apply_edit Plan Structure:**',
    '- **chains**: add new nodes. Each: \\{ "attachTo": "<node-id>", "attachHandle": "<handle-id>", "steps": [...], "connectTo": "<node-id>" \\}',
    '  - attachHandle: use exact handle ID from get_node_details (required for quickReply/list nodes)',
    '  - connectTo: link last new node to an existing node. **Pair with removeEdges** to cut the old direct edge.',
    '- **nodeUpdates**: modify content on existing nodes (question, buttons, text, etc.). Use for text/button changes — do NOT recreate the node.',
    '- **addEdges**: new edges. \\{ "source": "<id>", "target": "<id>", "sourceButtonIndex": <n> \\}',
    '- **removeNodeIds**: delete nodes (also removes all their edges)',
    '- **removeEdges**: disconnect specific edges by source+target+sourceHandle',
    '',
    '**When to use what:**',
    '- Update text/buttons → nodeUpdates. **NEVER removeNodeIds + chain just to change content — that deletes all existing connections.**',
    '- Add more buttons to existing quickReply → nodeUpdates with FULL button list (system auto-converts to interactiveList if needed)',
    '- Change node type (e.g. question → quickReply) → removeNodeIds + chain (this is a REPLACE — only when type actually changes)',
    '- Insert node between A→C → removeEdges A→C + chain with connectTo',
    '- Rewire buttons to existing node → removeEdges + addEdges (no chains needed)',
    '',
    '**Content fields:** question, buttons[], options[], listTitle, text, label, message, storeAs',
    '- storeAs: ALWAYS set for question/quickReply/interactiveList. Use snake_case (e.g. "delivery_slot").',
    '',
    '**Variables:** Use {{var_name}} for text inputs, {{var_name_title}} for button/list selections. Super nodes: {{user_name}}, {{user_email}}, {{user_dob}}, {{user_address}}. System: {{system.contact_name}}, {{system.phone_number}}. Global: {{global.variable_name}}.',
    '',
    '**apiFetch node:** Has dual output handles "success" and "error". Use attachHandle "success" or "error" when chaining from an apiFetch node. Content: url, method, headers, body (JSON string with {{variables}}), responseMapping ({varName: "jsonPath"}), fallbackMessage.',
    '',
    '**Rules:**',
    '- ≤3 choices → quickReply. 4+ choices → interactiveList.',
    '- Minimum changes only. Do NOT touch unrelated nodes/edges.',
    '- Write full sentences for questions.',
    '- Max branches: web=10, whatsapp=3, instagram=3.',
    '- Use addEdges with sourceButtonIndex to connect new quickReply/list buttons to existing nodes (no chain needed).',
  ].join("\n")
}

function getCreateResponseFormat(): string {
  // NOTE: Using JSON.stringify + join to avoid esbuild template literal parse issues
  const example = JSON.stringify({
    message: "Created a sample delivery flow with feedback collection",
    steps: [
      { step: "node", nodeType: "quickReply", content: { question: "Choose a delivery slot for your sample.", buttons: ["Morning", "Afternoon", "Evening"], storeAs: "delivery_slot" } },
      { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Morning slot confirmed!" } }] },
      { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Afternoon slot confirmed!" } }] },
      { step: "branch", buttonIndex: 2, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Evening slot confirmed!" } }] },
      { step: "node", nodeType: "address" },
      { step: "node", nodeType: "homeDelivery" },
      { step: "node", nodeType: "question", content: { question: "How was your experience with the sample?", storeAs: "experience_rating" } },
      { step: "node", nodeType: "whatsappMessage", content: { text: "Thanks for sharing! Your {{delivery_slot_title}} delivery is on its way." } },
      { step: "node", nodeType: "metaAudience" },
    ],
  }, null, 2)

  return example + "\n\n" + [
    "**IMPORTANT:**",
    '- Use BASE node type names (question, quickReply, name, etc.) — NOT platform-prefixed',
    '- Only include information nodes (name, email, dob, address) when the flow needs that data — do NOT add them by default',
    "- Steps AFTER all branch steps become shared convergence nodes — all branches connect to them. Do NOT duplicate identical follow-up nodes inside every branch.",
    "- If ALL buttons lead to the same path, skip branches entirely and place steps directly after the quickReply.",
    "- **If using branches: create one branch for EVERY button.** A quickReply with 3 buttons needs exactly 3 branch steps (buttonIndex 0, 1, 2). Missing branches = disconnected buttons.",
    "- **Never nest a quickReply/interactiveList inside a branch.** Branches should end with simple nodes (message, question, etc.), not multi-button nodes that need their own sub-branches.",
    "- Add integrations only when relevant (metaAudience for WhatsApp/Instagram)",
    "- Write full, natural questions",
    "- Branches follow the last quickReply/interactiveList in the current scope",
  ].join("\n")
}

function getEditResponseFormat(): string {
  // NOTE: Using JSON.stringify to avoid esbuild template literal parse issues
  // 3 key examples covering the most common edit patterns
  const ex1 = JSON.stringify({
    message: "Inserted email collection before the feedback question",
    removeEdges: [{ source: "1", target: "plan-quickReply-1" }],
    chains: [{ attachTo: "1", steps: [{ step: "node", nodeType: "email" }], connectTo: "plan-quickReply-1" }],
  }, null, 2)

  const ex2 = JSON.stringify({
    message: "Added follow-up question after button and updated the main question",
    chains: [{
      attachTo: "plan-quickReply-2", attachHandle: "button-2",
      steps: [{ step: "node", nodeType: "question", content: { question: "What improvements would you suggest?", storeAs: "improvement_feedback" } }],
    }],
    nodeUpdates: [{ nodeId: "plan-quickReply-2", content: { question: "How was your experience with our product?" } }],
  }, null, 2)

  const ex3 = JSON.stringify({
    message: "Replaced the message node with a question and merged branches",
    removeNodeIds: ["plan-whatsappMessage-3"],
    removeEdges: [{ source: "plan-quickReply-1", target: "plan-question-4" }],
    chains: [{
      attachTo: "plan-quickReply-2", attachHandle: "button-1",
      steps: [{ step: "node", nodeType: "question", content: { question: "What could be better?", storeAs: "feedback" } }],
      connectTo: "plan-metaAudience-4",
    }],
    addEdges: [{ source: "plan-quickReply-1", target: "plan-question-2", sourceButtonIndex: 2 }],
  }, null, 2)

  return [
    "Example 1 — Insert node between two existing nodes:",
    ex1,
    "",
    "Example 2 — Add nodes after a button + update existing content:",
    ex2,
    "",
    "Example 3 — Replace node + rewire edges + merge branches:",
    ex3,
    "",
    "**Key rules:**",
    '- Use get_node_details and get_node_connections FIRST to get exact handle IDs and edges',
    '- "connectTo" + "removeEdges" go together — cut old edge, then insert via chain',
    '- "removeNodeIds" also removes all edges connected to those nodes',
    '- "addEdges" uses sourceButtonIndex (0-based) for button connections',
  ].join("\n")
}

