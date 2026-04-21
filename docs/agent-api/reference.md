# API Reference

Auth on every endpoint: `X-API-Key: whm_...` header.

## GET /api/v1/agent/flows

Find/list flows for the authenticated org.

**Query params:**
- `query` (optional) — case-insensitive substring match on flow name + trigger_keywords, applied server-side. Empty/whitespace values are ignored.
- `limit` (optional) — 1-50, default 10

**Response (200):**
```json
{
  "flows": [
    {
      "flow_id": "uuid",
      "name": "Product Inquiry",
      "trigger_keyword": "product",
      "node_count": 4,
      "current_version": 2,
      "platform_url": "https://your-app/flow/uuid",
      "test_url": "https://wa.me/1234567890?text=product",
      "created_at": "2026-04-16T09:00:00Z",
      "updated_at": "2026-04-16T09:00:00Z"
    }
  ],
  "total": 1
}
```

**Rate limit:** 120/min per key.

---

## POST /api/v1/agent/flows

Create a new flow from natural language and publish it immediately. Returns SSE stream.

**Request body:**
```json
{
  "name": "Product Inquiry",
  "instruction": "ask what product the user wants, ask their email, say thanks",
  "channel": "whatsapp",
  "trigger_keyword": "product"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Flow name (1-100 chars) |
| `instruction` | string | yes | What the flow should do (1-4000 chars) |
| `channel` | string | yes | `"whatsapp"` (instagram/web coming later) |
| `trigger_keyword` | string | yes | Keyword to trigger the flow (1-50 chars) |

**Pre-stream errors** (returned as JSON, not SSE):

| HTTP | Code | When |
|---|---|---|
| 400 | `invalid_param` | Missing or invalid fields |
| 400 | `channel_not_connected` | Channel not configured. Payload: `connected_channels` |
| 401 | `unauthorized` | Missing or bad API key |
| 409 | `keyword_conflict` | Trigger keyword already used. Payload: `existing_flow` with id/name/url |
| 429 | `rate_limited` | Too many calls. Payload: `retry_after_seconds` |

**Success response — SSE stream (`text/event-stream`):**

Three event types: `progress`, `result`, `error`.

```
event: progress
data: {"phase":"understanding","message":"Analyzing your request"}

event: progress
data: {"phase":"planning","message":"Building flow plan"}

event: progress
data: {"phase":"generating","message":"Built 3 nodes, 3 edges — valid"}

event: progress
data: {"phase":"saving","message":"Saving flow version"}

event: progress
data: {"phase":"publishing","message":"Deploying to runtime"}

event: result
data: {
  "flow_id": "uuid",
  "version": 2,
  "name": "Product Inquiry",
  "summary": "Created a 3-node flow that...",
  "node_count": 4,
  "platform_url": "https://your-app/flow/uuid",
  "test_url": "https://wa.me/1234567890?text=product",
  "trigger_keyword": "product",
  "created_at": "2026-04-16T09:00:00Z"
}
```

**In-stream errors** (HTTP status is still 200, error comes through the stream):

```
event: error
data: {"code":"validation_failed","message":"AI produced an invalid flow"}
```

| Code | When |
|---|---|
| `validation_failed` | AI output failed structural validation |
| `invalid_instruction` | AI couldn't build a flow from the instruction |
| `publish_failed` | Runtime deploy failed (retryable) |
| `internal_error` | Catch-all |

**Rate limit:** 10/min per key.

---

## POST /api/v1/agent/flows/{flow_id}/edit

Edit an existing flow from natural language. Does NOT publish — call the publish endpoint when ready. Returns SSE stream.

**Request body:**
```json
{
  "instruction": "also ask for their phone number before saying thanks"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `instruction` | string | yes | What to change (1-4000 chars) |

**Pre-stream errors** (returned as JSON, not SSE):

| HTTP | Code | When |
|---|---|---|
| 400 | `invalid_param` | Missing or invalid `instruction` |
| 401 | `unauthorized` | Missing or bad API key |
| 404 | `flow_not_found` | No flow with that `flow_id` in your org |
| 429 | `rate_limited` | Too many calls. Payload: `retry_after_seconds` |

**Success response — SSE stream (`text/event-stream`):**

Three event types: `progress`, `result`, `error`.

```
event: progress
data: {"phase":"understanding","message":"Analyzing your instruction"}

event: progress
data: {"phase":"editing","message":"Applying changes to the flow"}

event: progress
data: {"phase":"validating","message":"Validating updated flow structure"}

event: progress
data: {"phase":"saving","message":"Saving new draft version"}

event: result
data: {
  "flow_id": "uuid",
  "version": 3,
  "published": false,
  "name": "Product Inquiry",
  "summary": "Added a phone number question before the thank-you message",
  "changes": [
    {"type": "node_add", "node_id": "plan-question-3-k9m2", "description": "Added whatsappQuestion: What's your phone number?"},
    {"type": "node_update", "node_id": "plan-message-4-r1s5", "description": "Updated whatsappMessage: Thank you!"}
  ],
  "node_count": 5,
  "platform_url": "https://your-app/flow/uuid",
  "next_action": "Call /publish to make this live",
  "updated_at": "2026-04-16T09:00:00Z"
}
```

**In-stream errors** (HTTP status is still 200, error comes through the stream):

```
event: error
data: {"code":"validation_failed","message":"AI produced an invalid flow"}
```

| Code | When |
|---|---|
| `validation_failed` | AI output failed structural validation |
| `invalid_instruction` | AI couldn't apply the edit from the instruction |
| `internal_error` | Catch-all |

**Rate limit:** 10/min per key.

---

## POST /api/v1/agent/flows/{flow_id}/publish

Publish the latest draft version of a flow to make it live on WhatsApp. This is idempotent — if the latest version is already published, it returns `already_published: true` rather than an error.

**Request body:** `{}` (empty object)

**Response (200):**
```json
{
  "flow_id": "uuid",
  "version": 3,
  "published": true,
  "already_published": false,
  "published_at": "2026-04-16T09:05:00Z",
  "test_url": "https://wa.me/1234567890?text=product",
  "trigger_keyword": "product",
  "platform_url": "https://your-app/flow/uuid"
}
```

If the latest version is already live, the response is the same shape with `already_published: true` — this is not an error, safe to retry.

**Errors:**

| HTTP | Code | When |
|---|---|---|
| 401 | `unauthorized` | Missing or bad API key |
| 404 | `flow_not_found` | No flow with that `flow_id` in your org |
| 502 | `publish_failed` | Runtime deploy failed (retryable) |

**Rate limit:** 30/min per key.

---

## Error response shape

All errors (both HTTP and SSE) use this shape:

```json
{
  "code": "keyword_conflict",
  "message": "Trigger keyword 'product' is already in use",
  "existing_flow": { "id": "...", "name": "...", "platform_url": "..." }
}
```

The `code` is stable — build your error handling against it. Extra fields (like `existing_flow`, `connected_channels`, `retry_after_seconds`) depend on the error code.

---

## SSE transport details

- `Content-Type: text/event-stream`
- Heartbeat: `: ping` comment every 15s to keep proxies alive
- Stream always terminates with exactly one `event: result` or `event: error`
- Connection closes after the terminal event
- Typical wall time: 10-25 seconds for a 3-8 node flow
