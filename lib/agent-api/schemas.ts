import { z } from "zod"
import { FIND_FLOW_DEFAULT_LIMIT, FIND_FLOW_MAX_LIMIT } from "./constants"

/**
 * Trigger keyword validation — lowercase alphanumeric, dash, underscore.
 * 1-50 chars. Must be applied AFTER the caller normalizes to lowercase.
 * See spec "Section 2" validation rules.
 */
export const TRIGGER_KEYWORD_REGEX = /^[a-z0-9_-]{1,50}$/

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
  instruction: z.string().min(1).max(4000),
  channel: z.enum(["whatsapp", "instagram", "web"]),
  trigger_keyword: z.string().regex(TRIGGER_KEYWORD_REGEX, {
    message: "Trigger keyword must be 1-50 chars, lowercase alphanumeric + dash + underscore",
  }),
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
