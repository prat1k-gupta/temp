import { getPlatformGuidelines } from "../core/ai-context"
import { getSimplifiedNodeDocumentation, getNodeSelectionRules, getNodeDependencies, getUserTemplateDocumentation } from "../core/node-documentation"
import { NODE_TEMPLATES } from "@/constants/node-categories"
import { getAIClient } from "../core/ai-client"
import { buildFlowGraphString } from "./flow-graph-string"
import { getBaseNodeType } from "@/utils/platform-helpers"
import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"
import { z } from "zod"

export interface SuggestNodesRequest {
  currentNodeType: string
  currentNodeId?: string
  platform: Platform
  flowContext?: string
  existingNodes?: Array<{
    id: string
    type: string
    label?: string
    question?: string
    text?: string
    buttons?: Array<{ text?: string; id?: string }>
    options?: Array<{ text?: string; id?: string }>
    storeAs?: string
  }>
  edges?: Array<{ source: string; target: string; sourceHandle?: string }>
  maxSuggestions?: number
  userTemplates?: Array<{ id: string; name: string; aiMetadata?: TemplateAIMetadata }>
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
    const maxSuggestions = request.maxSuggestions || 2

    // Build system prompt
    const systemPrompt = buildSystemPrompt(request)

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
      text: z.string().optional().describe("Message text (for message nodes)"),
      storeAs: z.string().optional().describe("Variable name to store the user response (for question/quickReply/list nodes)"),
      variables: z.array(z.object({
        name: z.string(),
        value: z.string()
      })).optional().describe("Variables to set (for action nodes, max 10)"),
      tags: z.array(z.string()).optional().describe("Tags to add/remove (for action nodes, max 10)"),
      tagAction: z.enum(["add", "remove"]).optional().describe("Whether to add or remove tags (for action nodes)")
    })

    const suggestionSchema = z.object({
      type: z.string().describe("Node type (use exact platform-specific types)"),
      label: z.string().describe("Display label for the node"),
      reason: z.string().describe("Why this node makes sense after the current node"),
      description: z.string().describe("What this node does"),
      previewContent: z.string().optional().describe("Short preview of the generated content"),
      generatedContent: generatedContentSchema.describe("The actual content for this node"),
      sourceButtonIndex: z.number().optional().describe("If the selected node is a quickReply/list, which button (0-based) this suggestion connects from"),
    })

    const responseSchema = z.object({
      suggestions: z.array(suggestionSchema).describe(`Array of exactly ${maxSuggestions} suggested nodes`)
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
        schema: responseSchema,
        model: 'claude-haiku',
      })

      // Transform and validate suggestions
      let suggestions = (response.suggestions || []).slice(0, maxSuggestions).map((item: any) => ({
        type: item.type || "",
        label: item.label || item.type,
        reason: item.reason || "",
        description: item.description || "",
        sourceButtonIndex: item.sourceButtonIndex,
        previewContent: item.previewContent || generatePreviewContent(item),
        generatedContent: item.generatedContent || {},
      }))

      // Filter out duplicate node types that already exist
      // Normalize to base types so "whatsappQuestion" matches suggested "question" etc.
      const existingBaseTypes = new Set(
        (request.existingNodes || []).map(n => getBaseNodeType(n.type).toLowerCase())
      )

      suggestions = suggestions.filter(s => {
        const suggestionBase = getBaseNodeType(s.type).toLowerCase()

        // Check dependency metadata — filter out nodes whose dependencies don't exist in the flow at all
        const template = NODE_TEMPLATES.find(t => t.type.toLowerCase() === suggestionBase)
        if (template?.ai?.dependencies) {
          const missingDep = template.ai.dependencies.some(
            dep => !existingBaseTypes.has(dep.toLowerCase())
          )
          if (missingDep) {
            console.log(`[suggest-nodes] Filtering out "${s.type}" — missing dependency: ${template.ai.dependencies.join(", ")}`)
            return false
          }
        }

        // Filter out node types that are unique-per-flow (information, fulfillment, integration)
        // Interaction/logic/action nodes (question, quickReply, message, condition) can appear multiple times
        const isUniquePerFlow = template?.category === "information" ||
          template?.category === "fulfillment" ||
          template?.category === "integration"
        if (existingBaseTypes.has(suggestionBase) && isUniquePerFlow) {
          console.log(`[suggest-nodes] Filtering out "${s.type}" — unique node type already exists in flow`)
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
        model: 'claude-haiku',
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

function buildSystemPrompt(request: SuggestNodesRequest): string {
  const platform = request.platform
  const nodeDocs = getSimplifiedNodeDocumentation(platform)
  const userTemplateDocs = getUserTemplateDocumentation(platform, request.userTemplates || [])
  const platformGuidelines = getPlatformGuidelines(platform)
  const n = request.maxSuggestions || 2

  const selectionRules = getNodeSelectionRules(platform, request.userTemplates)
  const dependencyRules = getNodeDependencies(platform)

  return `You are an expert conversational flow designer for ${platform}.

${platformGuidelines}

**AVAILABLE NODE TYPES:**
${nodeDocs}${userTemplateDocs}

${selectionRules}
${dependencyRules ? `\n${dependencyRules}` : ""}

**SUGGESTION RULES:**
- Study the flow graph to understand which branch the selected node is on and what comes before/after it.
- Suggest nodes that make sense for the selected node's position and branch context.
- Do NOT suggest fulfillment/delivery/tracking on rejection or decline branches.
- Generate realistic, contextual content — NEVER use placeholder text like "Option A", "Please select one".
- ALWAYS include "label" in generatedContent.
- If the selected node is a quickReply/list with buttons, each suggestion MUST include "sourceButtonIndex" (0-based) indicating which button it connects from. Different suggestions should connect from different buttons.
- For question/quickReply/list suggestions, include a "storeAs" field with a short snake_case variable name.

**VARIABLE INTERPOLATION:**
- Nodes with {storeAs: "var_name"} in the flow graph store user responses as variables.
- Button/list responses: use {{var_name_title}} to get the display text the user chose.
- Text input responses: use {{var_name}} directly.
- apiFetch responseMapping variables: available as {{varName}} after a successful API call.
- **System variables** (always available): {{system.contact_name}}, {{system.phone_number}}.
- **Global variables** (org-wide): {{global.variable_name}}.
- When generating message text, reference earlier variables using {{var_name}} or {{var_name_title}} — NEVER use [placeholder] syntax.

**API FETCH NODES:**
- apiFetch nodes have TWO output handles: "success" and "error".
- When suggesting nodes after an apiFetch, consider both success and error paths.
- responseMapping convention: {varName: "jsonPath"} — e.g. {"user_id": "data.user_id"} maps the API response to session variables.

**ACTION NODES:**
- action nodes set variables and/or manage contact tags silently (no message sent, auto-advances).
- Content: variables ([{name, value}], max 10), tagAction ("add"|"remove"), tags (string[], max 10).
- Values and tags support {{variable}} interpolation.
- Tags can be checked in condition nodes using has_tag/not_has_tag operators on the _tags field.
- For action node suggestions, include "variables" and/or "tags"+"tagAction" in generatedContent.

**OUTPUT FORMAT:**
Return JSON with exactly ${n} suggestions:
{
  "suggestions": [
    {
      "type": "exact node type string",
      "label": "Display label",
      "reason": "Why this node fits at this position",
      "description": "What this node does",
      "previewContent": "Short preview of content",
      "sourceButtonIndex": 0,
      "generatedContent": { "label": "...", "question": "...", "buttons": [{"text": "..."}], "options": [{"text": "..."}] }
    }
  ]
}`
}

function buildUserPrompt(request: SuggestNodesRequest): string {
  const parts: string[] = []

  parts.push(`Platform: ${request.platform}`)

  if (request.flowContext) {
    parts.push(`Flow purpose: ${request.flowContext}`)
  }

  // Flow graph — the AI reads this to understand structure and branches
  if (request.existingNodes && request.existingNodes.length > 0 && request.edges) {
    const minimalNodes: Node[] = request.existingNodes.map(n => ({
      id: n.id,
      type: n.type,
      position: { x: 0, y: 0 },
      data: {
        label: n.label || "",
        question: n.question,
        text: n.text,
        buttons: n.buttons,
        options: n.options,
        storeAs: n.storeAs,
      },
    }))
    const minimalEdges: Edge[] = request.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
    }))
    parts.push(`\nCurrent flow:\n${buildFlowGraphString(minimalNodes, minimalEdges)}`)
  }

  // Selected node — the AI should find this in the graph above
  const nodeId = request.currentNodeId ? ` [${request.currentNodeId}]` : ""
  parts.push(`\nSelected node:${nodeId} type="${request.currentNodeType}"`)
  parts.push(`Suggest ${request.maxSuggestions || 2} nodes that connect to this node. Use the flow graph to understand its branch context.`)

  return parts.join("\n")
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

