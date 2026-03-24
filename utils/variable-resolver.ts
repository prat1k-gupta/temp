/**
 * Variable Resolver — single source of truth for {{variable}} pattern matching
 * and substitution across the entire application.
 *
 * Supports all variable types:
 *   {{name}}                  — session/flow variable
 *   {{system.contact_name}}   — system variable
 *   {{global.company}}        — global variable
 *   {{flow.slug.var}}         — cross-flow variable
 *   {{1}}, {{2}}              — positional (legacy templates)
 */

/** Regex that matches all {{variable}} patterns including dot notation */
export const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

/**
 * Extract all variable references from text.
 * Returns trimmed variable names without braces.
 */
export function extractVariableRefs(text: string): string[] {
  if (!text) return []
  const matches = text.match(VARIABLE_PATTERN)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))]
}

/**
 * Replace {{variable}} placeholders with values from a map.
 * Unresolved variables are left as-is.
 */
export function resolveVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(VARIABLE_PATTERN, (match, varName) => {
    const trimmed = varName.trim()
    return variables[trimmed] ?? match
  })
}

/**
 * Determine the type of a variable reference.
 */
export function getVariableType(ref: string): "system" | "global" | "cross-flow" | "flow" | "positional" {
  if (ref.startsWith("system.")) return "system"
  if (ref.startsWith("global.")) return "global"
  if (ref.startsWith("flow.")) return "cross-flow"
  if (/^\d+$/.test(ref)) return "positional"
  return "flow"
}
