import { buildAIContext, getPlatformGuidelines } from "../core/ai-context"
import { getSimplifiedNodeDocumentation } from "../core/node-documentation"
import { getAIClient } from "../core/ai-client"
import { buildFlowGraphString } from "./generate-flow"
import { getBaseNodeType } from "@/utils/platform-helpers"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { z } from "zod"

export interface SuggestNodesRequest {
  currentNodeType: string
  platform: Platform
  flowContext?: string
  existingNodes?: Array<{ id: string; type: string; label?: string }>
  edges?: Array<{ source: string; target: string; sourceHandle?: string }>
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

    // Define Zod schema for structured output
    const generatedContentSchema = z.object({
      label: z.string().describe("Node label"),
      question: z.string().optional().describe("Question text (for question/quickReply/list nodes)"),
      buttons: z.array(z.object({
        text: z.string()
      })).optional().describe("Button options (for quickReply nodes)"),
      options: z.array(z.object({
        text: z.string(),
        description: z.string().optional()
      })).optional().describe("List options (for list nodes)"),
      text: z.string().optional().describe("Message text (for message nodes)")
    }).passthrough()

    const suggestionSchema = z.object({
      type: z.string().describe("Node type (use exact platform-specific types)"),
      label: z.string().describe("Display label for the node"),
      reason: z.string().describe("Why this node makes sense after the current node"),
      description: z.string().describe("What this node does"),
      previewContent: z.string().optional().describe("Short preview of the generated content"),
      generatedContent: generatedContentSchema.describe("The actual content for this node")
    })

    const responseSchema = z.object({
      suggestions: z.array(suggestionSchema).length(maxSuggestions).describe(`Array of exactly ${maxSuggestions} suggested nodes`)
    })

    // Get AI client
    const aiClient = getAIClient()

    // Call AI with structured output
    try {
      const response = await aiClient.generateJSON<{
        suggestions: SuggestedNode[]
      }>({
        systemPrompt: systemPrompt + `\n\n**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object with exactly ${maxSuggestions} suggestions.`,
        userPrompt,
        schema: responseSchema
      })

      // Transform and validate suggestions
      let suggestions = (response.suggestions || []).slice(0, maxSuggestions).map((item: any) => ({
        type: item.type || "",
        label: item.label || item.type,
        reason: item.reason || "",
        description: item.description || "",
        previewContent: item.previewContent || generatePreviewContent(item),
        generatedContent: item.generatedContent || {},
      }))

      // Filter out duplicate node types that already exist
      // Normalize to base types so "whatsappQuestion" matches suggested "question" etc.
      const existingBaseTypes = new Set(
        (request.existingNodes || []).map(n => getBaseNodeType(n.type).toLowerCase())
      )
      const hasHomeDelivery = existingBaseTypes.has("homedelivery")

      suggestions = suggestions.filter(s => {
        const suggestionBase = getBaseNodeType(s.type).toLowerCase()

        // CRITICAL: trackingNotification should ONLY be suggested when homeDelivery exists
        if (suggestionBase === "trackingnotification" && !hasHomeDelivery) {
          console.log("[suggest-nodes] Filtering out trackingNotification - homeDelivery not found in flow")
          return false
        }

        // Allow if it's a different base type, or if it's a super node that can appear multiple times
        const isSuperNode = ['name', 'email', 'dob', 'address'].includes(suggestionBase)
        if (existingBaseTypes.has(suggestionBase) && !isSuperNode) {
          console.log(`[suggest-nodes] Filtering out "${s.type}" — base type "${suggestionBase}" already exists in flow`)
          return false
        }
        return true
      })

      // If we filtered out suggestions, try to get more (but don't exceed max)
      if (suggestions.length < maxSuggestions && existingBaseTypes.size > 0) {
        console.log(`[suggest-nodes] Filtered out ${maxSuggestions - suggestions.length} duplicate suggestions`)
      }

      return { suggestions: suggestions.slice(0, maxSuggestions) }
    } catch (error) {
      console.error("[suggest-nodes] Error generating suggestions:", error)
      // Fallback to text generation with parsing
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

      // Parse AI response using existing parser
      const suggestions = parseSuggestions(content, maxSuggestions)
      return { suggestions }
    }
  } catch (error) {
    console.error("[suggest-nodes] Error suggesting nodes:", error)
    return null
  }
}

function buildSystemPrompt(
  _context: ReturnType<typeof buildAIContext>,
  request: SuggestNodesRequest
): string {
  const platform = request.platform
  const nodeDocs = getSimplifiedNodeDocumentation(platform)
  const platformGuidelines = getPlatformGuidelines(platform)
  const n = request.maxSuggestions || 2

  return `You are an expert conversational flow designer for ${platform}.

${platformGuidelines}

**AVAILABLE NODE TYPES:**
${nodeDocs}

**NODE TYPE SELECTION RULES:**
- Data collection → ALWAYS use super nodes: "name", "email", "dob", "address" (platform-agnostic)
- Interaction nodes → use platform-specific types: e.g. "whatsappQuestion", "whatsappQuickReply", "whatsappInteractiveList" for WhatsApp
- quickReply vs list: if ≤3 choices → use quickReply; if 4+ choices → use list (interactiveList)
- Question nodes are ONLY for open-ended questions, NOT for collecting name/email/dob/address

**CONTENT GENERATION RULES:**
- **CRITICAL: All content MUST be specific to the flow's purpose.** Read the flow context and generate realistic, contextual content — NOT generic placeholders.
- NEVER use placeholder text like "Option A", "Option B", "Please select one of the following options", "What would you like to know?", etc.
- For quickReply: generate a contextual question + 2-3 button labels that fit the flow's purpose
- For list: generate a contextual question + list options relevant to what the flow is about
- For question: generate a question that makes sense in the flow's context
- For message: generate a message that advances the conversation naturally
- For super nodes: generate a prompt that fits the flow tone (e.g. "What's your email so we can send the report?" not "Please enter your email")
- ALWAYS include "label" in generatedContent

**OUTPUT FORMAT:**
Return JSON with exactly ${n} suggestions:
{
  "suggestions": [
    {
      "type": "exact node type string",
      "label": "Display label",
      "reason": "Why this fits after the current node",
      "description": "What this node does",
      "previewContent": "Short preview of content",
      "generatedContent": { "label": "...", "question": "...", "buttons": [{"text": "..."}], "options": [{"text": "..."}] }
    }
  ]
}`
}

function buildUserPrompt(request: SuggestNodesRequest): string {
  const parts: string[] = []

  parts.push(`Current node: "${request.currentNodeType}"`)
  parts.push(`Platform: ${request.platform}`)

  if (request.flowContext) {
    parts.push(`\nFlow purpose: ${request.flowContext}`)
  }

  // Flow graph — visual structure
  if (request.existingNodes && request.existingNodes.length > 0 && request.edges) {
    const minimalNodes: Node[] = request.existingNodes.map(n => ({
      id: n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: { label: n.label || "" },
    }))
    const minimalEdges: Edge[] = request.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
    }))
    parts.push(`\nCurrent flow:\n${buildFlowGraphString(minimalNodes, minimalEdges)}`)
  }

  // Existing base types — single deduped list
  if (request.existingNodes && request.existingNodes.length > 0) {
    const existingBaseTypes = [...new Set(request.existingNodes.map(n => getBaseNodeType(n.type)))]
    parts.push(`\nAlready used types (do NOT suggest these or their platform variants): ${existingBaseTypes.join(", ")}`)
  }

  // Detected flow pattern
  const existingNodeTypes = request.existingNodes?.map(n => n.type) || []
  const flowPattern = detectFlowPattern(request.flowContext, existingNodeTypes, request.currentNodeType)
  parts.push(`\nFlow pattern: ${flowPattern.description}`)
  parts.push(`Suggested sequence: ${flowPattern.sequence}`)
  parts.push(flowPattern.guidelines)

  parts.push(`\nSuggest ${request.maxSuggestions || 2} next nodes with contextual content specific to this flow's purpose.`)

  return parts.join("\n")
}

function detectFlowPattern(
  flowContext: string | undefined,
  existingNodeTypes: string[],
  currentNodeType: string
): { description: string; guidelines: string; sequence: string } {
  const contextLower = (flowContext || "").toLowerCase()
  const allNodeTypes = [...existingNodeTypes, currentNodeType]
  const nodeTypesLower = allNodeTypes.map(t => t.toLowerCase())

  // Check for fulfillment-related keywords and nodes
  const hasFulfillmentKeywords = 
    contextLower.includes("delivery") || 
    contextLower.includes("fulfillment") || 
    contextLower.includes("shipping") ||
    contextLower.includes("order") ||
    contextLower.includes("purchase") ||
    contextLower.includes("product")
  
  const hasFulfillmentNodes = 
    nodeTypesLower.some(t => t.includes("address")) ||
    nodeTypesLower.some(t => t.includes("delivery")) ||
    nodeTypesLower.some(t => t.includes("homeDelivery"))
  
  const hasHomeDelivery = nodeTypesLower.some(t => t === "homedelivery")

  // Check for feedback-related keywords
  const hasFeedbackKeywords = 
    contextLower.includes("feedback") || 
    contextLower.includes("review") || 
    contextLower.includes("rating") ||
    contextLower.includes("experience") ||
    contextLower.includes("trial") ||
    contextLower.includes("survey")

  // Check for interaction/data collection patterns
  const hasDataCollectionNodes = 
    nodeTypesLower.some(t => t === "name" || t === "email" || t === "dob" || t === "address")
  
  const hasInteractionNodes = 
    nodeTypesLower.some(t => t.includes("question") || t.includes("quickReply") || t.includes("list"))

  // Determine flow pattern
  if (hasFulfillmentKeywords || hasFulfillmentNodes) {
    return {
      description: "Fulfillment Flow - Focus on order processing, delivery, and tracking",
      guidelines: `
**Fulfillment Flow Pattern:**
1. **Address Collection** → Use "address" super node to collect delivery address
2. **Schedule Delivery** → Use fulfillment nodes (homeDelivery, event, retailStore) or interaction nodes to schedule
3. **Tracking Notification** → Use message/question nodes to provide tracking information
4. **Thank You Message** → End with a confirmation/thank you message
5. **Integrations** → Add in the middle if needed (Shopify, Stripe, etc.)

**Current Stage Analysis:**
- Has address collection: ${nodeTypesLower.some(t => t.includes("address")) ? "Yes" : "No"}
- Has delivery scheduling: ${nodeTypesLower.some(t => t.includes("delivery") || t.includes("event") || t.includes("store")) ? "Yes" : "No"}
- Has tracking: ${nodeTypesLower.some(t => t.includes("track") || t.includes("notification")) ? "Yes" : "No"}

**Next Steps:**
- If no address → suggest "address" node
- If address exists but no delivery → suggest "homeDelivery" node
- If homeDelivery exists but no tracking → suggest "trackingNotification" node (ONLY suggest trackingNotification when homeDelivery exists)
- If delivery and tracking exist → suggest thank you message
- If all fulfillment steps done → suggest thank you message

**CRITICAL - Tracking Notification Rules:**
- trackingNotification node should ONLY be suggested when homeDelivery node exists in the flow
- trackingNotification comes AFTER homeDelivery in the flow sequence
- Use type "trackingNotification" (not question/message nodes) for delivery tracking
- Current flow has homeDelivery: ${hasHomeDelivery ? "Yes - trackingNotification can be suggested" : "No - DO NOT suggest trackingNotification"}`,
      sequence: "Address Collection → Schedule Delivery → Tracking Notification → Thank You"
    }
  }

  if (hasFeedbackKeywords) {
    return {
      description: "Feedback Flow - Focus on collecting user feedback and reviews",
      guidelines: `
**Feedback Flow Pattern:**
1. **Initial Interaction** → Start with question/quickReply to understand feedback type
2. **Data Collection** → Collect relevant info (email for follow-up, name for personalization)
3. **Feedback Questions** → Use question/quickReply nodes to ask about experience, product, or trial
4. **Thank You Message** → End with appreciation message
5. **Integrations** → Add in the middle if needed (Mailchimp, Salesforce, etc.)

**Current Stage Analysis:**
- Has data collection: ${hasDataCollectionNodes ? "Yes" : "No"}
- Has feedback questions: ${hasInteractionNodes ? "Yes" : "No"}

**Next Steps:**
- If no data collection → suggest "email" or "name" nodes
- If data collected but no feedback questions → suggest question/quickReply nodes for feedback
- If feedback collected → suggest thank you message`,
      sequence: "Interaction → Data Collection → Feedback Questions → Thank You"
    }
  }

  // Default: Interaction/Data Collection flow
  return {
    description: "Interaction Flow - Focus on engagement, data collection, and user experience",
    guidelines: `
**Interaction Flow Pattern:**
1. **Initial Interaction** → Start with question/quickReply/list nodes to engage user
2. **Data Collection** → Use super nodes (name, email, dob, address) to collect information
3. **Questionnaire** → Use question/quickReply nodes to gather more details
4. **Thank You Message** → End with confirmation or next steps message
5. **Integrations** → Add in the middle if needed (Shopify, Meta, etc.)

**Current Stage Analysis:**
- Has interaction nodes: ${hasInteractionNodes ? "Yes" : "No"}
- Has data collection: ${hasDataCollectionNodes ? "Yes" : "No"}
- Has questionnaire: ${hasInteractionNodes && hasDataCollectionNodes ? "Yes" : "No"}

**Next Steps:**
- If no interaction yet → suggest question/quickReply nodes
- If interaction exists but no data collection → suggest super nodes (email, name, etc.)
- If data collected but no questionnaire → suggest question/quickReply for additional info
- If questionnaire done → suggest thank you message or next steps`,
    sequence: "Interaction → Data Collection → Questionnaire → Thank You"
  }
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

