import { buildAIContext, getPlatformGuidelines, getNodeTypeGuidelines } from "../core/ai-context"
import { getAIClient } from "../core/ai-client"
import type { Platform } from "@/types"

export interface SuggestNodesRequest {
  currentNodeType: string
  platform: Platform
  flowContext?: string
  existingNodes?: Array<{ type: string; label?: string }>
  maxSuggestions?: number
}

export interface SuggestedNode {
  type: string
  label: string
  reason: string
  description: string
}

export interface SuggestNodesResponse {
  suggestions: SuggestedNode[]
}

/**
 * AI Tool: Suggest Next Nodes
 * Suggests relevant next nodes based on current node, flow context, and existing flow structure
 */
export async function suggestNodes(
  request: SuggestNodesRequest
): Promise<SuggestNodesResponse | null> {
  try {
    const context = buildAIContext({
      nodeType: request.currentNodeType,
      platform: request.platform,
    })

    const maxSuggestions = request.maxSuggestions || 2

    // Build system prompt
    const systemPrompt = buildSystemPrompt(context, request)

    // Build user prompt
    const userPrompt = buildUserPrompt(request)

    // Get AI client
    const aiClient = getAIClient()

    // Call AI
    const response = await aiClient.generate({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxTokens: 500,
    })

    const content = response.text
    if (!content) {
      console.error("[suggest-nodes] No content in AI response")
      return null
    }

    // Parse AI response
    const suggestions = parseSuggestions(content, maxSuggestions)

    return { suggestions }
  } catch (error) {
    console.error("[suggest-nodes] Error suggesting nodes:", error)
    return null
  }
}

function buildSystemPrompt(
  context: ReturnType<typeof buildAIContext>,
  request: SuggestNodesRequest
): string {
  const platform = request.platform
  const currentNodeType = request.currentNodeType

  const platformGuidelines = getPlatformGuidelines(platform)
  const nodeTypeGuidelines = getNodeTypeGuidelines(currentNodeType)

  let prompt = `You are an expert conversational flow designer for ${platform} platforms.

Your task is to suggest the most relevant next nodes that would logically follow after a "${currentNodeType}" node.

**Context:**
${platformGuidelines}
${nodeTypeGuidelines}

**Flow Purpose:**
${request.flowContext || "General conversational flow"}

**Available Node Types for ${platform}:**
${getAvailableNodeTypes(platform)}

**Guidelines:**
1. Suggest exactly ${request.maxSuggestions || 2} nodes
2. Choose nodes that make logical sense after the current node
3. Consider the flow context and purpose
4. Avoid suggesting nodes that are already in the flow (if provided)
5. Provide a clear reason for each suggestion
6. Focus on creating a smooth user experience

**Response Format (JSON array):**
[
  {
    "type": "nodeType",
    "label": "Display Name",
    "reason": "Why this node makes sense",
    "description": "What this node does"
  }
]`

  return prompt
}

function buildUserPrompt(request: SuggestNodesRequest): string {
  let prompt = `Current node: ${request.currentNodeType}
Platform: ${request.platform}`

  if (request.flowContext) {
    prompt += `\nFlow context: ${request.flowContext}`
  }

  if (request.existingNodes && request.existingNodes.length > 0) {
    prompt += `\n\nExisting nodes in flow:`
    request.existingNodes.forEach((node, index) => {
      prompt += `\n${index + 1}. ${node.type}${node.label ? ` (${node.label})` : ""}`
    })
  }

  prompt += `\n\nSuggest ${request.maxSuggestions || 2} relevant next nodes.`

  return prompt
}

function getAvailableNodeTypes(platform: Platform): string {
  const baseTypes = `
- question: Ask the user a question
- quickReply: Provide quick reply buttons (max 3 for WhatsApp/Instagram)
- list: Provide a list of options (max 10 for WhatsApp/Instagram)
- condition: Branch flow based on conditions
- name: Collect user's name (super node with validation)
- email: Collect user's email (super node with validation)
- dob: Collect date of birth (super node with validation)
- address: Collect user's address (super node with validation)
- homeDelivery: Schedule home delivery
- event: Schedule an event
- retailStore: Find retail store locations
- shopify: Integrate with Shopify
- metaAudiences: Integrate with Meta Audiences`

  if (platform === "whatsapp") {
    return baseTypes + `
- whatsappMessage: Send a WhatsApp message
- whatsappList: WhatsApp interactive list`
  }

  if (platform === "instagram") {
    return baseTypes + `
- instagramDM: Send an Instagram DM
- instagramStory: Create an Instagram story`
  }

  return baseTypes + `
- webMessage: Send a web message`
}

function parseSuggestions(content: string, maxSuggestions: number): SuggestedNode[] {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) {
        return parsed.slice(0, maxSuggestions).map((item: any) => ({
          type: item.type || "",
          label: item.label || item.type,
          reason: item.reason || "",
          description: item.description || "",
        }))
      }
    }

    // Fallback: Try to parse the entire content as JSON
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.slice(0, maxSuggestions).map((item: any) => ({
        type: item.type || "",
        label: item.label || item.type,
        reason: item.reason || "",
        description: item.description || "",
      }))
    }
  } catch (error) {
    console.error("[suggest-nodes] Error parsing suggestions:", error)
  }

  // Fallback: Return default suggestions
  return [
    {
      type: "question",
      label: "Question",
      reason: "A common next step in conversational flows",
      description: "Ask the user a question to gather information",
    },
  ].slice(0, maxSuggestions)
}

