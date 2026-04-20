import { z } from "zod"
import { FIND_FLOW_DEFAULT_LIMIT, FIND_FLOW_MAX_LIMIT } from "./constants"

/** GET /v1/agent/flows query params. */
export const findFlowQuerySchema = z.object({
  query: z.string().optional(),
  limit: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(FIND_FLOW_MAX_LIMIT)
    .default(FIND_FLOW_DEFAULT_LIMIT),
})

export type FindFlowQuery = z.infer<typeof findFlowQuerySchema>

/** POST /v1/agent/flows request body. */
export const createFlowBodySchema = z.object({
  name: z.string().min(1).max(100),
  instruction: z.string().min(1).max(4000),
  channel: z.enum(["whatsapp", "instagram", "web"]),
  trigger_keyword: z.string().min(1).max(50),
})

export type CreateFlowBody = z.infer<typeof createFlowBodySchema>

/** POST /v1/agent/flows/{flow_id}/edit request body. */
export const editFlowBodySchema = z.object({
  instruction: z.string().min(1).max(4000),
})

export type EditFlowBody = z.infer<typeof editFlowBodySchema>

/**
 * POST /v1/agent/flows/{flow_id}/publish request body.
 * Empty in v1. Unknowns are stripped for forward compat with a future
 * `version` field for rollback.
 */
export const publishFlowBodySchema = z.object({}).strip()

export type PublishFlowBody = z.infer<typeof publishFlowBodySchema>

// --- Templates ---
// fs-whatsapp accepts a flat shape, not Meta's nested {components} array.
// Field names match what fs-whatsapp's TemplateRequest struct decodes:
// internal/handlers/templates.go TemplateRequest. The `whatsapp_account`
// JSON key is a legacy name kept for back-compat; we expose it as
// `account_name` here for consistency with the rest of the v1 surface and
// translate in the proxy.
export const templateButtonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"]),
  text: z.string().min(1).max(25),
  url: z.string().url().optional(),
  phone_number: z.string().optional(),
})

export const createTemplateBodySchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/).min(1).max(512),
  display_name: z.string().min(1).max(512),
  language: z.string().min(2).max(10),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  account_name: z.string().min(1),
  body_content: z.string().min(1).max(1024),
  header_type: z.enum(["TEXT", "IMAGE", "DOCUMENT", "VIDEO", "NONE", ""]).optional(),
  header_content: z.string().max(60).optional(),
  footer_content: z.string().max(60).optional(),
  buttons: z.array(templateButtonSchema).max(10).optional(),
  // Named variables only (positional {{1}} {{2}} are deprecated for new
  // templates). Map of variable-name → sample value. Every {{name}} used in
  // body_content / header_content / button URL must have a sample here, or
  // Meta will reject the submission. Keys must match the {{name}} tokens
  // verbatim.
  sample_values: z.record(z.string().regex(/^[a-zA-Z_]\w*$/), z.string()).optional(),
})

// PUT replaces the template entirely on fs-whatsapp's side, so update
// requires the same fields as create. (Partial-update semantics aren't
// what the runtime exposes — this matches reality.)
export const updateTemplateBodySchema = createTemplateBodySchema

export const listTemplatesQuerySchema = z.object({
  status: z.enum(["APPROVED", "PENDING", "DRAFT", "REJECTED", "DISABLED", "PAUSED"]).optional(),
  account_name: z.string().optional(),
})

// --- Campaigns ---
export const audienceConfigSchema = z.object({
  channel: z.enum(["whatsapp"]).optional(),
  filter: z.record(z.unknown()).optional(),
  search: z.string().optional(),
  audience_id: z.string().uuid().optional(),
  column_mapping: z.record(z.string()).optional(),
})

export const previewAudienceBodySchema = z.object({
  source: z.enum(["contacts", "freestand-claimant"]),
  audience_config: audienceConfigSchema,
})

export const createCampaignBodySchema = z.object({
  name: z.string().min(1).max(200),
  flow_id: z.string().uuid(),
  account_name: z.string().min(1),
  audience_source: z.enum(["contacts", "freestand-claimant"]),
  audience_config: audienceConfigSchema,
  scheduled_at: z.string().datetime().optional(),
})

export const updateCampaignBodySchema = z.object({
  scheduled_at: z.string().datetime(),
})

export const listCampaignsQuerySchema = z.object({
  status: z.enum([
    "draft", "materializing", "scheduled", "queued", "processing",
    "paused", "completed", "cancelled", "failed",
  ]).optional(),
})

// --- Flows ---
export const triggerFlowBodySchema = z.object({
  phone: z.string().regex(/^\+\d{6,15}$/),
  account_name: z.string().min(1),
  // For flows that start with a templateMessage, supply values for any
  // template body parameters as { variable_name: value }.
  variables: z.record(z.string(), z.string()).optional(),
})
