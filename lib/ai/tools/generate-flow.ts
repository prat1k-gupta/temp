import { getAIClient } from "../core/ai-client"
import { getPlatformGuidelines, getNodeDocumentationForPrompt } from "../core/ai-context"
import type { Platform } from "@/types"
import { createNode } from "@/utils"
import type { Node, Edge } from "@xyflow/react"
import { z } from "zod"

export interface GenerateFlowRequest {
  prompt: string
  platform: Platform
  flowContext?: string
  conversationHistory?: Array<{ role: string; content: string }>
  existingFlow?: {
    nodes: Node[]
    edges: Edge[]
  }
}

export interface GenerateFlowResponse {
  message: string
  flowData?: {
    nodes: Node[]
    edges: Edge[]
  }
  updates?: {
    nodes?: Node[]
    edges?: Edge[]
    description?: string
  }
  action: "create" | "edit" | "suggest"
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

      // Fix edges: remove true duplicates but allow button branching
      if (parsed.flowData?.nodes && parsed.flowData?.edges) {
        // Remove true duplicates (same source, sourceHandle, and target)
        const edgeKeyMap = new Map<string, Edge>()
        parsed.flowData.edges.forEach((edge: Edge) => {
          // Create unique key: source + sourceHandle + target
          // This allows multiple edges from same source if they have different sourceHandles (button branching)
          const edgeKey = `${edge.source}-${edge.sourceHandle || 'default'}-${edge.target}`
          if (!edgeKeyMap.has(edgeKey)) {
            edgeKeyMap.set(edgeKey, edge)
          }
        })
        parsed.flowData.edges = Array.from(edgeKeyMap.values())
        
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
        // Remove true duplicates but allow button branching
        const edgeKeyMap = new Map<string, Edge>()
        parsed.updates.edges.forEach((edge: Edge) => {
          // Create unique key: source + sourceHandle + target
          // This allows multiple edges from same source if they have different sourceHandles (button branching)
          const edgeKey = `${edge.source}-${edge.sourceHandle || 'default'}-${edge.target}`
          if (!edgeKeyMap.has(edgeKey)) {
            edgeKeyMap.set(edgeKey, edge)
          }
        })
        parsed.updates.edges = Array.from(edgeKeyMap.values())
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
    const isEditRequest =
      Boolean(request.existingFlow && (request.existingFlow.nodes.length > 0 || request.existingFlow.edges.length > 0)) ||
      request.prompt.toLowerCase().includes("edit") ||
      request.prompt.toLowerCase().includes("update") ||
      request.prompt.toLowerCase().includes("modify") ||
      request.prompt.toLowerCase().includes("change")

    const systemPrompt = buildSystemPrompt(request, platformGuidelines, isEditRequest)
    const userPrompt = buildUserPrompt(request, isEditRequest)

    // Try structured output first, fallback to text generation
    try {
      // Define schema based on action type
      const nodeDataSchema = z.object({
        id: z.string(),
        type: z.string(),
        position: z.object({
          x: z.number(),
          y: z.number()
        }),
        data: z.record(z.any())
      }).passthrough()

      const edgeSchema = z.object({
        id: z.string(),
        source: z.string(),
        target: z.string(),
        sourceHandle: z.string().optional(),
        type: z.string().optional()
      }).passthrough()

      if (isEditRequest) {
        const editResponseSchema = z.object({
          message: z.string(),
          action: z.literal("edit"),
          updates: z.object({
            nodes: z.array(nodeDataSchema).optional(),
            edges: z.array(edgeSchema).optional(),
            description: z.string().optional()
          }).optional()
        }) as z.ZodType<GenerateFlowResponse>

        const response = await aiClient.generateJSON<GenerateFlowResponse>({
          systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
          userPrompt,
          schema: editResponseSchema
        })

        // Process the structured response
        const parsed = processFlowResponse(response, request.platform, isEditRequest, request.existingFlow)
        return parsed
      } else {
        const createResponseSchema = z.object({
          message: z.string(),
          action: z.literal("create"),
          flowData: z.object({
            nodes: z.array(nodeDataSchema),
            edges: z.array(edgeSchema)
          })
        }) as z.ZodType<GenerateFlowResponse>

        const response = await aiClient.generateJSON<GenerateFlowResponse>({
          systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.`,
          userPrompt,
          schema: createResponseSchema
        })

        // Process the structured response
        const parsed = processFlowResponse(response, request.platform, isEditRequest, request.existingFlow)
        return parsed
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

      // Parse AI response using existing parser
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

  // Get comprehensive node documentation
  const nodeDocs = getNodeDocumentationForPrompt(request.platform)

  let prompt = `You are an expert conversational flow designer for ${request.platform} platforms.

Your task is to ${action} a conversational flow based on user requirements.

**Platform Guidelines:**
${platformGuidelines}

**COMPREHENSIVE NODE DOCUMENTATION:**
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
    prompt += `\n\nExisting Flow Structure:`
    const startNode = request.existingFlow.nodes.find(n => n.type === "start")
    if (startNode) {
      prompt += `\n- Start Node: id="${startNode.id}" (DO NOT create a new start node, connect to this one)`
    }
    prompt += `\n- Total Nodes: ${request.existingFlow.nodes.length}`
    prompt += `\n- Total Edges: ${request.existingFlow.edges.length}`
    
    // List existing nodes with their types and labels
    if (request.existingFlow.nodes.length > 0) {
      prompt += `\n\nExisting Nodes:`
      request.existingFlow.nodes.forEach((node, index) => {
        const labelPart = node.data.label ? ` - "${node.data.label}"` : ""
        const question = typeof node.data.question === 'string' ? node.data.question : ''
        const questionPart = question ? ` - Question: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"` : ""
        prompt += `\n${index + 1}. ${node.id} - ${node.type}${labelPart}${questionPart}`
      })
    }
    
    // List existing edges
    if (request.existingFlow.edges.length > 0) {
      prompt += `\n\nExisting Connections:`
      request.existingFlow.edges.forEach((edge, index) => {
        const handlePart = edge.sourceHandle ? ` (button: ${edge.sourceHandle})` : ""
        prompt += `\n${index + 1}. ${edge.source} → ${edge.target}${handlePart}`
      })
    }
    
    prompt += `\n\nIMPORTANT: Each source node can only have ONE edge per sourceHandle. If you need to change a connection, replace the existing edge.`
  }

  // Detect if delivery is mentioned and emphasize address collection
  const promptLower = request.prompt.toLowerCase()
  const mentionsDelivery = promptLower.includes("deliver") || promptLower.includes("delivery") || promptLower.includes("ship") || promptLower.includes("home") || promptLower.includes("sample")
  
  if (mentionsDelivery && !isEdit) {
    prompt += `\n\n⚠️ DELIVERY FLOW REQUIRED:
Flow Pattern: Start → name (collect) → Quick Reply (offer with buttons) → Address (collect) → homeDelivery (fulfill)
- ALWAYS start with "name" node (super node) to collect user information
- Use Quick Reply node (not Question) for the offer
- Create branching from Quick Reply buttons (button-0, button-1, button-2)
- MUST include "address" node (super node)
- MUST include "homeDelivery" node
- Consider adding metaAudience integration for WhatsApp/Instagram`
  } else if (!isEdit) {
    prompt += `\n\n💡 CREATE COMPREHENSIVE FLOW:
- Start with information collection: Start → name (or email/dob) → first interaction
- Use super nodes (name, email, dob, address) for data collection - NOT question nodes
- Include branching: Quick Reply buttons should connect to different paths using sourceHandle
- Add integrations: Include metaAudience (WhatsApp/Instagram), shopify, or other relevant integrations
- Add fulfillment: Include homeDelivery, event, or retailStore when appropriate
- Create multiple paths, not just linear chains`
  }

  // Always include start node info for new flows
  if (!isEdit || !request.existingFlow) {
    prompt += `\n\nIMPORTANT: The flow already has a start node with id "1". Connect your first node to it (source: "1").`
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
  return `Create a comprehensive conversational flow based on the user's requirements.

**CRITICAL: Only use node types that are listed in "Available Node Types" section. Do not invent or use node types that don't exist.**

**Flow Structure - Build Rich, Connected Flows:**
1. **Start node already exists** - connect your first node to it (source: "1")
2. **Information Collection First** - Start with information nodes (name, email, dob) to collect user data early
3. **Interaction Nodes** - Use Question/Quick Reply/List for conversations (use exact platform-specific types)
4. **Branching from Buttons** - Quick Reply buttons should branch to different paths (use sourceHandle: "button-0", "button-1", "button-2")
5. **Fulfillment Nodes** - Include homeDelivery, event, or retailStore for service delivery
6. **Integration Nodes** - Add relevant integrations (metaAudience for WhatsApp/Instagram, shopify, stripe, etc.)

**Key Rules:**
- **ALWAYS include information nodes** - Add "name" node early in the flow (Start → name → ...)
- **Use Quick Reply nodes when you need buttons** - they already have buttons built-in
- **Create branching flows** - Each Quick Reply button can connect to different nodes using sourceHandle
  - Button 0: sourceHandle: "button-0"
  - Button 1: sourceHandle: "button-1"  
  - Button 2: sourceHandle: "button-2"
- **For delivery: MUST include "address" node AND "homeDelivery" node**
- **Include integrations** - Add metaAudience, shopify, or other relevant integrations
- **Write comprehensive questions** - full sentences, not "Choose:" or "Select:"
- **All nodes must be connected** - Create multiple paths and branches, not just linear chains
- **Space nodes 350px apart** - x positions: 600, 950, 1300, 1650, etc.

**Node Data:**
- Always include "label" (descriptive: "Free Sample Offer" not "Question")
- Quick Reply: Include "question" and "buttons" array (e.g., ["Yes, send it!", "No, thanks"])
- List: Include "question" and "options" array (e.g., ["Shampoo", "Conditioner"])
- Always include "platform" field

**Edge Connections:**
- Standard edges: {"source": "node-id", "target": "target-id"}
- Button branches: {"source": "quick-reply-id", "sourceHandle": "button-0", "target": "target-id"}
- Create multiple edges from Quick Reply nodes - one per button for branching

Return complete flow as JSON with nodes and edges. Make it comprehensive with information collection, branching, and integrations.`
}

function getEditInstructions(): string {
  return `Modify the existing flow based on user requirements.

**CRITICAL: Only use node types that are listed in "Available Node Types" section. Do not invent or use node types that don't exist. Use exact platform-specific type names.**

**Key Rules:**
- **Add information nodes when needed** - Include name, email, dob, or address nodes for data collection
- **Use Quick Reply nodes when you need buttons** - not Question nodes
- **Create branching flows** - Quick Reply buttons can branch to different paths using sourceHandle
  - Button 0: sourceHandle: "button-0"
  - Button 1: sourceHandle: "button-1"
  - Button 2: sourceHandle: "button-2"
- **For delivery: MUST include "address" node AND "homeDelivery" node**
- **Add integrations** - Include metaAudience, shopify, or other relevant integrations
- **Write comprehensive questions** - full sentences, not "Choose:" or "Select:"
- **Multiple edges from Quick Reply** - Each button can connect to a different node
- **All new nodes must be connected** to the flow chain
- **Space nodes 350px apart** horizontally

**Node Data:**
- Always include "label" (descriptive and context-aware)
- Quick Reply: "question" + "buttons" array
- List: "question" + "options" array
- Always include "platform" field

**Edge Connections:**
- Standard edges: {"source": "node-id", "target": "target-id"}
- Button branches: {"source": "quick-reply-id", "sourceHandle": "button-0", "target": "target-id"}

Return only the changes/updates as JSON. Make flows comprehensive with information collection, branching, and integrations.`
}

function getCreateResponseFormat(): string {
  return `{
  "message": "I've created a comprehensive flow for [purpose]. Here's what I included...",
  "action": "create",
  "flowData": {
    "nodes": [
      {
        "id": "name-1",
        "type": "name",
        "position": { "x": 600, "y": 150 },
        "data": {
          "label": "Collect Name",
          "platform": "whatsapp",
          "fieldLabel": "Full Name",
          "validationRules": {
            "required": true,
            "minLength": 2,
            "maxLength": 50
          }
        }
      },
      {
        "id": "2",
        "type": "whatsappQuestion",
        "position": { "x": 950, "y": 150 },
        "data": {
          "label": "Product Inquiry",
          "platform": "whatsapp",
          "question": "Hi! We'd love to send you a free sample. What hair problems are you experiencing?"
        }
      },
      {
        "id": "3",
        "type": "whatsappQuickReply",
        "position": { "x": 1300, "y": 150 },
        "data": {
          "label": "Hair Problem Selection",
          "platform": "whatsapp",
          "question": "Which hair issue would you like help with?",
          "buttons": ["Dandruff", "Oily Hair", "Hair Loss"]
        }
      },
      {
        "id": "4",
        "type": "address",
        "position": { "x": 1650, "y": 150 },
        "data": {
          "label": "Delivery Address",
          "platform": "whatsapp",
          "fieldLabel": "Address",
          "validationRules": {
            "required": true,
            "validatePostalCode": true
          }
        }
      },
      {
        "id": "5",
        "type": "homeDelivery",
        "position": { "x": 2000, "y": 150 },
        "data": {
          "label": "Schedule Delivery",
          "platform": "whatsapp",
          "description": "Schedule a home delivery"
        }
      },
      {
        "id": "6",
        "type": "whatsappQuestion",
        "position": { "x": 1650, "y": 400 },
        "data": {
          "label": "Follow-up Question",
          "platform": "whatsapp",
          "question": "Would you like to learn more about our products?"
        }
      },
      {
        "id": "meta-1",
        "type": "metaAudience",
        "position": { "x": 2000, "y": 400 },
        "data": {
          "label": "Meta Audience Sync",
          "platform": "whatsapp",
          "description": "Sync with Meta audiences"
        }
      }
    ],
    "edges": [
      {
        "id": "e1-name",
        "source": "1",
        "target": "name-1",
        "type": "default"
      },
      {
        "id": "e-name-2",
        "source": "name-1",
        "target": "2",
        "type": "default"
      },
      {
        "id": "e2-3",
        "source": "2",
        "target": "3",
        "type": "default"
      },
      {
        "id": "e3-4-button0",
        "source": "3",
        "sourceHandle": "button-0",
        "target": "4",
        "type": "default"
      },
      {
        "id": "e3-4-button1",
        "source": "3",
        "sourceHandle": "button-1",
        "target": "4",
        "type": "default"
      },
      {
        "id": "e3-6-button2",
        "source": "3",
        "sourceHandle": "button-2",
        "target": "6",
        "type": "default"
      },
      {
        "id": "e4-5",
        "source": "4",
        "target": "5",
        "type": "default"
      },
      {
        "id": "e6-meta",
        "source": "6",
        "target": "meta-1",
        "type": "default"
      }
    ]
  }
}

**IMPORTANT - Create Comprehensive Flows:**
- **ALWAYS start with information nodes** - Connect Start → name (or email/dob) → first interaction node
- **Create branching flows** - Quick Reply buttons should branch to different paths using sourceHandle
  - Button 0: {"source": "node-id", "sourceHandle": "button-0", "target": "target-id"}
  - Button 1: {"source": "node-id", "sourceHandle": "button-1", "target": "target-id"}
  - Button 2: {"source": "node-id", "sourceHandle": "button-2", "target": "target-id"}
- **Include multiple paths** - Not just linear chains, create branches and alternative flows
- **Add integration nodes** - Include metaAudience (for WhatsApp/Instagram), shopify, or other relevant integrations
- **Include fulfillment nodes** - Add homeDelivery, event, or retailStore when appropriate
- **Connect to existing start node (id: "1")** - do not create a new one
- **For delivery: Use Quick Reply (not Question) + Address + homeDelivery**
- **Write comprehensive questions** - full sentences, not "Choose:" or "Select:"
- **Use platform-specific node types** (whatsappQuestion, whatsappQuickReply, whatsappInteractiveList for WhatsApp)
- **Space nodes 350px apart** - x: 600, 950, 1300, 1650, etc.
- **Always include "label" and "platform"** in node data
- **Make flows rich and connected** - Include information collection, branching, integrations, and fulfillment`
}

function getEditResponseFormat(): string {
  return `{
  "message": "I've updated your flow. Here's what I changed...",
  "action": "edit",
  "updates": {
    "nodes": [
      {
        "id": "name-new",
        "type": "name",
        "position": { "x": 950, "y": 150 },
        "data": {
          "label": "Collect Name",
          "platform": "web",
          "fieldLabel": "Full Name",
          "validationRules": {
            "required": true,
            "minLength": 2
          }
        }
      },
      {
        "id": "quick-reply-id",
        "type": "webQuickReply",
        "position": { "x": 1300, "y": 150 },
        "data": {
          "label": "Product Selection",
          "platform": "web",
          "question": "Which product would you like to learn more about?",
          "buttons": ["Shampoo", "Conditioner", "Hair Mask"]
        }
      },
      {
        "id": "meta-new",
        "type": "metaAudience",
        "position": { "x": 1650, "y": 400 },
        "data": {
          "label": "Meta Audience Sync",
          "platform": "web",
          "description": "Sync with Meta audiences"
        }
      }
    ],
    "edges": [
      {
        "id": "e-existing-name",
        "source": "existing-node-id",
        "target": "name-new",
        "type": "default"
      },
      {
        "id": "e-name-quick",
        "source": "name-new",
        "target": "quick-reply-id",
        "type": "default"
      },
      {
        "id": "e-quick-address-button0",
        "source": "quick-reply-id",
        "sourceHandle": "button-0",
        "target": "address-node-id",
        "type": "default"
      },
      {
        "id": "e-quick-meta-button2",
        "source": "quick-reply-id",
        "sourceHandle": "button-2",
        "target": "meta-new",
        "type": "default"
      }
    ]
  }
}

**IMPORTANT - Create Comprehensive Updates:**
- **Add information nodes** - Include name, email, dob, or address when collecting user data
- **Create branching flows** - Quick Reply buttons should branch to different paths using sourceHandle
  - Button 0: {"source": "node-id", "sourceHandle": "button-0", "target": "target-id"}
  - Button 1: {"source": "node-id", "sourceHandle": "button-1", "target": "target-id"}
  - Button 2: {"source": "node-id", "sourceHandle": "button-2", "target": "target-id"}
- **ALL nodes must be connected** - every new/updated node connected to flow chain
- **Use Quick Reply (not Question) when you need buttons**
- **For delivery: MUST include Address + homeDelivery**
- **Add integrations** - Include metaAudience, shopify, or other relevant integrations
- **Write comprehensive questions** - full sentences, not "Choose:" or "Select:"
- **Use platform-specific node types** - space nodes 350px apart
- **Multiple edges from Quick Reply** - Each button can connect to a different node
- **Always include "label" and "platform"** in node data
- **Make flows rich and connected** - Include information collection, branching, integrations, and fulfillment`
}

function getAvailableNodeTypes(platform: Platform): string {
  // This function is now replaced by getNodeDocumentationForPrompt
  // But keeping it for backward compatibility - it will be overridden by the comprehensive docs
  return "See COMPREHENSIVE NODE DOCUMENTATION section above for detailed information about all available node types, their properties, limits, and usage guidelines."
}