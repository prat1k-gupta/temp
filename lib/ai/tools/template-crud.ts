import { tool } from "ai"
import { z } from "zod"
import { TemplateSchema, formatTemplateIssues } from "@/lib/schemas/template-schema"
import { buildTemplatePayload, type TemplateFormLike } from "@/utils/template-payload"
import type { GenerateFlowRequest } from "./generate-flow"

interface ToolDeps {
  apiUrl: string
  authHeader: string
  waAccountName?: string
}

function authHeaders(authHeader: string): Record<string, string> {
  return authHeader.startsWith("whm_")
    ? { "X-API-Key": authHeader }
    : { Authorization: authHeader }
}

async function unwrap(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  const json = JSON.parse(text)
  if (json && typeof json === "object" && "status" in json && "data" in json) {
    return (json as { data: unknown }).data
  }
  return json
}

function deps(toolContext: GenerateFlowRequest["toolContext"] | undefined): ToolDeps | null {
  const apiUrl = process.env.FS_WHATSAPP_API_URL
  if (!apiUrl || !toolContext?.authHeader) return null
  return {
    apiUrl,
    authHeader: toolContext.authHeader,
    waAccountName: toolContext.waAccountName,
  }
}

// --- Input schema for create/update. Omits whatsapp_account (pulled from
// toolContext) and id (tool-specific). superRefine on TemplateSchema runs
// after we merge the account in.
const createInputSchema = z.object({
  name: z.string().describe("Lowercase letters, digits, and underscores only. Max 512 chars. Cannot start or end with underscore."),
  display_name: z.string().optional().describe("Human-readable name. Defaults to `name`."),
  language: z.string().describe('BCP-47 code like "en", "en_US", "es", "pt_BR".'),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).describe("Pick the most conservative category that still fits — Meta rejects mis-categorised templates."),
  header_type: z.enum(["none", "text", "image", "video", "document"]).optional().describe('Use "none" or "text" in AI flows — media headers require a human-uploaded file handle.'),
  header_content: z.string().optional().describe("Header text (if header_type is text). Max 60 chars, no emoji, no newlines, max 1 variable."),
  body: z.string().describe("Template body. Max 1024 chars. Use named variables only, e.g. {{customer_name}}."),
  footer: z.string().optional().describe("Optional footer. Max 60 chars. No variables allowed."),
  buttons: z.array(z.object({
    type: z.enum(["quick_reply", "url", "phone_number", "copy_code"]),
    text: z.string(),
    url: z.string().optional(),
    phone_number: z.string().optional(),
    example: z.string().optional(),
    example_code: z.string().optional(),
  })).optional().describe("Max 10 buttons. Quick-reply and CTA (url/phone/copy) groups must each be contiguous — no interleaving."),
  sample_values: z.record(z.string(), z.string()).describe("One sample value per {{variable}} in body and header, keyed by variable name. Required for Meta review — empty samples are rejected."),
})

type CreateInput = z.infer<typeof createInputSchema>

function toFormLike(input: CreateInput, whatsappAccount: string): TemplateFormLike {
  return {
    whatsapp_account: whatsappAccount,
    name: input.name,
    display_name: input.display_name || input.name,
    language: input.language,
    category: input.category,
    header_type: input.header_type || "none",
    header_content: input.header_content || "",
    body: input.body,
    footer: input.footer || "",
    buttons: input.buttons || [],
    sample_values: input.sample_values,
  }
}

function validateAgainstSchema(form: TemplateFormLike): string[] | null {
  const result = TemplateSchema.safeParse(form)
  if (result.success) return null
  return formatTemplateIssues(result)
}

// --- Tool factories ---

export function createTemplateCrudTools(
  toolContext: GenerateFlowRequest["toolContext"] | undefined,
) {
  const d = deps(toolContext)
  const authMissing = tool({
    description: "Authentication context is missing; the tool cannot run.",
    inputSchema: z.object({}),
    execute: async () => ({ success: false as const, error: "Authentication context is missing." }),
  })

  const create_template = tool({
    description:
      "Create a new WhatsApp message template as DRAFT (not submitted to Meta yet). REQUIRES user confirmation before calling — show the drafted template as a preview in your chat message and wait for the user's explicit yes; do NOT call this in the same turn as the draft. Use `submit_template` AFTER another separate confirmation. Every {{variable}} in body or header MUST have a sample value in `sample_values`, or Meta will reject the submission.",
    inputSchema: createInputSchema,
    execute: async (input) => {
      if (!d) return { success: false as const, error: "Authentication context is missing." }
      if (!d.waAccountName) {
        return { success: false as const, error: "No WhatsApp account is attached to this flow context. Ask the user which account to use." }
      }
      const form = toFormLike(input, d.waAccountName)
      const issues = validateAgainstSchema(form)
      if (issues) return { success: false as const, error: "Template invalid", issues }

      const payload = buildTemplatePayload(form)
      try {
        const res = await fetch(`${d.apiUrl}/api/templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(d.authHeader) },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await unwrap(res).catch(() => null)
          const message = (body as any)?.message || `HTTP ${res.status}`
          const backendIssues = Array.isArray(body) ? body : undefined
          return { success: false as const, error: message, ...(backendIssues ? { issues: backendIssues } : {}) }
        }
        const created = await unwrap(res) as { id: string; name: string; status: string }
        return { success: true as const, id: created.id, name: created.name, status: created.status }
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : "Network error" }
      }
    },
  })

  const update_template = tool({
    description:
      "Update an existing DRAFT or REJECTED template, then use `submit_template` to resubmit. APPROVED templates cannot be edited — duplicate instead. Pass the complete desired state; the backend treats the call as a full replace, pre-filling any omitted field from the stored record. REQUIRES user confirmation before calling — show the diff or new content and wait for an explicit yes.",
    inputSchema: createInputSchema.extend({
      id: z.string().describe("Template ID to update."),
    }),
    execute: async (input) => {
      if (!d) return { success: false as const, error: "Authentication context is missing." }
      const { id, ...rest } = input
      if (!d.waAccountName) {
        return { success: false as const, error: "No WhatsApp account is attached to this flow context." }
      }
      const form = toFormLike(rest, d.waAccountName)
      const issues = validateAgainstSchema(form)
      if (issues) return { success: false as const, error: "Template invalid", issues }

      const payload = buildTemplatePayload(form)
      try {
        const res = await fetch(`${d.apiUrl}/api/templates/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders(d.authHeader) },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const body = await unwrap(res).catch(() => null)
          const message = (body as any)?.message || `HTTP ${res.status}`
          const backendIssues = Array.isArray(body) ? body : undefined
          return { success: false as const, error: message, ...(backendIssues ? { issues: backendIssues } : {}) }
        }
        const updated = await unwrap(res) as { id: string; status: string }
        return { success: true as const, id: updated.id, status: updated.status }
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : "Network error" }
      }
    },
  })

  const submit_template = tool({
    description:
      "Submit a template to Meta for review. Moves status from DRAFT (or REJECTED) to PENDING. Clears any prior rejection_reason. Meta typically responds within minutes to hours. REQUIRES user confirmation before calling — submissions count against account quality score and can't be recalled. Never chain this after create_template or update_template in the same turn; always confirm in between.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      if (!d) return { success: false as const, error: "Authentication context is missing." }
      try {
        const res = await fetch(`${d.apiUrl}/api/templates/${id}/publish`, {
          method: "POST",
          headers: authHeaders(d.authHeader),
        })
        if (!res.ok) {
          const body = await unwrap(res).catch(() => null)
          return { success: false as const, error: (body as any)?.message || `HTTP ${res.status}` }
        }
        return { success: true as const, status: "PENDING" }
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : "Network error" }
      }
    },
  })

  const get_template = tool({
    description:
      "Fetch a single template by ID. Returns the current status and, if REJECTED, the rejection_reason so you can diagnose and fix it before resubmitting.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      if (!d) return { success: false as const, error: "Authentication context is missing." }
      try {
        const res = await fetch(`${d.apiUrl}/api/templates/${id}`, {
          headers: authHeaders(d.authHeader),
        })
        if (!res.ok) {
          const body = await unwrap(res).catch(() => null)
          return { success: false as const, error: (body as any)?.message || `HTTP ${res.status}` }
        }
        const t = await unwrap(res) as Record<string, any>
        return {
          success: true as const,
          id: t.id,
          name: t.name,
          display_name: t.display_name,
          language: t.language,
          category: t.category,
          status: t.status,
          rejection_reason: t.rejection_reason || "",
          header_type: t.header_type,
          header_content: t.header_content,
          body: t.body_content,
          footer: t.footer_content,
          buttons: t.buttons || [],
          sample_values: t.sample_values || [],
        }
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : "Network error" }
      }
    },
  })

  const sync_templates = tool({
    description:
      "Sync templates from Meta into our database. Use when the user says a template was approved/rejected on Meta but our status is stale, or to import templates created outside this app.",
    inputSchema: z.object({
      account: z.string().optional().describe("WhatsApp account name to sync. Defaults to the account attached to this flow."),
    }),
    execute: async ({ account }) => {
      if (!d) return { success: false as const, error: "Authentication context is missing." }
      const accountName = account || d.waAccountName
      try {
        const res = await fetch(`${d.apiUrl}/api/templates/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders(d.authHeader) },
          body: JSON.stringify(accountName ? { whatsapp_account: accountName } : {}),
        })
        if (!res.ok) {
          const body = await unwrap(res).catch(() => null)
          return { success: false as const, error: (body as any)?.message || `HTTP ${res.status}` }
        }
        const result = await unwrap(res) as { count?: number; message?: string }
        return { success: true as const, count: result.count ?? 0, message: result.message || "Synced" }
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : "Network error" }
      }
    },
  })

  const delete_template = tool({
    description:
      "Delete a template by ID. Cannot be undone. REQUIRES user confirmation before calling — name the template and wait for an explicit yes. Use only when the user explicitly asks to remove a template.",
    inputSchema: z.object({ id: z.string() }),
    execute: async ({ id }) => {
      if (!d) return { success: false as const, error: "Authentication context is missing." }
      try {
        const res = await fetch(`${d.apiUrl}/api/templates/${id}`, {
          method: "DELETE",
          headers: authHeaders(d.authHeader),
        })
        if (!res.ok) {
          const body = await unwrap(res).catch(() => null)
          return { success: false as const, error: (body as any)?.message || `HTTP ${res.status}` }
        }
        return { success: true as const }
      } catch (err) {
        return { success: false as const, error: err instanceof Error ? err.message : "Network error" }
      }
    },
  })

  if (!d) {
    return {
      create_template: authMissing,
      update_template: authMissing,
      submit_template: authMissing,
      get_template: authMissing,
      sync_templates: authMissing,
      delete_template: authMissing,
    }
  }

  return {
    create_template,
    update_template,
    submit_template,
    get_template,
    sync_templates,
    delete_template,
  }
}
