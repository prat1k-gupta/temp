import { tool } from "ai"
import { z } from "zod"
import { extractTemplateVariables } from "@/utils/template-helpers"
import type { GenerateFlowRequest } from "./generate-flow"

type ShapedTemplate = {
  id: string
  name: string
  displayName?: string
  language: string
  category: string
  headerType?: string
  body: string
  variables: string[]
  buttons: Array<{ type: string; text: string; url?: string }>
}

export type FetchApprovedTemplatesResult =
  | { success: true; templates: ShapedTemplate[]; count: number }
  | { success: false; error: string }

/**
 * Pure executor: hits the backend, shapes the response, returns a discriminated
 * union. Exported separately so tests can exercise the logic without dealing
 * with the AI SDK's tool() wrapper types.
 */
export async function fetchApprovedTemplates(
  apiUrl: string,
  authHeader: string,
): Promise<FetchApprovedTemplatesResult> {
  try {
    const res = await fetch(`${apiUrl}/api/templates?status=APPROVED`, {
      headers: { Authorization: authHeader },
    })
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    // fs-chat wraps responses as `{status, data: {templates: [...]}}`.
    // Unwrap the outer envelope before reading `templates`, but tolerate
    // both shapes (envelope vs. bare) so tests and any pre-envelope
    // deployment keep working.
    const inner = data && typeof data === "object" && "data" in data ? data.data : data
    const raw = Array.isArray(inner) ? inner : inner?.templates || []
    const templates = raw.map(shapeTemplate)
    return { success: true, templates, count: templates.length }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    }
  }
}

/**
 * Factory for the `list_approved_templates` AI tool. Returns `null` when
 * auth context or backend URL is missing — in which case the tool should
 * not be registered in the agent's tool map. Same pattern as `trigger_flow`.
 *
 * The tool lists the authenticated user's Meta-approved WhatsApp templates
 * with enough detail for the AI to drop a fully-configured templateMessage
 * node (name, body, variables, buttons, category, language) in one call.
 */
export function createListApprovedTemplatesTool(
  toolContext: GenerateFlowRequest["toolContext"] | undefined,
) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl || !toolContext?.authHeader) return null
  const authHeader = toolContext.authHeader

  return tool({
    description:
      "List the authenticated user's Meta-approved WhatsApp templates (WhatsApp only). Call this before placing a templateMessage node. Returns each template's id, name, body, extracted variables, buttons (with `type` lowercased: \"quick_reply\" | \"url\" | \"phone_number\" | \"copy_code\"), category, and language. Never invent template names — always call this first.",
    inputSchema: z.object({}),
    execute: async () => fetchApprovedTemplates(apiUrl, authHeader),
  })
}

function shapeTemplate(t: any): ShapedTemplate {
  const body = t.body_content || ""
  return {
    id: t.id,
    name: t.name,
    ...(t.display_name ? { displayName: t.display_name } : {}),
    language: t.language,
    category: t.category,
    ...(t.header_type ? { headerType: t.header_type } : {}),
    body,
    variables: extractTemplateVariables(body),
    buttons: (t.buttons || []).map((b: any) => ({
      type: String(b.type || "").toLowerCase(),
      text: b.text,
      ...(b.url ? { url: b.url } : {}),
    })),
  }
}
