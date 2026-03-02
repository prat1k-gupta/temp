import { getAIClient } from "../core/ai-client"
import { getPlatformGuidelines } from "../core/ai-context"
import { getSimplifiedNodeDocumentation } from "../core/node-documentation"
import type { Platform } from "@/types"
import type { Node, Edge } from "@xyflow/react"
import { z } from "zod"
import { flowPlanSchema, editFlowPlanSchema } from "@/types/flow-plan"
import type { FlowPlan, EditFlowPlan } from "@/types/flow-plan"
import { buildFlowFromPlan, buildEditFlowFromPlan } from "@/utils/flow-plan-builder"
import { isMultiOutputType } from "@/utils/platform-helpers"

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
  }
  action: "create" | "edit" | "suggest"
  warnings?: string[]
  debugData?: Record<string, unknown>
}

function getNodeTypeLabel(nodeType: string, platform: Platform): string {
  // Map node types to display labels
  const typeMap: Record<string, string> = {
    // Information nodes
    name: "Name",
    email: "Email",
    dob: "Date of Birth",
    address: "Address",
    // Fulfillment nodes
    homeDelivery: "Home Delivery",
    event: "Event",
    retailStore: "Retail Store",
    // Integration nodes
    shopify: "Shopify",
    metaAudience: "Meta Audience",
    stripe: "Stripe",
    zapier: "Zapier",
    google: "Google Sheets",
    salesforce: "Salesforce",
    mailchimp: "Mailchimp",
    twilio: "Twilio",
    slack: "Slack",
    airtable: "Airtable",
  }

  // Check if it's a platform-specific interaction node
  if (nodeType.includes("Question")) {
    return "Question"
  }
  if (nodeType.includes("QuickReply")) {
    return "Quick Reply"
  }
  if (nodeType.includes("List")) {
    return "List"
  }

  // Return mapped label or capitalize the type
  return typeMap[nodeType] || nodeType.charAt(0).toUpperCase() + nodeType.slice(1)
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
    const displayText = question || text
    const labelPart = label ? ` ${label}` : ""
    const contentPart = displayText ? ` — "${displayText.substring(0, 60)}${displayText.length > 60 ? "..." : ""}"` : ""
    return `[${node.id}]${labelPart} (${node.type})${contentPart}`
  }

  function getButtonLabel(node: Node, sourceHandle: string | undefined): string | null {
    if (!sourceHandle) return null
    const buttons: Array<{ text?: string; label?: string; id?: string }> = (node.data as any)?.buttons || []
    // Match by handle ID like "button-0", "button-1"
    const match = sourceHandle.match(/^button-(\d+)$/)
    if (match) {
      const idx = parseInt(match[1], 10)
      if (idx < buttons.length) {
        return buttons[idx]?.text || buttons[idx]?.label || `Button ${idx}`
      }
    }
    // Also try matching by button.id
    const byId = buttons.find(b => b.id === sourceHandle)
    if (byId) return byId.text || byId.label || sourceHandle
    // Handle "next-step" or other named handles
    if (sourceHandle === "next-step") return null
    return null
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
      lines.push(`${prefix}${connector} [${nodeId}] (see above)`)
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
      const items = buttons.length > 0
        ? buttons.map((b, i) => `"${b.text || b.label || "?"}" (handle: ${b.id || `button-${i}`})`)
        : options.map((o, i) => `"${o.text || "?"}" (handle: ${o.id || `button-${i}`})`)
      const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")
      lines.push(`${childPrefix}│ Buttons: [${items.join(", ")}]`)
    }

    if (children.length === 0) {
      dfsStack.delete(nodeId)
      return
    }

    const childPrefix = prefix + (connector === "└→ " ? "   " : "│  ")

    children.forEach((child, idx) => {
      const isLast = idx === children.length - 1
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
      
      // Get platform-specific node type prefix
      const platformPrefix = platform === "whatsapp" ? "whatsapp" : platform === "instagram" ? "instagram" : "web"
      
      // All valid node types (platform-agnostic)
      // Platform-specific interaction nodes are validated by checking if they start with platform prefix
      const validNodeTypes = [
        // Information nodes (super nodes)
        "name", "email", "dob", "address",
        // Logic nodes
        "condition",
        // Fulfillment nodes
        "homeDelivery", "event", "retailStore",
        // Integration nodes
        "shopify", "stripe", "zapier", "google", "salesforce", "mailchimp", "twilio", "slack", "airtable",
        // Meta integration (whatsapp/instagram only)
        ...(platform === "whatsapp" || platform === "instagram" ? ["metaAudience"] : [])
      ]
      
      // Platform-specific interaction node types that are available
      const platformInteractionNodes = platform === "whatsapp"
        ? ["whatsappQuestion", "whatsappQuickReply", "whatsappInteractiveList", "whatsappMessage"]
        : platform === "instagram"
        ? ["instagramQuestion", "instagramQuickReply", "instagramDM", "instagramStory"]
        : ["webQuestion", "webQuickReply"]
      
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
          // Filter to only valid nodes (platform-specific interaction nodes or platform-agnostic nodes)
          .filter((node: any) => {
            const nodeType = node.type || ""
            // Allow only actual platform-specific interaction nodes OR valid platform-agnostic nodes
            return (
              platformInteractionNodes.includes(nodeType) ||
              validNodeTypes.includes(nodeType)
            )
          })
          // Fix positioning and transform data
          .map((node: any, index: number) => {
            // Fix positioning: space nodes horizontally starting after existing nodes
            const xPosition = node.position?.x && node.position.x > 250 
              ? node.position.x 
              : maxX + 350 + (index * 350)
            const yPosition = node.position?.y || 150
            
            // Ensure label is always set
            const nodeLabel = node.data?.label || node.label || getNodeTypeLabel(node.type, platform)
            
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
          // Filter to only valid nodes (platform-specific interaction nodes or platform-agnostic nodes)
          .filter((node: any) => {
            const nodeType = node.type || ""
            // Allow only actual platform-specific interaction nodes OR valid platform-agnostic nodes
            return (
              platformInteractionNodes.includes(nodeType) ||
              validNodeTypes.includes(nodeType)
            )
          })
          // Fix positioning
          .map((node: any, index: number) => {
            // Fix positioning: space nodes horizontally
            // If node has a valid x position (> 250), use it, otherwise calculate
            const xPosition = node.position?.x && node.position.x > 250
              ? node.position.x
              : maxX + 350 + (index * 350)
            const yPosition = node.position?.y || 150
            
            // Ensure label is always set
            const nodeLabel = node.data?.label || node.label || getNodeTypeLabel(node.type, platform)
            
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

      // Validate delivery flows have required nodes
      const allNodes = [...(parsed.flowData?.nodes || []), ...(parsed.updates?.nodes || [])]
      const hasHomeDelivery = allNodes.some((n: any) => n.type === "homeDelivery")
      const hasAddress = allNodes.some((n: any) => n.type === "address")
      
      if (hasHomeDelivery && !hasAddress) {
        console.warn("[generate-flow] Delivery flow missing address node - this should be added by AI")
        // Could add address node automatically, but better to let AI fix it
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
          schema: editFlowPlanSchema
        })

        console.log("[generate-flow] Edit plan from AI:", JSON.stringify({
          chains: editPlan.chains?.length || 0,
          nodeUpdates: editPlan.nodeUpdates?.length || 0,
          removeNodeIds: editPlan.removeNodeIds?.length || 0,
          removeEdges: editPlan.removeEdges?.length || 0,
          addEdges: editPlan.addEdges?.length || 0,
        }))

        const existingNodes = request.existingFlow?.nodes || []
        const { newNodes, newEdges, nodeOrder, nodeUpdates, removeNodeIds, removeEdges, warnings } = buildEditFlowFromPlan(
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
          schema: flowPlanSchema
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
            const { newNodes, newEdges, nodeOrder, nodeUpdates, removeNodeIds, removeEdges, warnings } = buildEditFlowFromPlan(
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

  let prompt = `You are an expert conversational flow designer for ${request.platform} platforms.

Your task is to ${action} a conversational flow based on user requirements.

**Platform Guidelines:**
${platformGuidelines}

**${isEdit ? "COMPREHENSIVE NODE DOCUMENTATION" : "AVAILABLE NODE TYPES"}:**
${nodeDocs}

**Flow Context:**
${request.flowContext || "General conversational flow"}

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

    prompt += `\n\nIMPORTANT: Each source node can only have ONE edge per sourceHandle. If you need to change a connection, replace the existing edge.`
  }

  // Detect if delivery is mentioned and emphasize address collection
  const promptLower = request.prompt.toLowerCase()
  const mentionsDelivery = promptLower.includes("deliver") || promptLower.includes("delivery") || promptLower.includes("ship") || promptLower.includes("home") || promptLower.includes("sample")
  
  if (mentionsDelivery && !isEdit) {
    prompt += `\n\nDELIVERY FLOW: Include name → quickReply (offer) → branches → address → homeDelivery. Consider metaAudience for WhatsApp/Instagram.`
  } else if (!isEdit) {
    prompt += `\n\nOnly include nodes that are directly relevant to the user's request. Do NOT add name, email, address, or other data-collection nodes unless the user asks for them or the flow logically requires them (e.g., delivery needs address). Use quickReply for choices with branches.`
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
    '',
    '**Key Rules:**',
    '- Only include nodes directly relevant to the user\'s request — do NOT add name, email, dob, or address unless the flow logically needs that data',
    '- Use "question" when asking the user something that expects a text reply back',
    '- Use "whatsappMessage" / "instagramDM" ONLY for one-way informational messages where NO user response is needed (e.g., "Thank you!", confirmations)',
    '- Use quickReply (not question) when you need buttons/choices',
    '- **Prefer quickReply over question when the answer domain is finite.** Examples:',
    '  - "What\'s your dog breed?" → quickReply with breed buttons',
    '  - "What size?" → quickReply ["S", "M", "L", "XL"]',
    '  - "Rate your experience" → quickReply ["Great", "Good", "Could be better"]',
    '  Only use "question" for truly open-ended input (comments, descriptions, freeform feedback).',
    '- **After a quickReply/interactiveList:**',
    '  - If ALL buttons lead to the SAME follow-up: place node steps directly after the quickReply (no branches needed) — every button will connect to the same node.',
    '  - If buttons lead to DIFFERENT paths: use branch steps for the differing parts.',
    '  - If branches converge to shared follow-up steps: place the shared steps AFTER all branch steps — they\'ll be created once and all branches will connect to them.',
    '  - Do NOT duplicate identical nodes inside every branch.',
    '- For delivery flows: MUST include "address" + "homeDelivery"',
    '- Include integrations (metaAudience, shopify, etc.) only when relevant',
    '- Write full sentences for questions, not "Choose:" or "Select:"',
    '- Each branch must have a unique buttonIndex',
    '- Max branches per platform: web=10, whatsapp=3, instagram=3',
    '- **WhatsApp/Instagram quickReply limit:** Max 3 buttons. If you need more than 3 choices, use interactiveList with options[] instead (supports up to 10). The system will auto-convert if you exceed the limit, but prefer using the correct type upfront.',
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
    '   - attachHandle: optional, e.g. "button-0" to branch from a specific button',
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
    '**Inserting a node between two existing nodes:**',
    'To insert node B between existing A → C:',
    '1. removeEdges: [\\{ "source": "A-id", "target": "C-id" \\}]',
    '2. chains: [\\{ "attachTo": "A-id", "steps": [\\{ "step": "node", ... \\}], "connectTo": "C-id" \\}]',
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
    '**Key Rules:**',
    '- When restructuring, always remove old edges/nodes THEN add new ones',
    '- Use "question" when asking the user something that expects a text reply',
    '- Use "whatsappMessage" / "instagramDM" ONLY for one-way informational messages (no reply expected)',
    '- Use quickReply (not question) when you need buttons/choices',
    '- **Prefer quickReply over question when the answer domain is finite.** Examples:',
    '  - "What\'s your dog breed?" → quickReply with breed buttons',
    '  - "What size?" → quickReply ["S", "M", "L", "XL"]',
    '  Only use "question" for truly open-ended input (comments, descriptions, freeform feedback).',
    '- Only add information nodes (name, email, dob, address) when the flow logically needs them',
    '- Steps after branch steps become shared nodes — do not duplicate identical follow-ups in each branch',
    '- For delivery flows: MUST include "address" + "homeDelivery"',
    '- Write full sentences for questions, not "Choose:" or "Select:"',
    '- Each branch must have a unique buttonIndex',
    '- Max branches per platform: web=10, whatsapp=3, instagram=3',
    '- **WhatsApp/Instagram quickReply limit:** Max 3 buttons. If you need more than 3 choices, use interactiveList with options[] instead (supports up to 10). The system will auto-convert if you exceed the limit, but prefer using the correct type upfront.',
  ].join("\n")
}

function getCreateResponseFormat(): string {
  // NOTE: Using JSON.stringify + join to avoid esbuild template literal parse issues
  const example = JSON.stringify({
    message: "Created a sample delivery flow with feedback collection",
    steps: [
      { step: "node", nodeType: "quickReply", content: { question: "Choose a delivery slot for your sample.", buttons: ["Morning", "Afternoon", "Evening"] } },
      { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Morning slot confirmed!" } }] },
      { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Afternoon slot confirmed!" } }] },
      { step: "branch", buttonIndex: 2, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Evening slot confirmed!" } }] },
      { step: "node", nodeType: "address" },
      { step: "node", nodeType: "homeDelivery" },
      { step: "node", nodeType: "question", content: { question: "How was your experience with the sample?" } },
      { step: "node", nodeType: "metaAudience" },
    ],
  }, null, 2)

  return example + "\n\n" + [
    "**IMPORTANT:**",
    '- Use BASE node type names (question, quickReply, name, etc.) — NOT platform-prefixed',
    '- Only include information nodes (name, email, dob, address) when the flow needs that data — do NOT add them by default',
    '- Use "question" when asking users something that expects a text reply; use "whatsappMessage"/"instagramDM" ONLY for one-way messages (no reply expected)',
    "- Use quickReply for choices/buttons (not question)",
    "- Steps AFTER all branch steps become shared convergence nodes — all branches connect to them. Do NOT duplicate identical follow-up nodes inside every branch.",
    "- If ALL buttons lead to the same path, skip branches entirely and place steps directly after the quickReply.",
    "- For delivery: MUST include address + homeDelivery",
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
    "**IMPORTANT:**",
    '- Use BASE node type names (question, quickReply, name, etc.) — NOT platform-prefixed',
    '- "attachTo" MUST be an existing node ID from the flow',
    '- "connectTo" links the last new node back to an existing node (for insertion/replacement)',
    '- "removeNodeIds" deletes nodes AND all their connected edges',
    '- "removeEdges" disconnects specific edges by source+target',
    '- "addEdges" creates new edges — use sourceButtonIndex to connect from a specific button (0-based)',
    "- When restructuring: remove old edges/nodes first, then add new chains",
    '- Use "question" when asking users something that expects a text reply',
    '- Use "whatsappMessage"/"instagramDM" ONLY for one-way messages (no reply expected)',
    "- Use quickReply for choices/buttons (not question)",
    "- Only add information nodes (name, email, etc.) when the flow needs that data",
    "- Write full, natural questions",
  ].join("\n")
}

function getAvailableNodeTypes(platform: Platform): string {
  // This function is now replaced by getNodeDocumentationForPrompt
  // But keeping it for backward compatibility - it will be overridden by the comprehensive docs
  return "See COMPREHENSIVE NODE DOCUMENTATION section above for detailed information about all available node types, their properties, limits, and usage guidelines."
}