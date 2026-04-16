# Flow Assistant Agent API — Design

**Status**: Draft
**Author**: Pratik (with Claude)
**Date**: 2026-04-15
**Target**: magic-flow (Next.js) — REST API for external custom agents

## Summary

Expose the existing MagicFlow AI flow assistant as a REST API with SSE streaming, intended for consumption by a customer's own custom AI agent (OpenAI / Anthropic / Vercel AI SDK tool use). Four endpoints let the parent agent find, create, edit, and publish flows on a single Freestand account. The API is thin: it reuses the existing `generateFlowStreaming` code, the existing `whm_*` API key auth, the existing version and publish pipeline. Almost nothing new gets built on fs-whatsapp.

The API is intentionally narrower than the Phase D MCP server designed in `2026-04-11-ai-platform-plan.md`. This is NOT that project — it's a purpose-built REST surface for one customer-integration pattern. Phase D remains in the backlog for the generic external-agent story.

## Goals

- Let a customer's parent AI agent build, edit, and publish Freestand chatbot flows via REST.
- Preserve the "one-shot create" user experience described in the original ask: `create a flow for iphone 11 early launch` → one tool call → published live flow with test URL.
- Add safety for edits: edits become unpublished versions until the parent agent explicitly calls publish.
- Reuse existing AI orchestration, auth, versioning, and runtime deploy code. Zero reimplementation in Go.
- Ship REST + SSE as the complete integration surface. No client SDK, no NPM package, no language lock-in. An OpenAPI spec + a customer-facing integration guide + copy-paste code snippets for the top SDKs is the full customer deliverable.

## Non-goals

- Not building the Phase D MCP server.
- No multi-account support in v1 — we assume exactly one account per organization and pick it automatically, with a flagged TODO to generalize.
- **WhatsApp-only in v1.** fs-whatsapp's `GET /api/accounts` only returns `WhatsAppAccount` rows today; Instagram and Line live in separate models/endpoints. The agent API therefore only supports `channel: "whatsapp"` in v1. The `channel` param stays in the schema so future multi-channel support doesn't break the tool signature — for v1, Instagram / web requests return `channel_not_connected`.
- No template management, WhatsApp Flow builder, variable listing, or other Phase C subagent tools. Additive later.
- No scheduled publish, webhooks, rollback, audit logs for customers, draft mode on create, PII redaction in logs. Deferred to v1.1+.
- No new frontend UI. Customers use the existing `/settings/api-keys` page to create `whm_*` keys.

## Relationship to Phase D MCP server

This spec is **not** Phase D of the AI platform plan, but it's designed so that Phase D (when it happens) inherits ~80% of this work with minimal rework. Documenting the alignment here so future-me doesn't have to re-derive it.

### What MCP actually uses on the wire (context for the alignment)

MCP messages are JSON-RPC 2.0. Transport is one of:
- **stdio** (local MCP servers — Claude Desktop, Cursor, Zed, Claude Code CLI): newline-delimited JSON-RPC on stdin/stdout. Most common today.
- **Streamable HTTP** (remote MCP servers — spec revision 2025-03-26, replaced HTTP+SSE dual-endpoint): one endpoint, POST requests, server dynamically upgrades response to `Content-Type: text/event-stream` when streaming is needed. **SSE is the wire format for streaming responses**, with JSON-RPC messages in each `data:` frame.

Our agent API uses `text/event-stream` with our own JSON payload shapes. Phase D's Streamable HTTP MCP server would use `text/event-stream` with JSON-RPC payload shapes. **Same HTTP framing, different payloads inside `data:` frames.**

Side-by-side:

```
Agent API (this spec):
event: progress
data: {"phase":"generating","message":"Creating 3 of 6 nodes"}

Phase D MCP over Streamable HTTP (future):
event: message
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"t_01","progress":0.5,"message":"Creating 3 of 6 nodes"}}
```

The translation is ~40 LOC of wrapping. No protocol rewrite, no framework change.

### Tool-by-tool mapping

| Phase D plans (from `2026-04-11-ai-platform-plan.md`) | Agent API ships | Gap handling |
|---|---|---|
| `flow_create` (subagent with progress notifications) | `POST /v1/agent/flows` with SSE | ✅ 1:1 — our endpoint IS the subagent pattern Phase D describes |
| `flow_edit` (subagent with progress notifications) | `POST /v1/agent/flows/{id}/edit` with SSE | ✅ 1:1 |
| `flow_publish` (direct) | `POST /v1/agent/flows/{id}/publish` | ✅ 1:1 |
| `flow_list` (direct) | `GET /v1/agent/flows` | ✅ 1:1 |
| `flow_get` (direct, `buildFlowGraphString`) | ❌ not built | Phase D additive |
| `flow_validate` (direct, dry-run) | ❌ not built | Phase D additive |
| `flow_trigger` (direct, test-send) | ❌ not built | Phase D additive |
| `flow_node_types` (direct, cached docs) | ❌ not built | Phase D additive |
| `template_manage` (subagent) | ❌ not built | Phase C work, blocked on separate brainstorm |
| `wa_flow_manage` (subagent) | ❌ not built | Phase C work, blocked on separate brainstorm |
| Resources (`config://platforms`, `config://node-types/{platform}`, `flow://{id}/variables`) | ❌ not built | MCP-specific primitive, Phase D only |

When Phase D ships, **4 of the 10 planned tools are already done** and production-tested via the agent API. The remaining work is: 4 additive read-only tools (mostly thin fs-whatsapp proxies), 2 subagents (each needing their own brainstorm), 3 MCP resources, and the MCP server scaffolding itself.

### File-level transplant leverage

Of the ~2100 LOC this spec adds, roughly **80% transplants unchanged into a future Phase D MCP server**:

| File | Phase D reuse |
|---|---|
| `lib/agent-api/auth.ts` | ✅ 100% — same `whm_*` key flow via different transport wrapper |
| `lib/agent-api/account-resolver.ts` | ✅ 100% — needs the multi-account generalization pass before Phase D ships |
| `lib/agent-api/errors.ts` | ✅ 100% — add a `.toMCPError()` method alongside the existing `.toSSE()` / `.toHttpResponse()` |
| `lib/agent-api/schemas.ts` | ✅ 100% — Zod → JSON Schema output is what MCP tool definitions need |
| `lib/agent-api/publisher.ts` | ✅ 100% — transport-agnostic |
| `lib/agent-api/flow-loader.ts` | ✅ 100% — transport-agnostic |
| `lib/agent-api/diff.ts` | ✅ 100% — transport-agnostic |
| `lib/agent-api/rate-limit.ts` | ✅ Pattern reusable — stdio MCP doesn't need limits; Streamable HTTP MCP reuses as-is |
| `lib/agent-api/event-translator.ts` | ⚠️ Partial — the vocabulary maps but needs a second output target (JSON-RPC notification messages) |
| `lib/ai/tools/generate-flow.ts` (context param) | ✅ 100% — `context.source` grows one more valid value (`"mcp"`) |
| `lib/ai/tools/generate-flow-edit.ts` (toolFilter) | ✅ 100% — same whitelist |
| `lib/agent-api/sse.ts` | ⚠️ Translate-only — MCP's Streamable HTTP framing is already SSE, so the wire-format code is reusable; MCP stdio transport gets a parallel writer |
| `app/api/v1/agent/flows/*` route handlers | ❌ Not directly reused — MCP server has its own entry-point handlers. But the handler bodies copy-paste because they just call into the glue layer |

The glue layer (`lib/agent-api/*`) is the load-bearing code, and it's all framework-agnostic. Next.js route handlers are the wrapper for the REST path. MCP tool handlers are the wrapper for the MCP path. Both call into the same internals.

### The one thing we MUST fix before Phase D

**Single-account assumption.** Phase D is public external agent access — multi-customer, multi-account, no "first-pick" fallback. `getActingAccount` is flagged as TODO in code with a prescriptive fix list, but someone must actually do it before Phase D ships. ~100 LOC of follow-up:

1. Add `account_id` as an optional param (required when the org has >1 account)
2. Return `account_required` error with available IDs when >1 and none specified
3. Delete the "first-pick with comment" fallback

Triggered by whichever comes first: a customer with multiple connected accounts, or Phase D starting.

### What Phase D still has to build (not in this spec)

- MCP server scaffolding — `magic-flow/mcp-server/` directory, stdio + Streamable HTTP transports
- MCP tool definition format — conversion from our Zod schemas to MCP tool JSON (trivially mechanical)
- MCP `notifications/progress` adapter that sits on top of `event-translator.ts` and wraps each event as a JSON-RPC notification
- MCP resources — `config://platforms`, `config://node-types/{platform}`, `flow://{id}/variables` — these are a different MCP primitive (not tools) and need separate handlers
- `flow_get`, `flow_validate`, `flow_trigger`, `flow_node_types` — the 4 direct tools Phase D plans that this spec doesn't build
- `template_manage`, `wa_flow_manage` — the 2 Phase C subagents (separately brainstormed)

### Alignment score

- Architecture compatibility: ✅ fully compatible — glue layer is transport-agnostic
- Auth model: ✅ same (`whm_*` keys, `AuthWithDB` middleware)
- Tool-use pattern: ✅ we're inadvertently building the subagent pattern Phase D describes
- Progress model: ✅ SSE events map to `notifications/progress` with ~40 LOC wrapping
- Wire format: ✅ SSE is what MCP Streamable HTTP uses under the hood
- Error model: ✅ stable string codes, trivial to re-wrap
- Reuse leverage: ✅ ~80% of code transplants unchanged
- Blockers for Phase D: just the single-account generalization, already flagged in code

## Decisions log (from the brainstorm)

| # | Decision | Resolution |
|---|---|---|
| 1 | Relation to Phase D MCP server | Separate; narrower REST surface for one customer-integration pattern |
| 2 | Consumer + runtime | Customer's own agent on their infra; plain REST (not MCP) |
| 3 | Flow context handling for edits | `flow_id` explicit, parent agent tracks it, with `find_flow` helper for recovery |
| 4 | Streaming transport | SSE (`text/event-stream`) — de facto standard for AI streaming APIs (OpenAI, Anthropic, Vercel AI SDK) AND the exact wire format MCP's Streamable HTTP transport uses. Aligns with Phase D for free. |
| 5 | Clarifying questions for missing params | Parent agent's system prompt collects; tool treats params as required |
| 6 | Create auto-publishes? | Yes — `create` is one-shot, returns `test_url` |
| 7 | Edit full-power? | Yes — reuses the existing 4 core edit tools (filtered subset of 8) |
| 8 | API key scoping | Existing `whm_*` General API Keys; server picks `accounts[0]` with documented assumption |
| 9 | Keyword conflict handling | Reject with `keyword_conflict` error containing the existing flow info |
| 10 | Edit also auto-publishes? | No — edit creates unpublished version; `publish` is its own tool |
| 11 | Channel (platform) param | Required on create; validated against `connected_channels` on the account |
| 12 | Orphan project cleanup on failure | Delete the project on any `create_flow` failure after project creation |
| 13 | Publish step ordering | Single call: include `trigger_keywords` in the `POST /api/chatbot/flows` payload — atomic |
| 14 | Rate limiting | Simple in-memory per-key limiter — not a priority, minimal implementation |

## Current state of the code (verified 2026-04-15)

All references below were confirmed by reading files before writing this spec.

**magic-flow (Next.js)**
- `/api/ai/flow-assistant/route.ts` — existing internal endpoint, streams NDJSON via `generateFlowStreaming`
- `lib/ai/tools/generate-flow.ts` — main entry (`generateFlowStreaming` at `generate-flow.ts:355`, signature: `(request: GenerateFlowRequest, emit: (event: StreamEvent) => void) => Promise<void>`)
- `lib/ai/tools/generate-flow-edit.ts` — 8 internal tools: `get_node_details`, `get_node_connections`, `apply_edit`, `validate_result`, `save_as_template`, `undo_last`, `list_variables`, `trigger_flow`
- `lib/whatsapp-api.ts:23` — `publishFlowToWhatsApp(flowData, publishedFlowId?)` — `POST /api/chatbot/flows` (create) or `PUT /api/chatbot/flows/{id}` (update)
- `lib/whatsapp-api.ts:87` — `updateFlowKeywords(flowId, {...})` — also hits `PUT /api/chatbot/flows/{id}`; unused by the agent pipeline
- `app/(dashboard)/settings/api-keys/page.tsx` — existing two-tab API key management UI (General + Flow API Keys)
- `hooks/queries/use-api-keys.ts` — `useApiKeys`, `useCreateApiKey`, `useDeleteApiKey` — already proxies to fs-whatsapp
- `types/flow-plan.ts` — `localId`, `newType` used in edit tool plans

**fs-whatsapp (Go)**
- `internal/middleware/middleware.go:87` — `AuthWithDB` validates both JWT and `X-API-Key: whm_*` keys
- `internal/middleware/middleware.go:144` — `validateAPIKey` uses bcrypt, sets `user_id`, `organization_id`, `email`, `role` on context, updates `last_used_at` async
- `internal/handlers/apikeys.go` — `ListAPIKeys` / `CreateAPIKey` / `DeleteAPIKey` on `/api/api-keys`
- `internal/handlers/chatbot.go:762` — `CreateChatbotFlow` **accepts `trigger_keywords` in the request body** (line 771)
- `internal/handlers/chatbot.go:977` — `UpdateChatbotFlow` also accepts `trigger_keywords` (line 997, assigned at 1023-1024)
- `internal/handlers/chatbot.go:941` — `checkKeywordConflicts` is called on both create and update — **fs-whatsapp has DB-level keyword conflict detection already**
- `internal/handlers/accounts.go:52` — `ListAccounts` returns `WhatsAppAccount` rows **only** (not Instagram, not Line). Response shape: `{accounts: [...]}`. Each platform has its own account type and handler in the codebase.
- `internal/handlers/magic_flow.go:165` — `ListMagicFlowProjects` paginated, supports `page`, `limit`, `type` (no `query` param today)
- `internal/handlers/magic_flow.go:343` — `CreateMagicFlowProject` auto-creates v1 with `is_published: true`
- `internal/handlers/magic_flow.go:598` — `CreateMagicFlowVersion` auto-increments `version_number` via `MAX + 1`
- `internal/handlers/magic_flow.go:667` — `PublishMagicFlowVersion` — transaction that unpublishes others and publishes target
- `internal/models/magic_flow.go:42` — `MagicFlowVersion` model with `nodes`, `edges`, `version_number`, `is_published`, `published_at`, `changes`

**Verified assumptions**
- `whm_*` keys authenticate on `X-API-Key` header, not `Authorization: Bearer`.
- The key inherits the creating user's role at validation time (`middleware.go:175-182`). If the user's role changes or they're deactivated, the key's access reflects it live.
- Every magic-flow endpoint we need in fs-whatsapp is already behind `AuthWithDB` and so already works with `whm_*` keys.
- `POST /api/chatbot/flows` accepts trigger keywords in the same payload as nodes/edges. We can publish atomically without a separate `updateFlowKeywords` call.
- **Accounts are platform-specific in fs-whatsapp.** `WhatsAppAccount`, `InstagramAccount`, and `LineAccount` are separate models with separate endpoints. `GET /api/accounts` returns only WhatsApp accounts. For v1 this is fine because the agent API is WhatsApp-only (see channel constraints below). Multi-channel generalization is explicit deferred work.

## Endpoints

All endpoints live under `app/api/v1/agent/` in magic-flow. Auth on every endpoint: `X-API-Key: whm_...`. Four endpoints total — we intentionally did NOT include a `GET /v1/agent/account` endpoint for v1 because everything it would return is either hardcoded (channel is always `"whatsapp"`), already in create/publish responses (phone number, test URL), or a constant capability flag. When multi-channel support lands (v1.1+), we introduce the account endpoint then because that's when `connected_channels` becomes meaningful.

Internally the single-account resolution (`getActingAccount`) still happens — it's just done inside each endpoint's auth wrapper and used to construct `test_url`. It doesn't need a customer-facing tool.

### 1. `GET /v1/agent/flows`

Find/list flows. Not streamed. Used by parent agent when it's lost `flow_id` context.

**Query params**: `query` (optional hint, unused for ranking in v1), `limit` (default 10, max 50)

**Response**
```json
{
  "flows": [
    {
      "flow_id": "mf_01HFR7X9...",
      "name": "iPhone 11 Early Launch",
      "trigger_keyword": "iphone11",
      "node_count": 6,
      "magic_flow_url": "https://app.freestand.xyz/flow/mf_01HFR7X9...",
      "test_url": "https://wa.me/919876543210?text=iphone11",
      "created_at": "2026-04-15T11:42:08Z",
      "updated_at": "2026-04-15T11:47:22Z",
      "current_version": 3
    }
  ],
  "total": 1
}
```

Internal: calls `GET /api/magic-flow/projects?limit=50` on fs-whatsapp, returns the list as-is plus computed `test_url` and `magic_flow_url`. Parent agent's LLM does fuzzy matching on names — no server-side search in v1.

### 2. `POST /v1/agent/flows` — create + publish (SSE)

**Request**
```json
{
  "instruction": "build a lead capture flow for iphone 11 early launch — ask for name, city, and whether they already own an iphone",
  "channel": "whatsapp",
  "trigger_keyword": "iphone11"
}
```

All three required. Missing → `400 missing_required_param`.

Validation in order:
1. `channel` in `["whatsapp", "instagram", "web"]` — else `400 invalid_param`
2. `channel` in account's `connected_channels` — else `400 channel_not_connected` with `connected_channels` in payload
3. `instruction` length ≤ 4000 — else `400 invalid_instruction`
4. `trigger_keyword` normalized to lowercase, matches `^[a-z0-9_-]{1,50}$` — else `400 invalid_trigger_keyword`
5. `trigger_keyword` doesn't conflict with any existing flow on this org — **our endpoint does an explicit pre-check** via `GET /api/chatbot/flows` (fetches the list, checks `trigger_keywords` arrays across all flows for this org, case-insensitive match on the normalized keyword). If conflict found, return `409 keyword_conflict` with `existing_flow: {id, name, magic_flow_url}` in payload.
   
   **Important**: fs-whatsapp's own `checkKeywordConflicts` at `chatbot.go:1773` is **advisory only** — it returns conflicts in the create response but does NOT reject the create (confirmed by the comment at `chatbot.go:940`: "Check keyword conflicts (advisory, doesn't block create)"). So our pre-check is the authoritative rejection gate for agent-originated flows. fs-whatsapp's advisory response is a backup signal we can log but don't rely on for enforcement. If we skip the pre-check and the underlying create returns a populated `keyword_conflicts` array, we'd have a published-but-duplicate flow on our hands. Don't skip the pre-check.

All the above happen BEFORE the SSE stream opens. They're returned as normal HTTP errors.

**Success response — SSE stream (`text/event-stream`)**

Event types: `progress`, `result`, `error`. Three types, nothing more. Every event is one JSON payload on one `data:` line.

```
event: progress
data: {"phase":"understanding","message":"Analyzing your request"}

event: progress
data: {"phase":"planning","message":"Building a 6-node flow plan"}

event: progress
data: {"phase":"generating","message":"Creating nodes","nodes_created":2,"nodes_total":6}

event: progress
data: {"phase":"validating","message":"Checking flow structure"}

event: progress
data: {"phase":"publishing","message":"Publishing to WhatsApp account"}

event: result
data: {
  "flow_id": "mf_01HFR7X9...",
  "version": 2,
  "name": "iPhone 11 Early Launch",
  "summary": "A 6-node flow that collects name, city, and current phone ownership, then routes to a human agent for existing iPhone users or sends a waitlist confirmation otherwise.",
  "node_count": 6,
  "magic_flow_url": "https://app.freestand.xyz/flow/mf_01HFR7X9...",
  "test_url": "https://wa.me/919876543210?text=iphone11",
  "trigger_keyword": "iphone11",
  "created_at": "2026-04-15T11:42:08Z"
}
```

The stream terminates after `event: result` (or `event: error`). The connection closes. No `[DONE]` marker.

Heartbeat: emit `: ping\n\n` (SSE comment) every 15s during long AI generation so proxies don't time out.

**Error response — SSE stream (or HTTP pre-stream error)**

Errors that come up DURING the stream:
```
event: progress
data: {"phase":"validating","message":"Checking flow structure"}

event: error
data: {
  "code": "validation_failed",
  "message": "AI produced a flow with 2 structural errors",
  "errors": ["unreachable node 'plan-question-3'", "orphaned edge 'e-x7f3-plan-thanks'"]
}
```

After emitting `event: error`, the orphan cleanup (decision #12) runs: DELETE the MagicFlowProject that was created at step 1. Cleanup failures are logged but don't affect the client-facing error shape.

### 3. `POST /v1/agent/flows/{flow_id}/edit` — edit (SSE)

**Request**
```json
{
  "instruction": "make the 'what's your name' copy more friendly and add an emoji"
}
```

`flow_id` in URL path. `instruction` required.

**Success response — SSE stream, final `result` event**
```json
{
  "flow_id": "mf_01HFR7X9...",
  "version": 5,
  "published": false,
  "name": "iPhone 11 Early Launch",
  "summary": "Updated the name question to 'Hi there! 👋 What should I call you?' — friendlier tone with an emoji",
  "changes": [
    {"type": "update_node", "node_id": "plan-question-2-x7f3", "field": "question", "before": "What's your name?", "after": "Hi there! 👋 What should I call you?"}
  ],
  "node_count": 6,
  "magic_flow_url": "https://app.freestand.xyz/flow/mf_01HFR7X9...",
  "next_action": "Call POST /v1/agent/flows/mf_01HFR7X9.../publish to make this version live",
  "updated_at": "2026-04-15T11:47:22Z"
}
```

Key differences from create:
- No `test_url` — not yet live.
- `published: false` — explicit.
- `changes` array — compact, human-readable diff built from `apply_edit`'s output.
- `next_action` — string hint that the parent agent's LLM reads to decide the next tool call.

Internal sequence:
1. Load project + latest published version from fs-whatsapp as `existingFlow`
2. Run `generateFlowStreaming` in edit mode with a filtered tool set (see the `generate-flow-edit.ts` modification under Internal Implementation below)
3. Create new unpublished version row in fs-whatsapp with `changes.source = "agent_api"`
4. Return result. **Do NOT publish.**

### 4. `POST /v1/agent/flows/{flow_id}/publish` — publish (JSON)

**Request body**: `{}` (empty). Future versions may accept `{"version": N}` for rollback; v1 always publishes the latest version number.

**Success response**
```json
{
  "flow_id": "mf_01HFR7X9...",
  "version": 5,
  "published": true,
  "already_published": false,
  "published_at": "2026-04-15T11:48:01Z",
  "test_url": "https://wa.me/919876543210?text=iphone11",
  "trigger_keyword": "iphone11",
  "magic_flow_url": "https://app.freestand.xyz/flow/mf_01HFR7X9..."
}
```

If nothing to publish, returns 200 with `"already_published": true` (not an error).

Internal sequence:
1. Look up the flow's highest `version_number`. If it's already the currently-published one → return `already_published: true`.
2. Otherwise `POST /api/magic-flow/projects/{id}/versions/{version_id}/publish` (unpublishes previous, publishes target)
3. `POST /api/chatbot/flows` with the full payload INCLUDING `trigger_keywords` — single atomic call. Create if no existing runtime flow, update otherwise.
4. Construct `test_url` from the account's `phone_number` + the trigger keyword. If `phone_number` is empty (the `AccountResponse.PhoneNumber` field is `omitempty` in fs-whatsapp), `test_url` is omitted from the response — the parent agent handles the missing field and tells the user they can test the flow by sending the trigger keyword to their account manually. Return.

Idempotent — safe to retry after a transient network failure.

## Error codes

| Code | HTTP | Where |
|---|---|---|
| `missing_required_param` | 400 | all write endpoints |
| `invalid_param` | 400 | all — wrong enum value etc. |
| `invalid_instruction` | 400 | create, edit — too long, empty, or AI couldn't make sense of it |
| `invalid_trigger_keyword` | 400 | create — fails normalization regex |
| `channel_not_connected` | 400 | create — payload includes `connected_channels` |
| `keyword_conflict` | 409 | create — payload includes `existing_flow` |
| `flow_not_found` | 404 | edit, publish, find — or not in this org |
| `node_not_found` | 404 | edit — AI couldn't resolve a natural-language node reference |
| `unsupported_edit` | 400 | edit — request outside our capability |
| `validation_failed` | 500 | create, edit — AI produced structurally invalid output |
| `no_account_configured` | 400 | any — org has 0 connected accounts |
| `publish_failed` | 502 | create, publish — fs-whatsapp upstream failure; retryable |
| `unauthorized` | 401 | all — bad or missing X-API-Key |
| `rate_limited` | 429 | all — payload includes `retry_after_seconds` |
| `internal_error` | 500 | all — catch-all, retry-safe |

`nothing_to_publish` is NOT an error — `publish_flow` returns 200 with `already_published: true` instead.

Error payloads (both HTTP body and SSE `event: error`) use the shape:
```json
{
  "code": "keyword_conflict",
  "message": "Human-readable description",
  "details": { "...": "..." }
}
```

Specific error types can have extra top-level fields on the data object (e.g., `existing_flow`, `connected_channels`, `retry_after_seconds`) — documented per code.

## Parent agent integration

No client SDK. Customers integrate against the REST+SSE API directly using their language's standard HTTP/SSE primitives. Freestand ships three things to make this easy:

1. **OpenAPI spec** at `/api/v1/agent/openapi.json` — served by the Next.js app. Customers can generate typed clients with Stainless, openapi-typescript, openapi-generator, or whatever tool their language ecosystem prefers.
2. **Integration guide** (`2026-04-15-flow-assistant-agent-api-integration.md`) — a customer-facing HOWTO with quickstart, tool reference, copy-paste examples for Vercel AI SDK / OpenAI SDK / Anthropic SDK (TypeScript + Python), raw curl examples, error handling, and FAQ. Written to be the one doc a customer engineer reads before starting their integration.
3. **System prompt fragment** — a ~300-token block of text documented in the integration guide. Customers paste it into their parent agent's system prompt to teach the LLM how to use the tools correctly: collect `channel + trigger_keyword` before `create_flow`; use `find_flow` when `flow_id` is lost; always show the edit diff to the user and wait for confirmation before `publish_flow`.

### Tool naming convention

The four tools customers expose to their LLM should be named with a `freestand_` prefix to avoid collisions in a mixed-tool agent: `freestand_find_flow`, `freestand_create_flow`, `freestand_edit_flow`, `freestand_publish_flow`. The integration guide's copy-paste examples use these names by default. Customers can rename if they want — the REST contract is name-agnostic.

### Error handling

Our REST errors are stable string codes in the JSON response body:

```json
{
  "code": "keyword_conflict",
  "message": "Trigger keyword 'iphone11' is already in use",
  "existing_flow": { "id": "mf_01HFQ8K2...", "name": "iPhone Pre-Order", "magic_flow_url": "..." }
}
```

Customers inspect `error.code` in their own error handling. The integration guide documents every code, what payload fields come with it, and recommended handling strategies for both the parent agent's code AND the LLM's system prompt instructions.

### Progress streaming — customer's responsibility

The REST API emits SSE events during long-running AI generation (create / edit). The customer's tool implementation decides how those events reach the end user:

**Pattern A (recommended)**: While processing the SSE stream in the tool's execute function, the customer pushes each `progress` event to their own UI-facing channel (their own WebSocket, SSE, Server Actions stream, etc.). The LLM sees only the final result. Live UX, clean LLM context.

**Pattern B**: Aggregate progress events into a narrative string, include it in the tool result. The LLM sees the narrative and relays it. No real-time UX but no infrastructure needed.

Both patterns are documented in the integration guide with copy-paste examples in TypeScript and Python.

## Internal implementation

### Where the code lives

All endpoints are Next.js route handlers in magic-flow. **Zero fs-whatsapp changes.** The reasons:
- AI generation is TypeScript; reimplementing in Go costs ~2000 LOC for no win
- SSE is easy in Next.js (`ReadableStream`, `TransformStream`); Fastglue streaming is less ergonomic
- Every downstream fs-whatsapp endpoint we call is already behind `AuthWithDB` and accepts `whm_*` keys today

### Auth flow per request

```
Customer agent
  │ X-API-Key: whm_abcd...
  ▼
Next.js: /api/v1/agent/flows
  │ 1. Read X-API-Key (fail fast if missing or wrong prefix)
  │ 2. Call fs-whatsapp: GET /api/accounts (forwarding X-API-Key)
  │    → 401 → return unauthorized
  │    → 200 → extract first account (= acting account)
  │ 3. Run the endpoint's main logic
  │ 4. Stream SSE (for create/edit) or return JSON (for publish/find/account)
```

`GET /api/accounts` is the implicit auth validator — no separate `/api/auth/verify` endpoint needed. Same round trip, two purposes.

### File inventory

**New files in magic-flow**
```
app/api/v1/agent/
└── flows/
    ├── route.ts                    # POST (create, SSE) + GET (find)
    └── [flow_id]/
        ├── edit/route.ts           # POST (edit, SSE)
        └── publish/route.ts        # POST (publish, JSON)

lib/agent-api/
├── auth.ts                         # withAgentAuth wrapper
├── account-resolver.ts             # getActingAccount — single-account assumption + TODO comment
├── sse.ts                          # SSE writer helpers (text/event-stream framing, heartbeat)
├── event-translator.ts             # translates internal StreamEvent → public progress/result/error events
├── errors.ts                       # AgentError class + error code enum
├── publisher.ts                    # direct-fetch helpers that forward X-API-Key to fs-whatsapp:
│                                   #   createProject, createVersion, publishVersion,
│                                   #   publishRuntimeFlow, deleteProject, checkKeywordConflict
│                                   # Does NOT use lib/whatsapp-api.ts (that module uses apiClient
│                                   # with session cookies; agent path forwards X-API-Key instead)
├── flow-loader.ts                  # loads flow state for edit
├── diff.ts                         # compact changes array for edit responses
├── schemas.ts                      # zod schemas for request bodies
└── rate-limit.ts                   # in-memory per-key limiter
```

**Modified files in magic-flow**
- `lib/ai/tools/generate-flow.ts` — add optional `context` parameter; when `context.source === "agent_api"`, skip UI-specific fields (selectedNode, userTemplates, publishedFlowId in toolContext). ~30 LOC.
- `lib/ai/tools/generate-flow-edit.ts` — add `toolFilter` option to restrict the tool set. For agent edit we whitelist `get_node_details`, `get_node_connections`, `apply_edit`, `validate_result` and exclude the other 4. ~20 LOC.

**`lib/whatsapp-api.ts` stays untouched.** That module is used by the internal UI path via `apiClient` (session cookies). The agent API path uses its own direct-fetch helpers in `lib/agent-api/publisher.ts` that forward the `X-API-Key` header. Two separate call sites for the same fs-whatsapp endpoints, with different auth mechanisms — less clever than a shared helper, more explicit about the different auth paths, zero risk of breaking the internal UI when changing the agent API.

**Zero changes in fs-whatsapp.**

### Event translation — internal `StreamEvent` → public SSE events

The existing `generateFlowStreaming` function in `generate-flow.ts:355` is **callback-based and serialization-agnostic**. It takes an `emit: (event: StreamEvent) => void` callback and fires events through it during execution. The existing internal `/api/ai/flow-assistant` endpoint serializes these events as NDJSON on the wire. The new agent API endpoints serialize the same events as SSE, but **with a translation layer** because the internal event vocabulary is richer than what we want to expose publicly.

Internal `StreamEvent` union (from `generate-flow.ts:88`, unchanged):

```typescript
type StreamEvent =
  | { type: 'tool_step'; name: string; details?: ToolStepDetails }
  | { type: 'text_delta'; delta: string }
  | { type: 'flow_ready'; data: GenerateFlowResponse }
  | { type: 'result'; data: GenerateFlowResponse }
  | { type: 'error'; message: string }
```

Public SSE event vocabulary (defined by this spec):
- `progress` — `{phase: string, message: string, ...additional}` — human-readable progress indicator
- `result` — full result payload (flow_id, magic_flow_url, test_url, changes, etc.)
- `error` — `{code, message, ...payload}` — typed error

Translation rules (in `lib/agent-api/event-translator.ts`):

| Internal event | Public SSE event | Derivation |
|---|---|---|
| `tool_step` (kind=edit) | `progress` | `phase: "editing"`, message built from `details.added` / `removed` / `updated` counts |
| `tool_step` (kind=validate, valid=true) | `progress` | `phase: "validating"`, `message: "Validated N nodes"` |
| `tool_step` (kind=validate, valid=false) | `error` (terminal) | `code: "validation_failed"`, `errors: details.issues` |
| `text_delta` | **dropped** | Internal prose tokens — not surfaced to the public API. Customers get discrete phase transitions, not token-by-token text. |
| `flow_ready` | `progress` | `phase: "ready"`, `message: "Flow plan ready"` |
| `result` | `result` (terminal) | Re-shape from internal `GenerateFlowResponse` into our cleaner public shape: `{flow_id, version, name, summary, node_count, magic_flow_url, test_url, trigger_keyword, created_at}` |
| `error` | `error` (terminal) | Map to our error code enum; unknown errors become `internal_error` |

The translator also **synthesizes additional progress events at phase boundaries** that don't correspond to any internal event — e.g., `{phase: "understanding", message: "Analyzing your request"}` is emitted by the route handler before calling `generateFlowStreaming`, and `{phase: "publishing", message: "Deploying to your account"}` is emitted after `generateFlowStreaming` returns but before `publisher.publishRuntimeFlow(ctx, ...)` is called. These live in the route handler itself, not in `event-translator.ts`.

Why drop `text_delta`: the internal UI uses AI prose tokens to render a chat panel with incremental text. The public agent API doesn't expose chat — it's a tool call that either succeeds or fails. Incremental AI reasoning tokens would just be noise for the parent LLM consuming the tool result. Customers who want narrative-style progress can use Pattern B (aggregate discrete `progress` events into a narrative string in the final result).

This translator is the ~60 LOC piece that also becomes the integration point for Phase D's MCP adapter — see "Relationship to Phase D MCP server" above.

### `account-resolver.ts` with the TODO comment

```typescript
// lib/agent-api/account-resolver.ts

// TODO(multi-account): when orgs are allowed to have >1 account, this helper
// must be replaced with an explicit account_id param on the request. For now
// (single-account assumption), we unconditionally pick the first account
// returned by fs-whatsapp. If an org has 0 accounts, we return an error.
//
// When this assumption is removed:
//   1. Add `account_id` as a required param on POST /v1/agent/flows
//   2. If we also add a GET /v1/agent/account(s) endpoint at that time, it returns an array
//   3. Delete this helper
export async function getActingAccount(apiKey: string): Promise<Account> {
  const res = await fetch(`${FS_WA_URL}/api/accounts`, {
    headers: { "X-API-Key": apiKey },
  })
  if (res.status === 401) throw new AgentError("unauthorized", "Invalid API key")
  if (!res.ok) throw new AgentError("internal_error", "Failed to load accounts")
  const body = (await res.json()) as { accounts: WhatsAppAccount[] }
  const accounts = body?.accounts ?? []
  if (accounts.length === 0) {
    throw new AgentError("no_account_configured", "This organization has no connected WhatsApp account")
  }
  const first = accounts[0]  // <-- the load-bearing line
  return {
    id: first.id,
    name: first.name,
    phone_number: first.phone_number,
    connected_channels: ["whatsapp"],  // hardcoded — fs-whatsapp /api/accounts returns WhatsApp only today
  }
}
```

### `withAgentAuth` wrapper

```typescript
export function withAgentAuth<T>(
  handler: (ctx: AgentContext, req: Request) => Promise<T>
) {
  return async (req: Request) => {
    const apiKey = req.headers.get("x-api-key")
    if (!apiKey || !apiKey.startsWith("whm_")) {
      return agentErrorResponse("unauthorized", "Missing or invalid API key")
    }
    
    // Rate limit check
    const limit = rateLimitCheck(apiKey, req.method, new URL(req.url).pathname)
    if (!limit.ok) {
      return agentErrorResponse("rate_limited", "Rate limit exceeded", { retry_after_seconds: limit.retryAfter })
    }
    
    let account: Account
    try {
      account = await getActingAccount(apiKey)
    } catch (err) {
      if (err instanceof AgentError) return err.toHttpResponse()
      throw err
    }
    
    return handler({ apiKey, account }, req)
  }
}
```

The `AgentContext` is minimal: `{ apiKey, account }`. No `orgId` / `userId` / `email` — the forwarded `X-API-Key` carries the context automatically into every downstream fs-whatsapp call.

### Create endpoint sequence (pseudocode)

```typescript
export const POST = withAgentAuth(async (ctx, req) => {
  const body = await req.json()
  const { instruction, channel, trigger_keyword } = createFlowSchema.parse(body)
  const normalizedKeyword = trigger_keyword.toLowerCase()
  
  // Pre-flight validation
  if (!ctx.account.connected_channels.includes(channel)) {
    return agentErrorResponse("channel_not_connected", ..., { connected_channels })
  }
  const conflict = await checkKeywordConflict(normalizedKeyword, ctx)
  if (conflict) {
    return agentErrorResponse("keyword_conflict", ..., { existing_flow: conflict })
  }
  
  let projectId: string | null = null
  const stream = createSSEStream()
  
  ;(async () => {
    try {
      stream.progress("understanding", "Analyzing your request")
      
      // Step 1 — create project (backend auto-creates v1 stub)
      const project = await createProject({ name: deriveName(instruction), platform: channel }, ctx)
      projectId = project.id
      
      // Step 2 — generate flow
      stream.progress("planning", "Building flow plan")
      const result = await generateFlowStreaming({
        message: instruction,
        platform: channel,
        existingFlow: { nodes: [{ type: "start" }], edges: [] },
        context: { source: "agent_api" },
        abortSignal: req.signal,
        onProgress: (phase, msg, data) => stream.progress(phase, msg, data),
      })
      
      // Step 3 — create version row
      stream.progress("validating", "Checking flow structure")
      const version = await createVersion(project.id, result.nodes, result.edges, {
        source: "agent_api",
        instruction,
      }, ctx)
      
      // Step 4 — publish version in magic-flow
      await publishVersion(project.id, version.id, ctx)
      
      // Step 5 — deploy to runtime with trigger_keywords in the same payload (atomic)
      // NOTE: we don't call lib/whatsapp-api.ts's publishFlowToWhatsApp here because
      // that helper uses apiClient (session cookies). The agent path has an X-API-Key
      // header that must be forwarded. lib/agent-api/publisher.ts makes a direct fetch
      // to fs-whatsapp with the forwarded key. See "File inventory" above.
      stream.progress("publishing", "Publishing to your account")
      const flowData = convertToFsWhatsApp(result.nodes, result.edges)
      const runtime = await publishRuntimeFlow(ctx, {
        ...flowData,
        trigger_keywords: [normalizedKeyword],
        trigger_match_type: "exact",
      })
      
      stream.result({
        flow_id: project.id,
        version: version.version_number,
        name: project.name,
        summary: result.summary,
        node_count: result.nodes.length,
        magic_flow_url: buildMagicFlowUrl(project.id),
        test_url: buildTestUrl(ctx.account.phone_number, normalizedKeyword),
        trigger_keyword: normalizedKeyword,
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      const agentErr = err instanceof AgentError ? err : AgentError.fromUnknown(err)
      stream.error(agentErr)
      
      // Orphan cleanup (decision #12)
      if (projectId) {
        try {
          await deleteProject(projectId, ctx)
        } catch (cleanupErr) {
          log.error("orphan cleanup failed", { projectId, cleanupErr })
        }
      }
    } finally {
      stream.close()
    }
  })()
  
  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
})
```

Abort handling: `req.signal` is plumbed through to `generateFlowStreaming`. If the client disconnects, `streamText` throws AbortError, we catch it, emit `event: error` with `code: "client_disconnected"`, and the orphan cleanup runs.

## Edge cases

Summary of handled cases and their v1 behavior:

| Case | v1 behavior |
|---|---|
| Human editing in UI + agent editing same flow | Accept race; agent's version is v5, human's publish later becomes v6, last publish wins. Documented gap that also affects human-on-human. |
| Two agents editing same flow concurrently | Accept race; `version_number` is auto-incremented atomically, last publish wins. |
| SSE client abort mid-stream | Plumb `request.signal` into `generateFlowStreaming.abortSignal`. Check abort at phase boundaries. Orphan cleanup runs. |
| Orphan project on AI validation failure | DELETE the project on any `create_flow` failure after project creation. Cleanup failures logged but don't mask the original error. |
| Keyword conflict detected after pre-check | **Our pre-check is authoritative** — fs-whatsapp's own `checkKeywordConflicts` is advisory-only (`chatbot.go:940` comment: "advisory, doesn't block create"), so if we skip the pre-check we'd end up with a published duplicate flow. Race window is the time between our GET-list check and our POST-create: milliseconds in practice, unhandled in v1. If a race does happen, the runtime will have two flows claiming the same trigger keyword — fs-whatsapp's trigger matching picks one deterministically (likely the most recently updated), and the customer's flow history will show both. Not great but rare enough to defer. |
| Partial writes in publish pipeline | Eliminated — trigger keywords are in the same payload as the runtime publish. Atomic. |
| Rate limiting | Simple in-memory `Map<apiKey, {count, resetAt}>`. 10 create/edit per minute, 30 publish, 120 find/account. Tunable. Not a priority. |
| Long instructions | Cap at 4000 chars. `400 invalid_instruction`. |
| Keyword normalization | Lowercase, `^[a-z0-9_-]{1,50}$`. Reject spaces and special characters. |
| AI gives up / produces empty flow | `validate_result` catches it, we map to `invalid_instruction` with AI's explanation. |
| `find_flow` many matches | Return top 50 recent, let parent LLM fuzzy-match. No server-side search. |
| `already_published` race | Accept, non-error. |
| Network failures magic-flow → fs-whatsapp | 30s timeout, 1 retry on network errors only, log upstream. |
| Revoked user / deactivated user | Existing `validateAPIKey` middleware handles correctly. No action. |

## Security considerations

- **Auth**: Existing `whm_*` key flow. Keys are bcrypted at rest, prefix-indexed for fast lookup, checked with `bcrypt.CompareHashAndPassword`. Key owner's role is checked live at every validation.
- **Org isolation**: Every downstream fs-whatsapp call scopes by `organization_id` from the key context. Cross-org access is impossible.
- **Rate limits**: In-memory per-key limiter prevents runaway customer bills from a buggy parent agent. First line of defense only — real abuse protection needs Redis-backed counters later.
- **Instruction PII**: Instructions may contain PII the user pasted in. v1 logs the instruction server-side for debugging. Before GA, we add a PII-scrubber or disable instruction logging. Flagged as deferred work.
- **Prompt injection**: Agent-generated flows are visible in the customer's Magic Flow UI version history — a human reviews them if they ever become suspicious. The customer's own parent agent is their first line of defense against the end-user writing adversarial instructions; we trust the parent agent layer.

## Testing

### Unit tests (magic-flow, vitest)
- `lib/agent-api/auth.ts` — valid key, missing key, wrong prefix, fs-whatsapp 401, fs-whatsapp 500
- `lib/agent-api/account-resolver.ts` — zero accounts, one account, multiple accounts (picks first)
- `lib/agent-api/sse.ts` — progress / result / error events have correct wire format, heartbeat timing
- `lib/agent-api/errors.ts` — every error code has a `.toSSE()` and `.toHttpResponse()`, no unmapped codes
- `lib/agent-api/diff.ts` — changes array construction from apply_edit output
- `lib/agent-api/rate-limit.ts` — within limit, at limit, over limit, reset behavior

### Integration tests (happy-path + error)
- POST `/v1/agent/flows` end-to-end with mocked fs-whatsapp responses, assert SSE event sequence
- POST `/v1/agent/flows/{id}/edit` end-to-end, assert new version row in the mocked fs-whatsapp, no publish call
- POST `/v1/agent/flows/{id}/publish` end-to-end, assert `POST /api/chatbot/flows` called with `trigger_keywords`
- Error cases: missing params, bad channel, keyword conflict, validation failure (orphan cleanup)
- Abort: client disconnects mid-generation, assert `generateFlowStreaming` got the signal and `deleteProject` ran

### Manual E2E test (before release)
- Spin up a Freestand docker environment with a seeded org + whm_ key
- Use curl to hit each endpoint with real SSE
- Verify the created flow appears in the UI at `/flow/{id}`
- Verify the runtime flow responds to the trigger keyword in a WhatsApp sandbox number
- Verify `find_flow` returns the new flow
- Verify edit + publish cycle, including the `published: false` state after edit

## Phasing

The work splits into four phases, each shippable on its own branch with its own review cycle. Phase 1 is a no-risk scaffolding phase that can merge behind no feature flag (no customer-writable endpoints exist). Later phases layer on.

### Phase 1 — Scaffolding + read endpoint

**Goal**: Prove the auth wrapper, account resolver, and SSE infrastructure work end-to-end with the simplest endpoint (`GET /v1/agent/flows`). Get the glue layer in place so Phase 2 is purely new routes + AI wiring.

**Deliverables**:
- `lib/agent-api/auth.ts` with `withAgentAuth`
- `lib/agent-api/account-resolver.ts` with the single-account assumption + TODO comment
- `lib/agent-api/errors.ts` — AgentError class, full code enum, `toSSE`, `toHttpResponse`
- `lib/agent-api/rate-limit.ts` — in-memory limiter, minimal implementation
- `lib/agent-api/sse.ts` — SSEWriter with `progress`, `result`, `error`, heartbeat
- `lib/agent-api/schemas.ts` — zod schemas for all request bodies (ahead of use in Phase 2+)
- `app/api/v1/agent/flows/route.ts` — `GET` handler only (find/list)
- Unit tests for every new file
- One integration test for the find endpoint

**Not in scope**: no create, edit, or publish endpoints. No AI code touched. No changes to `generate-flow.ts` or `generate-flow-edit.ts`. No account endpoint (dropped — see Endpoints section).

**Risk**: Very low. One read-only endpoint that proxies an existing fs-whatsapp GET. No customer-writable surface.

**Definition of done**:
- `GET /v1/agent/flows` returns the seeded test org's flows
- `withAgentAuth` correctly rejects missing / invalid / revoked keys
- `getActingAccount` returns the seeded org's first WhatsApp account
- `npx tsc --noEmit` passes
- `npx vitest run` passes
- Manual curl test with a real `whm_*` key succeeds

### Phase 2 — Create flow (SSE)

**Goal**: Ship the one-shot create endpoint. This is the biggest single piece of work because it touches the AI generation code and adds orphan cleanup.

**Deliverables**:
- `lib/agent-api/publisher.ts` — direct-fetch helpers for fs-whatsapp (createProject, createVersion, publishVersion, publishRuntimeFlow, deleteProject, checkKeywordConflict); all forward `X-API-Key`
- `lib/agent-api/event-translator.ts` — internal `StreamEvent` → public `progress/result/error` SSE events
- `lib/agent-api/diff.ts` — changes array builder (needed now for consistency, used in Phase 3)
- `app/api/v1/agent/flows/route.ts` — add `POST` handler (create with SSE)
- `lib/ai/tools/generate-flow.ts` — add `context` parameter; agent-api path skips UI fields
- Unit tests for `publisher.ts`, `event-translator.ts`, the context-parameter path in generate-flow
- Integration test for the full create endpoint with mocked fs-whatsapp
- Abort handling test (client disconnect mid-stream)
- Orphan cleanup test (AI validation failure → project deleted)
- Keyword conflict test: pre-existing flow with the requested keyword causes `409 keyword_conflict` before any project is created

**Not in scope**: edit, publish, or customer-facing docs. Docs come in Phase 4.

**Risk**: Medium. Touches generate-flow.ts (shared with the internal UI path) — regression risk. Mitigation: the `context` parameter defaults to frontend behavior, so the internal path sees no behavioral change.

**Definition of done**:
- `POST /v1/agent/flows` creates a flow end-to-end against a real Freestand docker environment
- Test URL actually opens WhatsApp with the trigger keyword
- Orphan cleanup runs on validation failure
- Abort mid-stream cleans up cleanly
- Internal `/api/ai/flow-assistant` path still works identically for UI users
- All tests pass

### Phase 3 — Edit + Publish

**Goal**: Complete the CRUD surface. Edit creates unpublished versions, publish is a separate tool.

**Deliverables**:
- `lib/agent-api/flow-loader.ts` — loads project + latest published version for the edit context
- `app/api/v1/agent/flows/[flow_id]/edit/route.ts` — `POST` handler (edit with SSE)
- `app/api/v1/agent/flows/[flow_id]/publish/route.ts` — `POST` handler (publish, JSON)
- `lib/ai/tools/generate-flow-edit.ts` — add `toolFilter` option; agent path whitelists 4 of the 8 tools
- Idempotent publish logic (`already_published: true` handling)
- Unit tests for flow-loader, toolFilter, idempotent publish
- Integration tests for the full edit → publish cycle

**Not in scope**: customer-facing docs.

**Risk**: Medium. Adds the `toolFilter` option to `generate-flow-edit.ts` which is also a shared file. Same mitigation — default preserves UI behavior.

**Definition of done**:
- `POST /v1/agent/flows/{id}/edit` modifies a real flow and leaves it unpublished
- `POST /v1/agent/flows/{id}/publish` promotes the new version to live and updates the runtime
- Calling publish twice in a row returns `already_published: true` on the second call
- UI users' internal edit flow still works identically
- All tests pass

### Phase 4 — OpenAPI spec + customer-facing docs

**Goal**: Make the REST+SSE API self-serve for customer integrations. No SDK, no package. Just great docs and a generated OpenAPI spec.

**Deliverables**:
- OpenAPI 3.1 spec for the five agent endpoints (auto-generated from Zod schemas + route handlers, served at `/api/v1/agent/openapi.json`)
- Integration guide finalized and published (already drafted as `2026-04-15-flow-assistant-agent-api-integration.md`)
- Copy-paste example code in the guide for:
  - Vercel AI SDK (TypeScript) — tool definition + execute function with SSE parsing
  - OpenAI SDK (TypeScript + Python) — function calling with REST/SSE
  - Anthropic SDK (TypeScript + Python) — tool use with REST/SSE
  - Raw curl / httpx / fetch — for anyone on a language without a ready-made SDK
- Five tool schemas as JSON literals in the guide, ready to paste into any tool-calling agent
- System prompt fragment as a string literal in the guide
- Error code table with every code, description, payload fields, and recommended handling
- Docs page published at the Freestand docs site (or equivalent)

**Not in scope**: any change to the REST API — that's frozen at end of Phase 3. No SDK. No NPM package. No language-specific client library.

**Risk**: Very low. Docs-only. No code touches runtime behavior.

**Definition of done**:
- OpenAPI spec validates against the OpenAPI 3.1 schema
- `openapi-typescript` successfully generates a TS client from the spec (verifies it's machine-readable)
- A test integration (Vercel AI SDK in TypeScript + OpenAI SDK in Python) runs end-to-end against a real Freestand environment using only the docs — no Freestand engineer help
- Docs published at the documented URL
- The integration guide's FAQ has been pressure-tested by reading it fresh and checking every code snippet compiles / runs

## Rough scope / LOC

From the brainstorm LOC estimate, updated for the four-phase split:

| Phase | Files touched | Rough LOC |
|---|---|---|
| 1 — Scaffolding + read | 8 new + 0 modified | ~750 |
| 2 — Create flow | 5 new + 2 modified | ~650 |
| 3 — Edit + Publish | 3 new + 1 modified | ~500 |
| 4 — OpenAPI + docs | 1 OpenAPI generator + doc revisions | ~200 |
| **Total** | **~17 files, ~2100 LOC** | |

±30%. Dominated by glue layer + tests, not by novel logic. Phase 4 is tiny because dropping the NPM package removed ~700 LOC of client-side plumbing that customers now write themselves in whichever language they use.

## Open questions (to resolve before or during implementation, not blocking this spec)

1. **Multi-channel generalization**: v1 is WhatsApp-only because `GET /api/accounts` returns only `WhatsAppAccount` rows. To support Instagram / Line / Web, `getActingAccount` would need to query `GET /api/instagram-accounts` and similar per-platform endpoints and union the results. `connected_channels` then becomes meaningful instead of being hardcoded. `test_url` construction also becomes platform-specific (Instagram DM deep link, etc.). Flagged as the single biggest piece of deferred work — revisit when customers need non-WhatsApp channels.
2. **PII redaction in instruction logs**: should we store instructions in server logs at all? If yes, for how long? Decide before GA.
3. **Per-key rate limit overrides**: for now, hardcoded limits. Adding per-customer tuning is a 1-line config lookup later.
4. **Telemetry / observability**: we should at minimum log (a) every agent API call with latency, error code, and API key ID, (b) AI generation cost per call so we can attribute Anthropic spend to customers. Rough tracking in Phase 2, production-grade in a follow-up.
5. **WA Flow node support via agent API**: currently excluded. If the AI generates a flow that includes a WhatsApp Flow node, the publish will fail because the node references a Meta Flow that doesn't exist. We need to either filter out WA Flow nodes in the agent generation path or build a companion WA Flow subagent (which is Phase C of the AI platform plan — out of scope for this project).
6. **OpenAPI generation approach**: `zod-to-openapi` inside Next.js, or a separate static generator? Both work. Decide during Phase 4.

## Implementation plan

To be written after this spec is approved, using the `superpowers:writing-plans` skill. Each of the four phases gets its own executable plan document with task-level decomposition.
