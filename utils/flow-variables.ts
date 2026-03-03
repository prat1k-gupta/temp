import type { Node } from "@xyflow/react"

const SUPER_NODE_DEFAULTS: Record<string, string> = {
  name: "user_name",
  email: "user_email",
  dob: "user_dob",
  address: "user_address",
}

const STORABLE_NODE_TYPES = new Set([
  "whatsappQuestion",
  "question",
  "whatsappQuickReply",
  "quickReply",
  "whatsappInteractiveList",
  "interactiveList",
  "name",
  "email",
  "dob",
  "address",
  "apiFetch",
])

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
 * Super nodes get fixed defaults (user_name, user_email, etc.).
 * Priority: question → label → nodeType fallback.
 */
export function generateVariableName(node: Node): string {
  const nodeType = node.type || ""
  const data = node.data as Record<string, any>

  // Super nodes get fixed defaults
  if (SUPER_NODE_DEFAULTS[nodeType]) {
    return SUPER_NODE_DEFAULTS[nodeType]
  }

  // Use question first, then label, then fallback
  const text = data.question || data.label || nodeType
  const slug = slugify(text)
  return slug || `var_${node.id.slice(-6)}`
}

/**
 * Scans all storable nodes (question, quickReply, list, super),
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
