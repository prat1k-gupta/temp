import type { Node } from "@xyflow/react"

const STORABLE_NODE_TYPES = new Set([
  "whatsappQuestion",
  "question",
  "whatsappQuickReply",
  "quickReply",
  "whatsappInteractiveList",
  "interactiveList",
  "apiFetch",
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

  for (const node of nodes) {
    if (!node.type || !STORABLE_NODE_TYPES.has(node.type)) continue

    const data = node.data as Record<string, any>
    if (data.storeAs && typeof data.storeAs === "string" && data.storeAs.trim()) {
      variables.push(data.storeAs.trim())
    }

    // apiFetch nodes expose response mapping keys as variables
    if (node.type === "apiFetch" && data.responseMapping) {
      for (const varName of Object.keys(data.responseMapping)) {
        if (varName.trim()) {
          variables.push(varName.trim())
        }
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

  for (const node of nodes) {
    if (!node.type || !STORABLE_NODE_TYPES.has(node.type)) continue

    const data = node.data as Record<string, any>
    if (data.storeAs && typeof data.storeAs === "string" && data.storeAs.trim()) {
      variables.push({
        name: data.storeAs.trim(),
        sourceNodeType: node.type,
        sourceNodeLabel: data.label || data.question || node.type,
        hasTitleVariant: TITLE_VARIANT_NODE_TYPES.has(node.type),
      })
    }

    // apiFetch nodes expose response mapping keys as variables
    if (node.type === "apiFetch" && data.responseMapping) {
      for (const varName of Object.keys(data.responseMapping)) {
        if (varName.trim()) {
          variables.push({
            name: varName.trim(),
            sourceNodeType: node.type,
            sourceNodeLabel: data.label || "API Fetch",
            hasTitleVariant: false,
          })
        }
      }
    }
  }

  return variables
}

/**
 * Extracts all {{...}} variable references from text.
 * Returns the variable names (without the braces).
 */
export function extractVariableReferences(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g)
  if (!matches) return []
  return matches.map((m) => m.slice(2, -2).trim())
}

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

    // Check button texts
    if (Array.isArray(data.buttons)) {
      for (const btn of data.buttons) {
        if (typeof btn.text === "string") allRefs.push(...extractVariableReferences(btn.text))
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
      !known.has(r) && !r.startsWith("global.") && !r.startsWith("flow.")
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
