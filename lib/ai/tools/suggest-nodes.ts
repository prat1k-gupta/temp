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

import type { SuggestedNode } from "@/types"

export type { SuggestedNode }

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
7. **CRITICAL - Node Type Selection:**
   - **For data collection, ALWAYS use super nodes (NOT question nodes):**
     - To collect email → use "email" (NOT whatsappQuestion/webQuestion)
     - To collect name → use "name" (NOT whatsappQuestion/webQuestion)
     - To collect date of birth → use "dob" (NOT whatsappQuestion/webQuestion)
     - To collect address → use "address" (NOT whatsappQuestion/webQuestion)
   - **Super nodes have built-in validation** - use them for any data collection needs
   - **Question nodes are ONLY for general questions**, not for collecting specific data fields
8. **IMPORTANT**: 
   - **Use platform-specific node types** for interaction nodes (e.g., "whatsappQuestion", "whatsappQuickReply", "whatsappList" for WhatsApp; "webQuestion", "webQuickReply" for web)
   - **Super nodes (name, email, dob, address) are platform-agnostic** - use them as-is (e.g., "email", not "whatsappEmail")
   - For each suggested node, generate the actual content that should be in that node:
     - For "question" nodes: Generate the question text (for general questions only)
     - For "quickReply" nodes: Generate the question text AND 2-3 button options, **ALWAYS include "label" field**
     - For "list" nodes: Generate the question text AND 3-5 list options, **ALWAYS include "label" field**
     - For "name", "email", "dob", "address" super nodes: Generate the prompt/question text (these nodes have built-in validation)
     - For other nodes: Generate appropriate content based on the node type
   - **ALWAYS include "label" field** in generatedContent for all nodes (e.g., "label": "Quick Reply", "label": "Email")

**Response Format (JSON array):**
[
  {
    "type": "email" (use "email" for email collection, NOT whatsappQuestion),
    "label": "Collect Email",
    "reason": "Why this node makes sense",
    "description": "What this node does",
    "previewContent": "A short preview of the generated content",
    "generatedContent": {
      "label": "Email" (ALWAYS include this),
      "question": "The prompt/question text for collecting email"
    }
  },
  {
    "type": "whatsappQuickReply" (use platform-specific type for interaction nodes),
    "label": "Quick Reply",
    "reason": "Why this node makes sense",
    "description": "What this node does",
    "previewContent": "A short preview of the generated content",
    "generatedContent": {
      "label": "Quick Reply" (ALWAYS include this),
      "question": "The question text",
      "buttons": [{"text": "Button 1"}, {"text": "Button 2"}] (for quickReply nodes)
    }
  }
]

**Examples of correct node type selection:**
- Collecting email → type: "email" (super node)
- Collecting name → type: "name" (super node)
- Collecting address → type: "address" (super node)
- General question → type: "whatsappQuestion" (interaction node)
- Question with buttons → type: "whatsappQuickReply" (interaction node)`

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
  const baseInfo = `
**INFORMATION NODES (Super Nodes - Use these for data collection, NOT question nodes):**
- name: Collect and validate user's name (super node with built-in validation)
- email: Collect and validate user's email (super node with built-in validation)
- dob: Collect and validate user's date of birth (super node with built-in validation)
- address: Collect and validate user's address (super node with built-in validation)

⚠️ IMPORTANT: When you need to collect email, name, DOB, or address, use these super nodes (e.g., "email"), NOT question nodes (e.g., "whatsappQuestion"). Super nodes have built-in validation and are specifically designed for data collection.`

  const baseLogic = `
**LOGIC NODES (Flow Control & Branching):**
- condition: Branch flow based on conditions (supports AND/OR logic)`

  const baseFulfillment = `
**FULFILLMENT NODES (Delivery & Services):**
- homeDelivery: Schedule at-home delivery
- event: Book event or appointment
- retailStore: Find nearby retail stores`

  const baseIntegration = `
**INTEGRATION NODES (External Platforms):**
- shopify: Connect to Shopify store
- stripe: Process payments via Stripe
- zapier: Connect to 5000+ apps via Zapier
- google: Sync with Google Sheets
- salesforce: CRM integration
- mailchimp: Email marketing integration
- twilio: SMS & Voice integration
- slack: Team notifications
- airtable: Database sync`

  if (platform === "whatsapp") {
    return `${baseInfo}

**INTERACTION NODES (WhatsApp - Use these exact types):**
- whatsappQuestion: Ask users a question
- whatsappQuickReply: Question with button options (max 3 buttons)
- whatsappList: Interactive list menu (max 10 options)
- whatsappMessage: Send a WhatsApp message

${baseLogic}

${baseFulfillment}

${baseIntegration}
- metaAudience: Sync with Meta audiences

**IMPORTANT:** Only use the node types listed above. Use exact type names (e.g., "whatsappQuestion", not "question").`
  }

  if (platform === "instagram") {
    return `${baseInfo}

**INTERACTION NODES (Instagram - Use these exact types):**
- instagramQuestion: Ask users a question
- instagramQuickReply: Question with button options (max 3 buttons)
- instagramList: Interactive list menu (max 10 options)
- instagramDM: Send an Instagram direct message
- instagramStory: Create an Instagram story

${baseLogic}

${baseFulfillment}

${baseIntegration}
- metaAudience: Sync with Meta audiences

**IMPORTANT:** Only use the node types listed above. Use exact type names (e.g., "instagramQuestion", not "question").`
  }

  // Web platform
  return `${baseInfo}

**INTERACTION NODES (Web - Use these exact types):**
- webQuestion: Ask users a question
- webQuickReply: Question with button options

${baseLogic}

${baseFulfillment}

${baseIntegration}

**IMPORTANT:** Only use the node types listed above. Use exact type names (e.g., "webQuestion", not "question").`
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
          previewContent: item.previewContent || generatePreviewContent(item),
          generatedContent: item.generatedContent || {},
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
        previewContent: item.previewContent || generatePreviewContent(item),
        generatedContent: item.generatedContent || {},
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
      previewContent: "What would you like to know?",
      generatedContent: {
        question: "What would you like to know?",
      },
    },
  ].slice(0, maxSuggestions)
}

function generatePreviewContent(item: any): string {
  if (item.generatedContent) {
    if (item.generatedContent.question) {
      const question = item.generatedContent.question
      if (item.generatedContent.buttons && item.generatedContent.buttons.length > 0) {
        const buttons = item.generatedContent.buttons.map((b: any) => b.text || b.label).join(", ")
        return `${question} [${buttons}]`
      }
      if (item.generatedContent.options && item.generatedContent.options.length > 0) {
        const options = item.generatedContent.options.map((o: any) => o.text).join(", ")
        return `${question} [${options}]`
      }
      return question
    }
    if (item.generatedContent.text) {
      return item.generatedContent.text
    }
  }
  return item.description || item.reason || ""
}

