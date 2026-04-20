import { tool } from "ai"
import { z } from "zod"
import { extractTemplateVariables } from "@/utils/template-helpers"
import type { GenerateFlowRequest } from "./generate-flow"
import type { ApprovedTemplate } from "@/types"

export const TEMPLATE_STATUS_VALUES = [
  "APPROVED",
  "PENDING",
  "REJECTED",
  "DRAFT",
  "DISABLED",
  "PAUSED",
] as const
export type TemplateStatus = (typeof TEMPLATE_STATUS_VALUES)[number]

export type ListedTemplate = ApprovedTemplate & {
  status: TemplateStatus | string
  rejectionReason?: string
}

export type FetchTemplatesResult =
  | { success: true; templates: ListedTemplate[]; count: number }
  | { success: false; error: string }

export async function fetchTemplates(
  apiUrl: string,
  authHeader: string,
  status: TemplateStatus = "APPROVED",
): Promise<FetchTemplatesResult> {
  try {
    const headers: Record<string, string> = authHeader.startsWith("whm_")
      ? { "X-API-Key": authHeader }
      : { Authorization: authHeader }
    const res = await fetch(`${apiUrl}/api/templates?status=${encodeURIComponent(status)}`, {
      headers,
    })
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
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

export function createListTemplatesTool(
  toolContext: GenerateFlowRequest["toolContext"] | undefined,
) {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl || !toolContext?.authHeader) return null
  const authHeader = toolContext.authHeader

  return tool({
    description:
      'List the authenticated user\'s WhatsApp templates. Defaults to APPROVED — the only status that can be dropped into a `templateMessage` node or sent via campaign. Pass `status: "REJECTED"` to diagnose failed submissions (response includes `rejectionReason`), `"PENDING"` for templates awaiting Meta review, or `"DRAFT"` for locally-created templates not yet submitted. Never invent template names — always call this first.',
    inputSchema: z.object({
      status: z.enum(TEMPLATE_STATUS_VALUES).optional()
        .describe('Filter by status. Defaults to APPROVED. Use REJECTED to find templates to fix via update_template + submit_template.'),
    }),
    execute: async ({ status }) => fetchTemplates(apiUrl, authHeader, status),
  })
}

function shapeTemplate(t: any): ListedTemplate {
  const body = t.body_content || ""
  return {
    id: t.id,
    name: t.name,
    ...(t.display_name ? { displayName: t.display_name } : {}),
    language: t.language,
    category: t.category,
    status: t.status,
    ...(t.rejection_reason ? { rejectionReason: t.rejection_reason } : {}),
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
