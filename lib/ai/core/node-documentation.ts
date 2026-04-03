/**
 * Node Documentation Repository
 * Auto-generated from NODE_TEMPLATES — the single source of truth for all node types.
 */

import type { Platform, TemplateAIMetadata } from "@/types"
import { getNodeLimits } from "@/constants"
import { BUTTON_LIMITS, CHARACTER_LIMITS } from "@/constants/platform-limits"
import { NODE_TEMPLATES, type NodeTemplate } from "@/constants/node-categories"
import { NODE_TYPE_MAPPINGS } from "@/constants/node-types"

export interface NodeDocumentation {
  type: string
  category: "template" | "interaction" | "information" | "fulfillment" | "integration" | "logic" | "action"
  platforms: Platform[]
  description: string
  properties: {
    required: string[]
    optional: string[]
    validation?: Record<string, any>
  }
  limits: {
    text?: { min?: number; max: number }
    buttons?: { min: number; max: number; textMaxLength: number }
    options?: { min: number; max: number; textMaxLength: number; descriptionMaxLength?: number }
    maxConnections?: number
    allowMultipleOutputs?: boolean
  }
  usage: {
    whenToUse: string
    bestPractices: string[]
    examples: string[]
  }
  dataStructure: Record<string, any>
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures)
// ---------------------------------------------------------------------------

/**
 * Get comprehensive documentation for all nodes
 */
export function getAllNodeDocumentation(platform?: Platform): NodeDocumentation[] {
  const docs: NodeDocumentation[] = []

  for (const template of NODE_TEMPLATES) {
    for (const p of template.platforms) {
      if (platform && platform !== p) continue
      docs.push(buildNodeDoc(template, p))
    }
  }

  return docs
}

/**
 * Get documentation for a specific node type
 */
export function getNodeDocumentation(nodeType: string, platform: Platform): NodeDocumentation | null {
  const allDocs = getAllNodeDocumentation(platform)
  return allDocs.find(doc => doc.type === nodeType) || null
}

/**
 * Get formatted documentation string for AI prompts
 */
export function getNodeDocumentationString(platform?: Platform, nodeTypes?: string[]): string {
  const docs = nodeTypes
    ? nodeTypes.map(type => {
        const platformDocs = getAllNodeDocumentation(platform)
        return platformDocs.find(d => d.type === type)
      }).filter(Boolean) as NodeDocumentation[]
    : getAllNodeDocumentation(platform)

  return docs.map(doc => formatNodeDoc(doc)).join("\n\n")
}

/**
 * Compact node documentation for the plan-based create prompt.
 * ~300 tokens vs ~2000 for the full docs. Lists each node type with
 * its category, what content fields it accepts, and platform restrictions.
 */
export function getSimplifiedNodeDocumentation(platform: Platform): string {
  const lines: string[] = [
    `Available node types for ${platform}:`,
    "",
  ]

  // Group templates by category
  const byCategory = new Map<string, typeof NODE_TEMPLATES>()
  for (const t of NODE_TEMPLATES) {
    if (!t.platforms.includes(platform)) continue
    const list = byCategory.get(t.category) || []
    list.push(t)
    byCategory.set(t.category, list)
  }

  const categoryOrder = ["template", "information", "interaction", "logic", "action", "fulfillment", "integration"]

  for (const cat of categoryOrder) {
    const items = byCategory.get(cat)
    if (!items || items.length === 0) continue

    lines.push(`[${cat.toUpperCase()}]`)
    for (const t of items) {
      const contentHints = t.ai?.contentFields || ""
      const platformNote = t.platforms.length < 3
        ? ` (${t.platforms.join("/")} only)`
        : ""
      // Add text limit hint if the node has a custom textMax
      const textLimit = t.limits?.textMax
        ? ` [max ${t.limits.textMax} chars]`
        : t.limits?.textField === "question"
          ? ` [max ${CHARACTER_LIMITS[platform].question} chars]`
          : ""
      lines.push(`  ${t.type} — ${t.description}${platformNote}${textLimit}${contentHints ? ` | content: ${contentHints}` : ""}`)
    }
    lines.push("")
  }

  lines.push(`Button limits: web=${BUTTON_LIMITS.web}, whatsapp=${BUTTON_LIMITS.whatsapp}, instagram=${BUTTON_LIMITS.instagram}`)

  const charLimits = CHARACTER_LIMITS[platform]
  lines.push(`Default character limits for ${platform}: question max=${charLimits.question} chars, button text max=${charLimits.button} chars`)
  lines.push(`IMPORTANT: When a node shows [max N chars] above, use that limit instead of the default. All generated text MUST fit within these character limits.`)

  return lines.join("\n")
}

/**
 * Compact "node selection cheatsheet" from NODE_TEMPLATES selectionRule fields.
 * Injected into AI prompts so the model knows when to pick each node type.
 */
export function getNodeSelectionRules(
  platform: Platform,
  userTemplates?: Array<{ id: string; name: string; aiMetadata?: TemplateAIMetadata }>
): string {
  const lines: string[] = ["NODE SELECTION RULES:"]

  for (const t of NODE_TEMPLATES) {
    if (!t.platforms.includes(platform)) continue
    if (!t.ai?.selectionRule) continue
    lines.push(`- ${t.type}: ${t.ai.selectionRule}`)
  }

  // Include selection rules from user templates
  if (userTemplates) {
    for (const t of userTemplates) {
      if (t.aiMetadata?.selectionRule) {
        lines.push(`- flowTemplate:${t.id}: ${t.aiMetadata.selectionRule}`)
      }
    }
  }

  return lines.join("\n")
}

/**
 * Compact dependency rules from NODE_TEMPLATES dependencies fields.
 * Tells the AI which nodes require other nodes to exist first.
 */
export function getNodeDependencies(platform: Platform): string {
  const lines: string[] = ["NODE DEPENDENCIES:"]
  let hasAny = false

  for (const t of NODE_TEMPLATES) {
    if (!t.platforms.includes(platform)) continue
    if (!t.ai?.dependencies || t.ai.dependencies.length === 0) continue
    lines.push(`- ${t.type} requires: ${t.ai.dependencies.join(", ")}`)
    hasAny = true
  }

  return hasAny ? lines.join("\n") : ""
}

/**
 * Build documentation string for user-created templates so the AI can suggest/place them.
 */
export function getUserTemplateDocumentation(
  platform: Platform,
  userTemplates: Array<{ id: string; name: string; aiMetadata?: TemplateAIMetadata }>
): string {
  if (!userTemplates || userTemplates.length === 0) return ""

  const lines: string[] = ["\n[USER TEMPLATES]"]

  for (const t of userTemplates) {
    const desc = t.aiMetadata?.description || t.name
    const whenToUse = t.aiMetadata?.whenToUse
    const suffix = whenToUse ? ` | use: ${whenToUse}` : ""
    lines.push(`  flowTemplate:${t.id} — ${desc} (${platform} only)${suffix}`)
  }

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPlatformDocType(template: NodeTemplate, platform: Platform): string {
  return NODE_TYPE_MAPPINGS[template.type]?.[platform] || template.type
}

function buildNodeDoc(template: NodeTemplate, platform: Platform): NodeDocumentation {
  const ai = template.ai
  const limits = getNodeLimits(template.type, platform)
  const platformType = getPlatformDocType(template, platform)
  const textLimit = limits.text || limits.question

  return {
    type: platformType,
    category: template.category,
    platforms: [platform],
    description: ai?.description || template.description,
    properties: {
      required: ai?.requiredProperties || ["label", "platform"],
      optional: ai?.optionalProperties || [],
    },
    limits: {
      text: textLimit ? { min: textLimit.min, max: textLimit.max } : undefined,
      buttons: limits.buttons,
      options: limits.options,
      maxConnections: limits.maxConnections,
      allowMultipleOutputs: limits.allowMultipleOutputs,
    },
    usage: {
      whenToUse: ai?.whenToUse || `Use for ${template.description.toLowerCase()}.`,
      bestPractices: ai?.bestPractices || [],
      examples: ai?.examples || [],
    },
    dataStructure: buildDataStructure(platformType, platform, template),
  }
}

function buildDataStructure(
  platformType: string,
  platform: Platform,
  template: NodeTemplate,
): Record<string, any> {
  const base: Record<string, any> = {
    id: "string (unique)",
    type: platformType,
    platform: platform,
    label: `string (e.g., '${template.label}')`,
  }

  const t = template.type

  // Question-based nodes
  if (t === "question" || t === "quickReply" || t === "interactiveList") {
    base.question = "string (the question/prompt text)"
  }

  // Media attachments
  if (t === "question") {
    base.media = "{ type: 'image'|'video'|'audio'|'document', url: string } — optional media attachment"
  }
  if (t === "quickReply") {
    base.media = "{ type: 'image'|'video'|'document', url: string } — optional media header (no audio on buttons)"
  }

  // Buttons
  if (t === "quickReply") {
    base.buttons = [{ text: "string (button label)", id: "string (optional)" }]
  }

  // List options
  if (t === "interactiveList") {
    base.listTitle = "string (max 20 chars)"
    base.options = [
      { text: "string (option title, max 24 chars)", description: "string (optional, max 72 chars)", id: "string (optional)" },
    ]
  }

  // Message nodes (text, not question)
  if (["whatsappMessage", "instagramDM", "instagramStory"].includes(t)) {
    base.text = "string (the message content)"
  }

  // Media on message nodes
  if (t === "whatsappMessage") {
    base.media = "{ type: 'image'|'video'|'audio'|'document', url: string } — optional media attachment"
  }

  // Condition
  if (t === "condition") {
    base.conditionLogic = "AND | OR"
    base.conditionGroups = [
      {
        id: "string (unique)",
        label: "string (e.g., 'True', 'False')",
        logic: "AND | OR",
        rules: [{ field: "string", operator: "string", value: "string" }],
      },
    ]
  }

  // Action node
  if (t === "action") {
    base.variables = [{ name: "string (variable name)", value: "string (supports {{variable}} interpolation)" }]
    base.tagAction = "add | remove"
    base.tags = ["string (tag name, supports {{variable}} interpolation)"]
  }

  // WhatsApp Flow node
  if (t === "whatsappFlow") {
    base.whatsappFlowId = "string (Meta Flow ID — selected from existing published flows)"
    base.flowName = "string (display name of the selected flow)"
    base.headerText = "string (optional header text, max 60 chars)"
    base.bodyText = "string (required message body — shown to user before they open the form)"
    base.ctaText = "string (CTA button text, max 20 chars, default 'Open Form')"
    base.responseFields = ["string (field names returned by the form, auto-extracted from flow)"]
  }

  // Tracking notification
  if (t === "trackingNotification") {
    base.message = "string (the notification message)"
    base.trackingNumber = "string (optional)"
    base.estimatedDelivery = "string (optional)"
  }

  // Fulfillment / integration nodes
  if ((template.category === "fulfillment" || template.category === "integration") && t !== "trackingNotification") {
    base.description = `string (e.g., '${template.description}')`
    base.configuration = { apiKey: "string (configured)" }
  }

  // Home delivery vendor
  if (t === "homeDelivery") {
    base.vendor = { name: "string", type: "delivery", description: "string" }
  }

  return base
}

function formatNodeDoc(doc: NodeDocumentation): string {
  const platformList = doc.platforms.join(", ")
  return `**${doc.type.toUpperCase()}** (${doc.category})
Platforms: ${platformList}
Description: ${doc.description}

Properties:
- Required: ${doc.properties.required.join(", ") || "None"}
- Optional: ${doc.properties.optional.join(", ") || "None"}

Limits:
${formatLimits(doc.limits)}

Usage:
- When to use: ${doc.usage.whenToUse}
- Best practices:
${doc.usage.bestPractices.map(p => `  • ${p}`).join("\n")}
- Examples:
${doc.usage.examples.map(e => `  • ${e}`).join("\n")}

Data Structure:
${formatDataStructure(doc.dataStructure)}`
}

function formatLimits(limits: NodeDocumentation["limits"]): string {
  const parts: string[] = []
  if (limits.text) {
    parts.push(`  - Text: ${limits.text.min || 0}-${limits.text.max} characters`)
  }
  if (limits.buttons) {
    parts.push(`  - Buttons: ${limits.buttons.min}-${limits.buttons.max} buttons (max ${limits.buttons.textMaxLength} chars each)`)
  }
  if (limits.options) {
    parts.push(`  - Options: ${limits.options.min}-${limits.options.max} options (max ${limits.options.textMaxLength} chars each)`)
  }
  if (limits.maxConnections) {
    parts.push(`  - Max connections: ${limits.maxConnections}`)
  }
  if (limits.allowMultipleOutputs !== undefined) {
    parts.push(`  - Multiple outputs: ${limits.allowMultipleOutputs ? "Yes" : "No"}`)
  }
  return parts.join("\n") || "  - No specific limits"
}

function formatDataStructure(structure: Record<string, any>): string {
  return JSON.stringify(structure, null, 2)
    .split("\n")
    .map(line => `  ${line}`)
    .join("\n")
}
