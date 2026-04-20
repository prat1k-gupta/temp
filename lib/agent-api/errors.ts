/**
 * Stable string codes for all agent API errors. Every error response body
 * carries a `code` field set to one of these values. Customers depend on
 * these codes being stable; never rename or remove a code in a minor release.
 */
export type AgentErrorCode =
  | "missing_required_param"
  | "invalid_param"
  | "invalid_instruction"
  | "invalid_trigger_keyword"
  | "channel_not_connected"
  | "no_account_configured"
  | "unsupported_edit"
  | "unauthorized"
  | "flow_not_found"
  | "node_not_found"
  | "keyword_conflict"
  | "rate_limited"
  | "validation_failed"
  | "internal_error"
  | "publish_failed"
  | "campaign_materializing"

const HTTP_STATUS_BY_CODE: Record<AgentErrorCode, number> = {
  missing_required_param: 400,
  invalid_param: 400,
  invalid_instruction: 400,
  invalid_trigger_keyword: 400,
  channel_not_connected: 400,
  no_account_configured: 400,
  unsupported_edit: 400,
  unauthorized: 401,
  flow_not_found: 404,
  node_not_found: 404,
  keyword_conflict: 409,
  rate_limited: 429,
  validation_failed: 500,
  internal_error: 500,
  publish_failed: 502,
  campaign_materializing: 409,
}

export class AgentError extends Error {
  readonly code: AgentErrorCode
  readonly details: Record<string, unknown> | undefined

  constructor(code: AgentErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "AgentError"
    this.code = code
    this.details = details
  }

  /**
   * Wrap any thrown value as an AgentError. If already an AgentError, returns
   * the same instance (no re-wrapping). Otherwise produces an internal_error
   * with the original message as context.
   */
  static fromUnknown(err: unknown): AgentError {
    if (err instanceof AgentError) return err
    const message = err instanceof Error ? err.message : String(err)
    return new AgentError("internal_error", message || "Unknown internal error")
  }

  /**
   * Build the JSON body customers receive. The `code`, `message`, and any
   * `details` fields are flattened into the top-level object — we don't nest
   * details under a `details` key because customers inspect fields like
   * `existing_flow` directly on the error object.
   */
  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message, ...(this.details ?? {}) }
  }

  /** For non-streaming endpoints: plain JSON Response with the correct HTTP status. */
  toHttpResponse(): Response {
    return new Response(JSON.stringify(this.toJSON()), {
      status: HTTP_STATUS_BY_CODE[this.code],
      headers: { "content-type": "application/json" },
    })
  }

  /**
   * For SSE streams: framed as an `event: error\ndata: {...}\n\n` block.
   * The route handler writes this directly to the stream controller. After
   * writing, the stream should be closed — errors are terminal events.
   */
  toSSE(): string {
    return `event: error\ndata: ${JSON.stringify(this.toJSON())}\n\n`
  }
}
