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
