/**
 * The raw account shape returned by fs-whatsapp's `GET /api/accounts`.
 * Mirrors `AccountResponse` in fs-whatsapp/internal/handlers/accounts.go:32.
 * We only depend on a subset of fields.
 */
export interface WhatsAppAccountRaw {
  id: string
  name: string
  phone_number?: string // omitempty in Go
  status: string
  has_access_token: boolean
}

/**
 * The normalized Account we pass around internally. `connected_channels` is
 * hardcoded to ["whatsapp"] in v1 because fs-whatsapp's /api/accounts endpoint
 * only returns WhatsApp accounts (Instagram and Line live in separate models
 * at separate endpoints). See spec "Relationship to Phase D MCP server" for
 * the multi-channel generalization path.
 */
export interface Account {
  id: string
  name: string
  phone_number: string | undefined
  connected_channels: ReadonlyArray<"whatsapp" | "instagram" | "web">
}

/**
 * Everything a route handler needs after auth runs. The `apiKey` is kept
 * so downstream fetches can forward the `X-API-Key` header — we never have
 * to look it up again.
 */
export interface AgentContext {
  apiKey: string
  account: Account
}
