import { getAIClient } from "../core/ai-client"
import { getPlatformGuidelines } from "../core/ai-context"
import { getSimplifiedNodeDocumentation, getNodeSelectionRules, getNodeDependencies } from "../core/node-documentation"
import { NODE_TEMPLATES } from "@/constants/node-categories"
import { NODE_TYPE_MAPPINGS } from "@/constants/node-types"
import type { Platform } from "@/types"
import type { Node, Edge } from "@xyflow/react"
import { z } from "zod"
import { flowPlanSchema, editFlowPlanSchema } from "@/types/flow-plan"
import type { FlowPlan, EditFlowPlan } from "@/types/flow-plan"
import { buildFlowFromPlan, buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import { isMultiOutputType } from "@/utils/platform-helpers"
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
    const label = (node.data as any)?.label || ""
    const question = typeof (node.data as any)?.question === "string" ? (node.data as any).question : ""
    const text = typeof (node.data as any)?.text === "string" ? (node.data as any).text : ""
    const storeAs = typeof (node.data as any)?.storeAs === "string" ? (node.data as any).storeAs : ""
    const displayText = question || text
    const labelPart = label ? ` ${label}` : ""
    const contentPart = displayText ? ` — "${displayText.substring(0, 60)}${displayText.length > 60 ? "..." : ""}"` : ""
    const storeAsPart = storeAs ? ` {storeAs: "${storeAs}"}` : ""
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

    // Show button labels for quickReply / interactiveList nodes
    const isButtonNode = node.type ? isMultiOutputType(node.type) : false
    const buttons: Array<{ text?: string; label?: string; id?: string }> = (node.data as any)?.buttons || []
    const options: Array<{ text?: string; id?: string }> = (node.data as any)?.options || []

    if (isButtonNode && (buttons.length > 0 || options.length > 0)) {
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
        // EDIT MODE: LLM outputs an edit plan, code builds the new nodes
        const editPlan = await aiClient.generateJSON<EditFlowPlan>({
          systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
          userPrompt,
          schema: editFlowPlanSchema,
          model: 'claude-sonnet',
        })

        console.log("[generate-flow] Edit plan from AI:", JSON.stringify({
          chains: editPlan.chains?.length || 0,
          nodeUpdates: editPlan.nodeUpdates?.length || 0,
          removeNodeIds: editPlan.removeNodeIds?.length || 0,
          removeEdges: editPlan.removeEdges?.length || 0,
          addEdges: editPlan.addEdges?.length || 0,
        }))

        const existingNodes = request.existingFlow?.nodes || []
        const { newNodes, newEdges, nodeOrder, nodeUpdates, removeNodeIds, removeEdges, positionShifts, warnings } = buildEditFlowFromPlan(
          editPlan,
          request.platform,
          existingNodes
        )

        console.log("[generate-flow] Built edit result:", {
          newNodes: newNodes.length,
          newEdges: newEdges.map(e => `${e.source} → ${e.target} (handle: ${e.sourceHandle || "default"})`),
          nodeUpdates: nodeUpdates.length,
          removeNodeIds,
          removeEdges,
          positionShifts: positionShifts.length,
          warnings,
        })

        // Convert nodeUpdates to full node objects for handleUpdateFlow
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
          debugData: { rawPlan: editPlan },
        }
      } else {
        // CREATE MODE: LLM outputs a semantic plan, code builds the flow
        const plan = await aiClient.generateJSON<FlowPlan>({
          systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
          userPrompt,
          schema: flowPlanSchema,
          model: 'claude-sonnet',
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
        model: 'claude-sonnet',
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

  const selectionRules = getNodeSelectionRules(request.platform)
  const dependencyRules = getNodeDependencies(request.platform)

  let prompt = `You are an expert conversational flow designer for ${request.platform} platforms.

Your task is to ${action} a conversational flow based on user requirements.

**Platform Guidelines:**
${platformGuidelines}

**${isEdit ? "COMPREHENSIVE NODE DOCUMENTATION" : "AVAILABLE NODE TYPES"}:**
${nodeDocs}

${selectionRules}
${dependencyRules ? `\n${dependencyRules}` : ""}

**Instructions:**
${isEdit ? getEditInstructions() : getCreateInstructions()}

**Response Format (JSON):**
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
    '- NEVER use square brackets like [flavor] or [selected_flavor]. ALWAYS use {{variable_name}} with double curly braces.',
    '- Only reference variables from nodes that appear EARLIER in the flow.',
    '',
    '**Key Rules:**',
    '- Only include nodes directly relevant to the user\'s request — do NOT add name, email, dob, or address unless the flow logically needs that data',
    '- **After a quickReply/interactiveList:**',
    '  - If ALL buttons lead to the SAME follow-up: place node steps directly after the quickReply (no branches needed) — every button will connect to the same node.',
    '  - If buttons lead to DIFFERENT paths: use branch steps for the differing parts.',
    '  - If branches converge to shared follow-up steps: place the shared steps AFTER all branch steps — they\'ll be created once and all branches will connect to them.',
    '  - Do NOT duplicate identical nodes inside every branch.',
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
    'Output a semantic edit PLAN (not raw nodes/edges). The system will build the actual nodes.',
    '',
    '**CRITICAL: Only use nodeType values from the "AVAILABLE NODE TYPES" list. Use BASE type names (e.g. "question", "quickReply"), NOT platform-prefixed names.**',
    '',
    '**Edit Plan Structure:**',
    '',
    '1. **chains** — add new nodes attached to existing nodes',
    '   - Each chain: \\{ "attachTo": "<existing-node-id>", "steps": [...] \\}',
    '   - attachTo: the ID of an existing node to connect from',
    '   - attachHandle: e.g. "button-0" to branch from a specific button. **REQUIRED when attachTo is a quickReply or interactiveList node** — without it, the connection goes to the "next-step" handle instead of a button, which is usually wrong.',
    '   - connectTo: optional, connect the LAST node in this chain to an existing node (for inserting between nodes)',
    '   - steps: same as create mode (NodeStep and BranchStep objects)',
    '',
    '2. **removeNodeIds** — array of existing node IDs to delete from the canvas',
    '',
    '3. **removeEdges** — array of edges to disconnect: \\{ "source": "node-id", "target": "node-id", "sourceHandle": "optional" \\}',
    '',
    '4. **nodeUpdates** — modify existing node content without replacing them',
    '   - Each: \\{ "nodeId": "<existing-node-id>", "content": \\{ question?, text?, buttons?, label?, ... \\} \\}',
    '',
    '5. **addEdges** — create new edges between existing or newly-created nodes',
    '   - Each: \\{ "source": "<node-id>", "target": "<node-id>", "sourceButtonIndex": <n> \\}',
    '   - sourceButtonIndex: which button on the source node (0-based) — used when connecting from a quickReply/interactiveList button',
    '   - sourceHandle: direct handle ID (use "next-step" for default sequential connection from quickReply/list bottom handle)',
    '',
    '**Inserting a node between two existing nodes (connectTo + removeEdges):**',
    'To insert node B between existing A → C:',
    '1. removeEdges: [\\{ "source": "A-id", "target": "C-id" \\}]  ← REQUIRED: cut the old A→C edge first',
    '2. chains: [\\{ "attachTo": "A-id", "steps": [\\{ "step": "node", ... \\}], "connectTo": "C-id" \\}]',
    '**connectTo almost always requires a matching removeEdges entry** — otherwise the old direct edge and the new chain both exist, creating a fork.',
    '',
    '**Replacing a node:**',
    'To replace node X with a new node:',
    '1. removeNodeIds: ["X-id"] (this also removes all edges to/from X)',
    '2. chains: [\\{ "attachTo": "previous-node-id", "steps": [new node], "connectTo": "next-node-id" \\}]',
    '',
    '**Converting a node type (e.g., question → quickReply to "add options"):**',
    'When the user says "add options" or "add buttons" to a question node, they want to REPLACE it with a quickReply:',
    '1. removeNodeIds: ["question-node-id"]',
    '2. chains: [\\{ "attachTo": "previous-node-id", "steps": [\\{ "step": "node", "nodeType": "quickReply", "content": \\{ "question": "same question text", "buttons": ["Option A", "Option B"] \\} \\}], "connectTo": "next-node-id" \\}]',
    'Do NOT add a new quickReply AFTER the existing question — that creates a redundant extra step.',
    '',
    '**Adding more buttons/options to an EXISTING quickReply or interactiveList (CRITICAL — use nodeUpdates, NOT replace):**',
    'When the user says "add more options" or "add more buttons" to an existing quickReply or interactiveList:',
    '- Use `nodeUpdates` with the FULL updated buttons/options list (existing + new ones)',
    '- Do NOT use removeNodeIds + chains — that DELETES the node and ALL its existing connections',
    '- The system auto-converts quickReply → interactiveList if button count exceeds the platform limit (3 for WhatsApp/Instagram)',
    '- Existing button connections are preserved automatically when using nodeUpdates',
    '- Example: To add "View Products" and "Check Status" to a quickReply that already has ["Get Started", "Learn More", "Contact Us"]:',
    '  nodeUpdates: [\\{ "nodeId": "existing-quickReply-id", "content": \\{ "buttons": ["Get Started", "Learn More", "Contact Us", "View Products", "Check Status"] \\} \\}]',
    '',
    '**Redirecting buttons to an existing node (IMPORTANT — no new nodes needed):**',
    'When the user wants to point buttons at an EXISTING node, use removeEdges + addEdges. Do NOT create new chains/nodes.',
    'Example: Make buttons 0, 1, 2 all point to the same existing question node:',
    '1. removeEdges: remove edges from buttons that currently go elsewhere',
    '2. addEdges: connect those buttons to the target existing node using sourceButtonIndex',
    '3. removeNodeIds: delete any orphaned nodes that are no longer needed',
    'This is a REWIRE, not a rebuild. Never create duplicate nodes when an existing node already has the right content.',
    '',
    '**Content fields (all optional — factory provides defaults):**',
    '- question, buttons[], options[], listTitle, text, label, message',
    '- storeAs: string — variable name for storing user response. ALWAYS provide for question/quickReply/interactiveList nodes.',
    '',
    '**MINIMAL CHANGE RULES (critical):**',
    '- Make the MINIMUM changes needed. One new node = one chain or one nodeUpdate. That\'s it.',
    '- **NEVER create a new node when an existing node already has the right content.** To rewire a button to an existing node, use removeEdges + addEdges. chains create NEW nodes — only use chains when you actually need a new node on the canvas.',
    '- NEVER remove or rewire edges not directly related to your change.',
    '- NEVER create edges pointing backward in the flow (toward earlier nodes).',
    '- When updating content (question text, button labels): use nodeUpdates ONLY. Do NOT recreate the node.',
    '- When changing a node\'s TYPE (e.g., question → quickReply): use removeNodeIds + chain. This is a REPLACE, not an ADD.',
    '- NEVER add a new node after an existing node when the user asked to modify the existing node.',
    '- "chains" can be empty [] if you\'re only doing nodeUpdates or addEdges.',
    '- Do NOT touch nodes or edges the user didn\'t ask about.',
    '- If a Focus Area node is specified, apply changes relative to that node.',
    '',
    '**CRITICAL — quickReply vs interactiveList:**',
    '- **≤3 choices → ALWAYS use quickReply** (with buttons[]). NEVER use interactiveList for 3 or fewer options.',
    '- **4+ choices → use interactiveList** (with options[] and listTitle).',
    '- This rule is absolute and has no exceptions.',
    '',
    '**VARIABLE INTERPOLATION (referencing previous answers):**',
    '- Nodes that collect input store the user\'s response in a variable (shown as {storeAs: "var_name"} in the flow graph).',
    '- ALWAYS set `storeAs` in the content field for new question, quickReply, and interactiveList nodes. Use short, descriptive snake_case names.',
    '- To reference a stored value in later messages/questions, use double curly braces: {{variable_name}}',
    '- **Button/list responses store TWO variables:** {{storeAs}} holds the internal ID, {{storeAs_title}} holds the display text. ALWAYS use {{storeAs_title}} when showing the user\'s choice in messages.',
    '- Example: If a node has {storeAs: "selected_flavor"}, use {{selected_flavor_title}} in messages: "Great! We\'ll send you {{selected_flavor_title}}."',
    '- For text input nodes (question, super nodes), just use {{storeAs}} directly — there is no _title variant.',
    '- Super nodes have fixed variables: name→user_name, email→user_email, dob→user_dob, address→user_address.',
    '- NEVER use square brackets like [flavor] or [selected_flavor]. ALWAYS use {{variable_name}} with double curly braces.',
    '- Only reference variables from nodes that appear EARLIER in the flow.',
    '',
    '**Key Rules:**',
    '- When restructuring, always remove old edges/nodes THEN add new ones',
    '- Only add information nodes (name, email, dob, address) when the flow logically needs them',
    '- Steps after branch steps become shared nodes — do not duplicate identical follow-ups in each branch',
    '- Write full sentences for questions, not "Choose:" or "Select:"',
    '- Each branch must have a unique buttonIndex',
    '- Max branches per platform: web=10, whatsapp=3, instagram=3',
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
    "- Add integrations only when relevant (metaAudience for WhatsApp/Instagram)",
    "- Write full, natural questions",
    "- Branches follow the last quickReply/interactiveList in the current scope",
  ].join("\n")
}

function getEditResponseFormat(): string {
  // NOTE: Using JSON.stringify to avoid esbuild template literal parse issues
  const ex1 = JSON.stringify({
    message: "Inserted email collection before the feedback question",
    removeEdges: [{ source: "1", target: "plan-quickReply-1" }],
    chains: [{ attachTo: "1", steps: [{ step: "node", nodeType: "email" }], connectTo: "plan-quickReply-1" }],
  }, null, 2)

  const ex2 = JSON.stringify({
    message: "Added follow-up question after 'Needs improvement' and updated the main question",
    chains: [{
      attachTo: "plan-quickReply-2", attachHandle: "button-2",
      steps: [
        { step: "node", nodeType: "question", content: { question: "What improvements would you suggest?" } },
        { step: "node", nodeType: "metaAudience" },
      ],
    }],
    nodeUpdates: [{ nodeId: "plan-quickReply-2", content: { question: "How was your experience with our product?" } }],
  }, null, 2)

  const ex3 = JSON.stringify({
    message: "Replaced the message node with a question node",
    removeNodeIds: ["plan-whatsappMessage-3"],
    chains: [{
      attachTo: "plan-quickReply-2", attachHandle: "button-1",
      steps: [{ step: "node", nodeType: "question", content: { question: "What could be better?" } }],
      connectTo: "plan-metaAudience-4",
    }],
  }, null, 2)

  const ex4 = JSON.stringify({
    message: "Added a new button and connected it",
    nodeUpdates: [{ nodeId: "plan-quickReply-1", content: { buttons: ["Existing A", "Existing B", "New C"] } }],
    addEdges: [{ source: "plan-quickReply-1", target: "plan-address-3", sourceButtonIndex: 2 }],
  }, null, 2)

  const ex5 = JSON.stringify({
    message: "Converted open question to quickReply with fruit drink frequency options",
    removeNodeIds: ["plan-question-4"],
    chains: [{
      attachTo: "plan-quickReply-3",
      attachHandle: "button-0",
      steps: [{ step: "node", nodeType: "quickReply", content: { question: "How often do you consume fruit-based drinks?", buttons: ["Daily", "Weekly", "Occasionally", "Never"] } }],
      connectTo: "plan-quickReply-5",
    }],
  }, null, 2)

  // Example 6: Redirect buttons to an existing node (merge/converge — NO new nodes)
  const ex6 = JSON.stringify({
    message: "All three buttons now point to the same dietary restriction question",
    removeEdges: [
      { source: "plan-quickReply-1", target: "plan-question-3" },
      { source: "plan-quickReply-1", target: "plan-question-4" },
    ],
    removeNodeIds: ["plan-question-3", "plan-question-4"],
    addEdges: [
      { source: "plan-quickReply-1", target: "plan-question-2", sourceButtonIndex: 1 },
      { source: "plan-quickReply-1", target: "plan-question-2", sourceButtonIndex: 2 },
    ],
  }, null, 2)

  // Example 7: Multi-chain edit (two simultaneous insertions)
  const ex7 = JSON.stringify({
    message: "Added email after name and rating after address",
    chains: [
      { attachTo: "plan-name-1", steps: [{ step: "node", nodeType: "email" }], connectTo: "plan-quickReply-2" },
      { attachTo: "plan-address-3", steps: [{ step: "node", nodeType: "quickReply", content: { question: "Rate delivery", buttons: ["Great", "OK", "Bad"] } }], connectTo: "plan-homeDelivery-4" },
    ],
    removeEdges: [
      { source: "plan-name-1", target: "plan-quickReply-2" },
      { source: "plan-address-3", target: "plan-homeDelivery-4" },
    ],
  }, null, 2)

  return [
    "Example 1 — Insert email before an existing node:",
    ex1,
    "",
    "Example 2 — Add nodes after a button + update existing content:",
    ex2,
    "",
    "Example 3 — Replace a node:",
    ex3,
    "",
    "Example 4 — Add a new button and connect it to an existing node:",
    ex4,
    "",
    "Example 5 — Convert question to quickReply (\"add options to a question\"):",
    ex5,
    "",
    "Example 6 — Redirect buttons to an existing node (merge duplicate paths):",
    ex6,
    "",
    "Example 7 — Multi-chain edit (two simultaneous insertions):",
    ex7,
    "",
    "**IMPORTANT:**",
    '- Use BASE node type names (question, quickReply, name, etc.) — NOT platform-prefixed',
    '- "attachTo" MUST be an existing node ID from the flow',
    '- "connectTo" links the last new node back to an existing node (for insertion/replacement). **When using connectTo, you almost always need removeEdges** to cut the old direct edge first — otherwise both old and new paths exist.',
    '- "removeNodeIds" deletes nodes AND all their connected edges',
    '- "removeEdges" disconnects specific edges by source+target',
    '- "addEdges" creates new edges — use sourceButtonIndex to connect from a specific button (0-based)',
    "- When restructuring: remove old edges/nodes first, then add new chains",
    "- Only add information nodes (name, email, etc.) when the flow needs that data",
    "- Write full, natural questions",
    "",
    "**Splitting a path into branches:**",
    'When the user says "split X into two paths" or "make X branch":',
    "1. Remove the edge from the current node to its downstream node",
    "2. Either use nodeUpdates to add buttons to an existing quickReply, or replace the node with a quickReply using removeNodeIds + chain",
    "3. Add branches after the quickReply using additional chains with attachHandle",
  ].join("\n")
}

