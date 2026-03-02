import { buildAIContext, getPlatformGuidelines, getNodeTypeGuidelines } from "../core/ai-context"
import { getSimplifiedNodeDocumentation } from "../core/node-documentation"
import { getAIClient } from "../core/ai-client"
import type { Platform } from "@/types"
import { z } from "zod"

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
      const existingNodeTypes = new Set((request.existingNodes || []).map(n => n.type.toLowerCase()))
      const hasHomeDelivery = existingNodeTypes.has("homedelivery") || 
        (request.existingNodes || []).some(n => n.type.toLowerCase().includes("homedelivery"))
      
      suggestions = suggestions.filter(s => {
        const suggestionType = s.type.toLowerCase()
        
        // CRITICAL: trackingNotification should ONLY be suggested when homeDelivery exists
        if (suggestionType === "trackingnotification" && !hasHomeDelivery) {
          console.log("[suggest-nodes] Filtering out trackingNotification - homeDelivery not found in flow")
          return false
        }
        
        // Allow if it's a different type, or if it's a super node that might be used multiple times in different contexts
        const isSuperNode = ['name', 'email', 'dob', 'address'].includes(suggestionType)
        return !existingNodeTypes.has(suggestionType) || isSuperNode
      })

      // If we filtered out suggestions, try to get more (but don't exceed max)
      if (suggestions.length < maxSuggestions && existingNodeTypes.size > 0) {
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
  context: ReturnType<typeof buildAIContext>,
  request: SuggestNodesRequest
): string {
  const platform = request.platform
  const currentNodeType = request.currentNodeType

  const platformGuidelines = getPlatformGuidelines(platform)
  const nodeTypeGuidelines = getNodeTypeGuidelines(currentNodeType, platform)
  
  // Get compact node documentation (types + categories + content hints)
  const nodeDocs = getSimplifiedNodeDocumentation(platform)

  // Analyze existing nodes to determine flow pattern
  const existingNodeTypes = request.existingNodes?.map(n => n.type) || []
  const flowPattern = detectFlowPattern(request.flowContext, existingNodeTypes, currentNodeType)

  let prompt = `You are an expert conversational flow designer for ${platform} platforms.

Your task is to suggest the most relevant next nodes that would logically follow after a "${currentNodeType}" node. Understand the user need and context of current conversation and suggest nodes that enhance user experience.

**Platform Guidelines:**
${platformGuidelines}

**Current Node Context:**
${nodeTypeGuidelines}

**Flow Purpose:**
${request.flowContext || "General conversational flow"}

**Detected Flow Pattern:**
${flowPattern.description}

**Flow Pattern Guidelines:**
${flowPattern.guidelines}

**AVAILABLE NODE TYPES:**
${nodeDocs}

**Guidelines:**
1. Suggest exactly ${request.maxSuggestions || 2} nodes
2. **CRITICAL - Follow the flow pattern**: ${flowPattern.description}
3. **CRITICAL - Avoid duplicates**: DO NOT suggest nodes that already exist in the flow. Check the existing nodes list carefully.
4. Choose nodes that make logical sense after the current node based on the flow pattern
5. Consider the flow context and purpose
6. Provide a clear reason for each suggestion
7. Focus on creating a smooth user experience
8. **Suggest nodes in logical sequence**: Follow the pattern ${flowPattern.sequence}
7. **CRITICAL - Node Type Selection:**
   - **For data collection, ALWAYS use super nodes (NOT question nodes):**
     - To collect email → use "email" (NOT whatsappQuestion/webQuestion)
     - To collect name → use "name" (NOT whatsappQuestion/webQuestion)
     - To collect date of birth → use "dob" (NOT whatsappQuestion/webQuestion)
     - To collect address → use "address" (NOT whatsappQuestion/webQuestion)
   - **Super nodes have built-in validation** - use them for any data collection needs
   - **Question nodes are ONLY for general questions**, not for collecting specific data fields
8. **IMPORTANT**: 
   - **Use platform-specific node types** for interaction nodes (e.g., "whatsappQuestion", "whatsappQuickReply", "whatsappInteractiveList" for WhatsApp; "webQuestion", "webQuickReply" for web)
   - **Super nodes (name, email, dob, address) are platform-agnostic** - use them as-is (e.g., "email", not "whatsappEmail")
   - For each suggested node, generate the actual content that should be in that node:
     - For "question" nodes: Generate the question text (for general questions only)
     - For "quickReply" nodes: Generate the question text AND 2-3 button options, **ALWAYS include "label" field**
     - For "list" nodes: Generate the question text AND 3-5 list options, **ALWAYS include "label" field**
     - For "name", "email", "dob", "address" super nodes: Generate the prompt/question text (these nodes have built-in validation)
     - For other nodes: Generate appropriate content based on the node type
   - **ALWAYS include "label" field** in generatedContent for all nodes (e.g., "label": "Quick Reply", "label": "Email")

**OUTPUT FORMAT:**
Return a JSON object with exactly ${request.maxSuggestions || 2} suggestions in this format:
{
  "suggestions": [
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
}

**CRITICAL:** Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON object.

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
    prompt += `\n\nFlow Context: ${request.flowContext}`
  }

  if (request.existingNodes && request.existingNodes.length > 0) {
    prompt += `\n\n**EXISTING NODES IN FLOW (${request.existingNodes.length}) - DO NOT SUGGEST THESE AGAIN:**`
    request.existingNodes.forEach((node, index) => {
      prompt += `\n${index + 1}. Type: "${node.type}"${node.label ? `, Label: "${node.label}"` : ""}`
    })
    prompt += `\n\n**CRITICAL**: You MUST NOT suggest any of the above node types unless they serve a completely different purpose. Check the type field carefully - if a node type already exists, suggest a DIFFERENT node type.`
    
    // List node types that already exist for clarity
    const existingTypes = [...new Set(request.existingNodes.map(n => n.type))]
    prompt += `\n\n**Already used node types (DO NOT repeat):** ${existingTypes.join(", ")}`
  }

  prompt += `\n\nSuggest ${request.maxSuggestions || 2} relevant next nodes that would logically follow after the current "${request.currentNodeType}" node. Make sure each suggestion is a DIFFERENT node type that doesn't already exist in the flow.`

  return prompt
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

function getAvailableNodeTypes(platform: Platform): string {
  // This function is now replaced by getNodeDocumentationForPrompt
  // But keeping it for backward compatibility - it will be overridden by the comprehensive docs
  return "See COMPREHENSIVE NODE DOCUMENTATION section above for detailed information about all available node types, their properties, limits, and usage guidelines."
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

