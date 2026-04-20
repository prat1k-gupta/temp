/**
 * Extract variable names from a WhatsApp template body string.
 *
 * Grammar:
 *   - Named: letter or underscore followed by word chars — `{{first_name}}`, `{{order_id_1}}`
 *   - Positional: integer — `{{1}}`, `{{2}}`
 *
 * Deduplicates; preserves first-occurrence order.
 *
 * Single source of truth for template variable parsing. Used by:
 * - lib/ai/tools/list-approved-templates.ts (for tool payload)
 * - utils/flow-plan-builder.ts (fallback when AI omits parameterMappings)
 * - components/properties-panel.tsx (when user picks a template)
 */
export function extractTemplateVariables(body: string): string[] {
  const matches = body.match(/\{\{([a-zA-Z_]\w*|\d+)\}\}/g) || []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const m of matches) {
    const name = m.replace(/\{\{|\}\}/g, "")
    if (!seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  }
  return ordered
}

const REJECTION_REASON_LABELS: Record<string, string> = {
  ABUSIVE_CONTENT: "Abusive content",
  INCORRECT_CATEGORY: "Wrong category for this template",
  INVALID_FORMAT: "Invalid format (check variables, structure, or characters)",
  NONE: "",
  PROMOTIONAL: "Promotional content in a non-marketing category",
  SCAM: "Flagged as scam",
  TAG_CONTENT_MISMATCH: "Content doesn't match the selected category",
}

export function formatRejectionReason(code: string | undefined | null): string {
  if (!code || code === "NONE") return ""
  return REJECTION_REASON_LABELS[code] || code.replace(/_/g, " ").toLowerCase()
}
