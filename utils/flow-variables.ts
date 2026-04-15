import type { Node } from "@xyflow/react"

const STORABLE_NODE_TYPES = new Set([
  "whatsappQuestion",
  "question",
  "whatsappQuickReply",
  "quickReply",
  "whatsappInteractiveList",
  "interactiveList",
  "apiFetch",
  "action",
  "whatsappFlow",
])

const TITLE_VARIANT_NODE_TYPES = new Set([
  "whatsappQuickReply",
  "quickReply",
  "whatsappInteractiveList",
  "interactiveList",
  "instagramQuickReply",
  "webQuickReply",
])

export interface FlowVariable {
  name: string
  sourceNodeType: string
  sourceNodeLabel: string
  hasTitleVariant: boolean
}

/**
 * Slugify a string into a valid variable name:
 * lowercase, underscores, max 30 chars.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30)
}

/**
 * Derives a variable name from a node's question text.
 * Priority: question → label → nodeType fallback.
 */
export function generateVariableName(node: Node): string {
  const data = node.data as Record<string, any>

  // Use question first, then label, then fallback
  const text = data.question || data.label || node.type || ""
  const slug = slugify(text)
  return slug || `var_${node.id.slice(-6)}`
}

/**
 * Scans all storable nodes (question, quickReply, list, apiFetch),
 * returns an array of storeAs values that are set.
 */
export function collectFlowVariables(nodes: Node[]): string[] {
  const variables: string[] = []

  const scanNode = (node: { type?: string; data: Record<string, any> }) => {
    if (!node.type || !STORABLE_NODE_TYPES.has(node.type)) return
    const data = node.data
    if (data.storeAs && typeof data.storeAs === "string" && data.storeAs.trim()) {
      variables.push(data.storeAs.trim())
    }
    if (node.type === "apiFetch" && data.responseMapping) {
      for (const varName of Object.keys(data.responseMapping)) {
        if (varName.trim()) variables.push(varName.trim())
      }
    }
    if (node.type === "action" && Array.isArray(data.variables)) {
      for (const v of data.variables) {
        if (v?.name && typeof v.name === "string" && v.name.trim()) {
          variables.push(v.name.trim())
        }
      }
    }
    if (node.type === "whatsappFlow" && Array.isArray(data.responseFields)) {
      for (const fieldName of data.responseFields) {
        if (typeof fieldName === "string" && fieldName.trim()) {
          variables.push(fieldName.trim())
        }
      }
    }
  }

  for (const node of nodes) {
    const data = node.data as Record<string, any>
    scanNode({ type: node.type, data })

    // Scan inside flowTemplate nodes
    if (node.type === "flowTemplate" && Array.isArray(data.internalNodes)) {
      for (const innerNode of data.internalNodes) {
        scanNode({ type: innerNode.type, data: innerNode.data || {} })
      }
    }
  }

  return variables
}

/**
 * Returns true if a node type should have a storeAs variable.
 */
export function isStorableNodeType(nodeType: string): boolean {
  return STORABLE_NODE_TYPES.has(nodeType)
}

/**
 * Auto-generates a storeAs variable name for a node if it doesn't already have one.
 * Uses the node's label/question to derive a slug, then deduplicates against existing vars.
 * Returns the generated name, or empty string if the node type doesn't store responses.
 */
export function autoStoreAs(node: Node, existingVariables?: string[]): string {
  const nodeType = node.type || ""
  if (!STORABLE_NODE_TYPES.has(nodeType)) return ""

  const data = node.data as Record<string, any>
  // Don't overwrite if already set
  if (data.storeAs && typeof data.storeAs === "string" && data.storeAs.trim()) {
    return data.storeAs
  }

  const generated = generateVariableName(node)
  if (existingVariables) {
    return deduplicateVariable(generated, existingVariables)
  }
  return generated
}

/**
 * Appends _2, _3, etc. if a variable name already exists in the list.
 */
export function deduplicateVariable(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name

  let counter = 2
  while (existing.includes(`${name}_${counter}`)) {
    counter++
  }
  return `${name}_${counter}`
}

/**
 * Scans all storable nodes and returns rich variable metadata.
 * For quickReply/interactiveList nodes, hasTitleVariant is true so picker
 * can show both {{var}} (Response ID) and {{var_title}} (Display text).
 */
export function collectFlowVariablesRich(nodes: Node[]): FlowVariable[] {
  const variables: FlowVariable[] = []

  const scanNode = (node: { type?: string; data: Record<string, any> }, parentLabel?: string) => {
    if (!node.type || !STORABLE_NODE_TYPES.has(node.type)) return

    const data = node.data
    if (data.storeAs && typeof data.storeAs === "string" && data.storeAs.trim()) {
      variables.push({
        name: data.storeAs.trim(),
        sourceNodeType: node.type,
        sourceNodeLabel: parentLabel || data.label || data.question || node.type,
        hasTitleVariant: TITLE_VARIANT_NODE_TYPES.has(node.type),
      })
    }

    // apiFetch response mapping: {varName: jsonPath} — variable names are keys
    if (node.type === "apiFetch" && data.responseMapping) {
      for (const varName of Object.keys(data.responseMapping)) {
        if (varName.trim()) {
          variables.push({
            name: varName.trim(),
            sourceNodeType: node.type,
            sourceNodeLabel: parentLabel || data.label || "API Fetch",
            hasTitleVariant: false,
          })
        }
      }
    }

    // action node variables
    if (node.type === "action" && Array.isArray(data.variables)) {
      for (const v of data.variables) {
        if (v?.name && typeof v.name === "string" && v.name.trim()) {
          variables.push({
            name: v.name.trim(),
            sourceNodeType: node.type,
            sourceNodeLabel: parentLabel || data.label || "Action",
            hasTitleVariant: false,
          })
        }
      }
    }

    // whatsappFlow response fields
    if (node.type === "whatsappFlow" && Array.isArray(data.responseFields)) {
      for (const fieldName of data.responseFields) {
        if (typeof fieldName === "string" && fieldName.trim()) {
          variables.push({
            name: fieldName.trim(),
            sourceNodeType: node.type,
            sourceNodeLabel: parentLabel || data.label || data.flowName || "WhatsApp Flow",
            hasTitleVariant: false,
          })
        }
      }
    }
  }

  for (const node of nodes) {
    const data = node.data as Record<string, any>

    // Scan top-level storable nodes
    scanNode({ type: node.type, data })

    // Scan inside flowTemplate nodes for their internal storable nodes
    if (node.type === "flowTemplate" && Array.isArray(data.internalNodes)) {
      const templateLabel = data.label || data.templateName || "Template"
      for (const innerNode of data.internalNodes) {
        scanNode({ type: innerNode.type, data: innerNode.data || {} }, templateLabel)
      }
    }
  }

  return variables
}

/**
 * Extracts all {{...}} variable references from text.
 * Re-exports from the single source of truth in variable-resolver.ts.
 */
import { extractVariableRefs } from "@/utils/variable-resolver"
export const extractVariableReferences = extractVariableRefs

/**
 * Text fields on nodes that can contain {{variable}} references.
 */
const VARIABLE_TEXT_FIELDS = [
  "question", "text", "message", "fallbackMessage",
  "body", "url", "notes", "comment",
] as const

/**
 * Validates all variable references across the flow.
 * Returns an array of { nodeId, nodeLabel, unknownVars } for nodes with unknown variables.
 */
export function validateFlowVariables(
  nodes: Node[],
  globalVariables?: Record<string, string>,
  crossFlowVariables?: Array<{ flowSlug: string; variables: string[] }>
): Array<{ nodeId: string; nodeLabel: string; unknownVars: string[] }> {
  const flowVars = collectFlowVariablesRich(nodes)
  const known = new Set<string>()

  // Flow variables (including _title variants)
  for (const fv of flowVars) {
    known.add(fv.name)
    if (fv.hasTitleVariant) known.add(`${fv.name}_title`)
  }

  // Global variables
  if (globalVariables) {
    for (const key of Object.keys(globalVariables)) known.add(`global.${key}`)
  }

  // Cross-flow variables
  if (crossFlowVariables) {
    for (const cf of crossFlowVariables) {
      for (const v of cf.variables) known.add(`flow.${cf.flowSlug}.${v}`)
    }
  }

  const errors: Array<{ nodeId: string; nodeLabel: string; unknownVars: string[] }> = []

  for (const node of nodes) {
    // Template message variables resolve from session data (API-passed or flow variables)
    // — they don't need to exist in storeAs within this flow
    if (node.type === "templateMessage") continue

    const data = node.data as Record<string, any>
    const allRefs: string[] = []

    // Check all text fields
    for (const field of VARIABLE_TEXT_FIELDS) {
      if (typeof data[field] === "string" && data[field]) {
        allRefs.push(...extractVariableReferences(data[field]))
      }
    }

    // Check choice texts
    if (Array.isArray(data.choices)) {
      for (const c of data.choices) {
        if (typeof c.text === "string") allRefs.push(...extractVariableReferences(c.text))
      }
    }

    // Check header values (apiFetch)
    if (data.headers && typeof data.headers === "object") {
      for (const val of Object.values(data.headers)) {
        if (typeof val === "string") allRefs.push(...extractVariableReferences(val))
      }
    }

    if (allRefs.length === 0) continue

    const unknownVars = allRefs.filter((r) =>
      !known.has(r) && !r.startsWith("global.") && !r.startsWith("flow.") && !r.startsWith("system.")
    )

    if (unknownVars.length > 0) {
      errors.push({
        nodeId: node.id,
        nodeLabel: data.label || data.question || node.type || "Unknown node",
        unknownVars: [...new Set(unknownVars)],
      })
    }
  }

  return errors
}
