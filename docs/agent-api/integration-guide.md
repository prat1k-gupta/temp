# Freestand Agent API — Integration Guide

Everything you need to integrate Freestand's flow builder into your AI agent. One API key, four endpoints, one system prompt fragment.

---

## Setup

1. Go to **Settings > API Keys > General** in Freestand
2. Click **Create Key**, copy the `whm_...` value
3. Set it as an env var: `FREESTAND_API_KEY=whm_...`

Auth header on every request: `X-API-Key: whm_...`

Base URL: your Freestand deployment (e.g. `https://app.freestand.xyz`)

---

## Endpoints

### 1. Find flows — `GET /api/v1/agent/flows`

```
GET /api/v1/agent/flows?limit=10
X-API-Key: whm_...
```

**Response** `200`:
```json
{
  "flows": [
    {
      "flow_id": "uuid",
      "name": "Product Inquiry",
      "trigger_keyword": "product",
      "node_count": 4,
      "current_version": 2,
      "platform_url": "https://app.freestand.xyz/flow/uuid",
      "test_url": "https://wa.me/1234567890?text=product",
      "created_at": "2026-04-16T09:00:00Z",
      "updated_at": "2026-04-16T09:00:00Z"
    }
  ],
  "total": 1
}
```

Rate limit: 120/min.

---

### 2. Create flow — `POST /api/v1/agent/flows`

Creates a flow from natural language and publishes it immediately. **SSE streaming.**

```
POST /api/v1/agent/flows
X-API-Key: whm_...
Content-Type: application/json
Accept: text/event-stream
```

**Request:**
```json
{
  "name": "Product Inquiry",
  "instruction": "ask what product the user wants, ask their email, say thanks",
  "channel": "whatsapp",
  "trigger_keyword": "product"
}
```

| Field | Type | Required |
|---|---|---|
| `name` | string (1-100) | yes |
| `instruction` | string (1-4000) | yes |
| `channel` | `"whatsapp"` | yes |
| `trigger_keyword` | string (1-50) | yes |

**SSE stream:**
```
event: progress
data: {"phase":"understanding","message":"Analyzing your request"}

event: progress
data: {"phase":"generating","message":"Built 3 nodes, 3 edges — valid"}

event: progress
data: {"phase":"publishing","message":"Deploying to runtime"}

event: result
data: {"flow_id":"uuid","version":2,"name":"Product Inquiry","summary":"Created a 3-node flow...","node_count":4,"platform_url":"https://app.freestand.xyz/flow/uuid","test_url":"https://wa.me/1234567890?text=product","trigger_keyword":"product","created_at":"2026-04-16T09:00:00Z"}
```

Rate limit: 10/min.

---

### 3. Edit flow — `POST /api/v1/agent/flows/{flow_id}/edit`

Edits an existing flow. Saves as **draft only** — does NOT publish. **SSE streaming.**

```
POST /api/v1/agent/flows/{flow_id}/edit
X-API-Key: whm_...
Content-Type: application/json
Accept: text/event-stream
```

**Request:**
```json
{
  "instruction": "also ask for their phone number before saying thanks"
}
```

**SSE stream:**
```
event: progress
data: {"phase":"editing","message":"Applying changes to the flow"}

event: result
data: {"flow_id":"uuid","version":3,"published":false,"name":"Product Inquiry","summary":"Added a phone number question","changes":[{"type":"node_add","description":"Added question: Phone Number"}],"node_count":5,"platform_url":"https://app.freestand.xyz/flow/uuid","next_action":"Call /publish to make this live","updated_at":"2026-04-16T09:02:00Z"}
```

Rate limit: 10/min.

---

### 4. Publish flow — `POST /api/v1/agent/flows/{flow_id}/publish`

Publishes the latest draft. Idempotent — safe to retry. **JSON (not SSE).**

```
POST /api/v1/agent/flows/{flow_id}/publish
X-API-Key: whm_...
Content-Type: application/json

{}
```

**Response** `200`:
```json
{
  "flow_id": "uuid",
  "version": 3,
  "published": true,
  "already_published": false,
  "published_at": "2026-04-16T09:05:00Z",
  "test_url": "https://wa.me/1234567890?text=product",
  "trigger_keyword": "product",
  "platform_url": "https://app.freestand.xyz/flow/uuid"
}
```

Rate limit: 30/min.

---

## Errors

All errors use this shape (both HTTP responses and SSE `event: error`):

```json
{
  "code": "keyword_conflict",
  "message": "Trigger keyword 'product' is already in use",
  "existing_flow": {"id": "...", "name": "...", "platform_url": "..."}
}
```

| Code | HTTP | When |
|---|---|---|
| `unauthorized` | 401 | Bad or missing API key |
| `invalid_param` | 400 | Missing or invalid fields |
| `channel_not_connected` | 400 | Channel not configured (payload: `connected_channels`) |
| `keyword_conflict` | 409 | Trigger keyword in use (payload: `existing_flow`) |
| `flow_not_found` | 404 | No flow with that ID |
| `rate_limited` | 429 | Too many calls (payload: `retry_after_seconds`) |
| `validation_failed` | in-stream | AI output invalid |
| `invalid_instruction` | in-stream | AI couldn't build/edit the flow |
| `publish_failed` | 502 | Runtime deploy failed (retryable) |

---

## Agent integration

### Tool definitions (Vercel AI SDK / TypeScript)

```typescript
import { tool } from "ai"
import { z } from "zod"

const BASE = process.env.FREESTAND_URL!
const KEY = process.env.FREESTAND_API_KEY!

// --- SSE helper ---
async function sse(path: string, body: object, onProgress?: (e: any) => void) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "X-API-Key": KEY, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ code: "http_error", message: res.statusText }))
    throw Object.assign(new Error(err.message), err)
  }
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buf = "", result: any = null
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    for (const block of buf.split("\n\n").slice(0, -1)) {
      buf = buf.slice(block.length + 2)
      if (!block.trim() || block.startsWith(":")) continue
      const evt = block.match(/^event: (\w+)/m)?.[1]
      const data = block.match(/^data: (.+)$/m)?.[1]
      if (!evt || !data) continue
      const payload = JSON.parse(data)
      if (evt === "progress") onProgress?.(payload)
      if (evt === "result") result = payload
      if (evt === "error") throw Object.assign(new Error(payload.message), payload)
    }
  }
  if (!result) throw new Error("Stream ended without result")
  return result
}

async function json(path: string, method = "GET", body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ code: "http_error", message: res.statusText }))
    throw Object.assign(new Error(err.message), err)
  }
  return res.json()
}

// --- Tools ---
export const freestandTools = {
  freestand_find_flow: tool({
    description: "Find existing Freestand flows. Returns up to 50 recent flows with names, trigger keywords, and IDs.",
    parameters: z.object({}),
    execute: () => json("/api/v1/agent/flows?limit=50"),
  }),

  freestand_create_flow: tool({
    description: "Create a new WhatsApp chatbot flow and publish it immediately. Collect name, instruction, and trigger_keyword first.",
    parameters: z.object({
      name: z.string().describe("Short flow name"),
      instruction: z.string().describe("What the flow should do"),
      channel: z.enum(["whatsapp"]),
      trigger_keyword: z.string().describe("Keyword users type to start the flow"),
    }),
    execute: (args) => sse("/api/v1/agent/flows", args),
  }),

  freestand_edit_flow: tool({
    description: "Edit an existing flow. Returns a draft — NOT live until you call freestand_publish_flow. Always show the changes to the user first.",
    parameters: z.object({
      flow_id: z.string().describe("Flow ID from a previous create or find result"),
      instruction: z.string().describe("What to change"),
    }),
    execute: ({ flow_id, instruction }) => sse(`/api/v1/agent/flows/${flow_id}/edit`, { instruction }),
  }),

  freestand_publish_flow: tool({
    description: "Publish the latest draft of a flow to make it live. Call AFTER freestand_edit_flow and AFTER the user confirms.",
    parameters: z.object({
      flow_id: z.string().describe("Flow ID to publish"),
    }),
    execute: ({ flow_id }) => json(`/api/v1/agent/flows/${flow_id}/publish`, "POST", {}),
  }),
}
```

### Wire into your agent

```typescript
import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { freestandTools } from "./freestand-tools"

const result = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  tools: freestandTools,
  system: YOUR_SYSTEM_PROMPT + "\n\n" + FREESTAND_PROMPT_FRAGMENT,
  prompt: userMessage,
  maxSteps: 10,
})
```

### Python (httpx)

```python
import os, json, httpx

BASE = os.environ["FREESTAND_URL"]
KEY = os.environ["FREESTAND_API_KEY"]
HEADERS = {"X-API-Key": KEY, "Content-Type": "application/json"}

def find_flows():
    r = httpx.get(f"{BASE}/api/v1/agent/flows", headers=HEADERS)
    return r.json()

def create_flow(name, instruction, trigger_keyword):
    return _sse("/api/v1/agent/flows", {
        "name": name, "instruction": instruction,
        "channel": "whatsapp", "trigger_keyword": trigger_keyword,
    })

def edit_flow(flow_id, instruction):
    return _sse(f"/api/v1/agent/flows/{flow_id}/edit", {"instruction": instruction})

def publish_flow(flow_id):
    r = httpx.post(f"{BASE}/api/v1/agent/flows/{flow_id}/publish", headers=HEADERS, json={})
    return r.json()

def _sse(path, body):
    result = None
    with httpx.stream("POST", f"{BASE}{path}", headers={**HEADERS, "Accept": "text/event-stream"}, json=body, timeout=120) as r:
        buf = ""
        for chunk in r.iter_text():
            buf += chunk
            while "\n\n" in buf:
                block, buf = buf.split("\n\n", 1)
                if not block.strip() or block.startswith(":"): continue
                evt = next((l[7:] for l in block.split("\n") if l.startswith("event: ")), None)
                data = next((l[6:] for l in block.split("\n") if l.startswith("data: ")), None)
                if not evt or not data: continue
                payload = json.loads(data)
                if evt == "progress": print(f"[{payload['phase']}] {payload['message']}")
                elif evt == "result": result = payload
                elif evt == "error": raise Exception(f"{payload['code']}: {payload['message']}")
    return result
```

---

## System prompt fragment

Paste this into your agent's system prompt (~350 tokens):

```
## Freestand Flow Tools

You have tools for building and managing Freestand chatbot flows: freestand_find_flow, freestand_create_flow, freestand_edit_flow, freestand_publish_flow.

Freestand currently supports WhatsApp only. The channel is always "whatsapp".

### Building a new flow
When the user asks to build a new flow:
1. Collect: (a) a short name, (b) what the flow should do, (c) a trigger keyword.
2. Call freestand_create_flow. It publishes automatically. Share the test_url.
3. Remember the flow_id for future edits.

### Finding flows
Call freestand_find_flow when the user asks about existing flows or when you need a flow_id you don't have.

### Editing
1. Get the flow_id (from a prior create, or call freestand_find_flow).
2. Call freestand_edit_flow — this saves a DRAFT, not live yet.
3. Show the user the summary + changes. Ask: "Want me to publish this?"
4. Only call freestand_publish_flow after user confirms.

### Errors
- keyword_conflict → suggest a different keyword or offer to edit the existing flow
- invalid_instruction → ask the user for more detail
- flow_not_found → call freestand_find_flow to get the correct ID

### Don'ts
- Don't invent flow_ids — always from a tool result
- Don't auto-publish edits — always ask first
- Channel is always "whatsapp" — don't ask
```

---

## Example conversation

```
User: Build me a lead capture flow for my new iPhone launch

Agent: I'll create that! What keyword should customers type to start?

User: iphone16

Agent: [calls freestand_create_flow with name="iPhone 16 Lead Capture",
        instruction="ask for name, email, and which iPhone model they want,
        then say thanks we'll be in touch", trigger_keyword="iphone16"]

       Done! Your flow is live:
       → Test it: https://wa.me/1234567890?text=iphone16
       → Edit in UI: https://app.freestand.xyz/flow/abc123

User: Can you also ask for their city?

Agent: [calls freestand_edit_flow with flow_id="abc123",
        instruction="add a question asking for their city after the email step"]

       I've drafted these changes:
       - Added question: "What city are you in?"
       - Inserted after the email step, before the thank-you message

       Want me to publish this?

User: Yes

Agent: [calls freestand_publish_flow with flow_id="abc123"]

       Published! The updated flow is live. Same test link works:
       https://wa.me/1234567890?text=iphone16
```
