# Quickstart

Create a working WhatsApp chatbot flow in one API call.

## 1. Get your API key

Go to **Settings > API Keys > General** in the MagicFlow dashboard, click **Create Key**, copy the `whm_...` value.

```bash
export FREESTAND_API_KEY="whm_your_key_here"
```

## 2. Create a flow

```bash
curl -N -X POST https://your-freestand-url/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "name": "Product Inquiry",
    "instruction": "ask what product the user wants info about, ask their email, then say thanks we will get back within 24 hours",
    "channel": "whatsapp",
    "trigger_keyword": "product"
  }'
```

You'll see SSE events stream back:

```
event: progress
data: {"phase":"understanding","message":"Analyzing your request"}

event: progress
data: {"phase":"planning","message":"Building flow plan"}

event: progress
data: {"phase":"generating","message":"Built 3 nodes, 3 edges — valid"}

event: progress
data: {"phase":"publishing","message":"Deploying to runtime"}

event: result
data: {"flow_id":"...","version":2,"name":"Product Inquiry","test_url":"https://wa.me/1234567890?text=product",...}
```

Click the `test_url` on your phone to try the flow on WhatsApp.

## 3. List your flows

```bash
curl https://your-freestand-url/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_API_KEY"
```

Returns:
```json
{
  "flows": [
    {
      "flow_id": "...",
      "name": "Product Inquiry",
      "trigger_keyword": "product",
      "node_count": 4,
      "test_url": "https://wa.me/1234567890?text=product",
      "platform_url": "https://your-freestand-url/flow/..."
    }
  ],
  "total": 1
}
```

## 4. Edit a flow

Once you have a `flow_id`, you can edit the flow with a natural language instruction. Edit saves a new draft but does NOT publish it — the current live version stays untouched until you explicitly publish.

```bash
curl -N -X POST https://your-freestand-url/api/v1/agent/flows/{flow_id}/edit \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "instruction": "also ask for their phone number before saying thanks"
  }'
```

You'll see SSE events stream back — same format as create:

```
event: progress
data: {"phase":"understanding","message":"Analyzing your instruction"}

event: progress
data: {"phase":"editing","message":"Applying changes to the flow"}

event: progress
data: {"phase":"saving","message":"Saving new draft version"}

event: result
data: {"flow_id":"...","version":3,"published":false,"summary":"Added phone number step","next_action":"Call /publish to make this live",...}
```

The result includes `published: false` — the edit is saved as a draft. The live flow is unchanged.

## 5. Publish the edit

```bash
curl -X POST https://your-freestand-url/api/v1/agent/flows/{flow_id}/publish \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Returns:

```json
{
  "flow_id": "...",
  "version": 3,
  "published": true,
  "already_published": false,
  "published_at": "2026-04-16T09:05:00Z",
  "test_url": "https://wa.me/1234567890?text=product",
  "trigger_keyword": "product",
  "platform_url": "https://your-freestand-url/flow/..."
}
```

This endpoint is idempotent — calling it again when the latest version is already live returns `already_published: true`, not an error.

## 6. Wire it into your AI agent

### Vercel AI SDK (TypeScript)

```typescript
import { tool } from "ai"
import { z } from "zod"

const FREESTAND_URL = "https://your-freestand-url"
const API_KEY = process.env.FREESTAND_API_KEY!

// SSE streaming helper
async function callFreestandSSE(
  path: string,
  body: Record<string, unknown>,
  onProgress?: (event: { phase: string; message: string }) => void,
) {
  const res = await fetch(`${FREESTAND_URL}${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  })

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let result: any = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""
    for (const raw of events) {
      if (!raw.trim() || raw.startsWith(":")) continue
      const eventMatch = raw.match(/^event: (\w+)/m)
      const dataMatch = raw.match(/^data: (.+)$/m)
      if (!eventMatch || !dataMatch) continue
      const payload = JSON.parse(dataMatch[1])
      if (eventMatch[1] === "progress") onProgress?.(payload)
      if (eventMatch[1] === "result") result = payload
      if (eventMatch[1] === "error") throw Object.assign(new Error(payload.message), payload)
    }
  }
  if (!result) throw new Error("Stream ended without result")
  return result
}

async function callFreestandJSON(path: string) {
  const res = await fetch(`${FREESTAND_URL}${path}`, {
    headers: { "X-API-Key": API_KEY },
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

async function callFreestandJSONPost(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${FREESTAND_URL}${path}`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json()
}

// Define tools for your agent
const freestandTools = {
  freestand_find_flow: tool({
    description: "Find existing flows by name. Returns up to 50 recent flows.",
    parameters: z.object({}),
    execute: () => callFreestandJSON("/api/v1/agent/flows"),
  }),

  freestand_create_flow: tool({
    description: "Create a new WhatsApp chatbot flow and publish it. Collect name, instruction, and trigger_keyword from the user first.",
    parameters: z.object({
      name: z.string().describe("Short name for the flow (e.g. 'Product Inquiry')"),
      instruction: z.string().describe("Natural language description of what the flow should do"),
      channel: z.enum(["whatsapp"]).describe("Channel to deploy to"),
      trigger_keyword: z.string().describe("Keyword users type to start the flow"),
    }),
    execute: (args) => callFreestandSSE("/api/v1/agent/flows", args, (e) => {
      console.log(`[${e.phase}] ${e.message}`)
    }),
  }),

  freestand_edit_flow: tool({
    description: "Edit an existing flow using a natural language instruction. Saves a new draft but does NOT publish — call freestand_publish_flow separately after confirming the changes with the user.",
    parameters: z.object({
      flow_id: z.string().describe("ID of the flow to edit (from freestand_find_flow or freestand_create_flow)"),
      instruction: z.string().describe("What to change about the flow in natural language"),
    }),
    execute: ({ flow_id, instruction }) =>
      callFreestandSSE(`/api/v1/agent/flows/${flow_id}/edit`, { instruction }, (e) => {
        console.log(`[${e.phase}] ${e.message}`)
      }),
  }),

  freestand_publish_flow: tool({
    description: "Publish the latest draft version of a flow to make it live on WhatsApp. Safe to retry — returns already_published: true if already live.",
    parameters: z.object({
      flow_id: z.string().describe("ID of the flow to publish"),
    }),
    execute: ({ flow_id }) => callFreestandJSONPost(`/api/v1/agent/flows/${flow_id}/publish`),
  }),
}
```

### Python (httpx)

```python
import os
import json
import httpx

FREESTAND_URL = "https://your-freestand-url"
API_KEY = os.environ["FREESTAND_API_KEY"]

def call_freestand_sse(path, body):
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    result = None
    with httpx.stream("POST", f"{FREESTAND_URL}{path}",
                      headers=headers, json=body, timeout=120) as r:
        r.raise_for_status()
        buffer = ""
        for chunk in r.iter_text():
            buffer += chunk
            while "\n\n" in buffer:
                event, buffer = buffer.split("\n\n", 1)
                if not event.strip() or event.startswith(":"):
                    continue
                lines = event.split("\n")
                etype = next((l[7:] for l in lines if l.startswith("event: ")), None)
                data = next((l[6:] for l in lines if l.startswith("data: ")), None)
                if not etype or not data:
                    continue
                payload = json.loads(data)
                if etype == "progress":
                    print(f"[{payload['phase']}] {payload['message']}")
                elif etype == "result":
                    result = payload
                elif etype == "error":
                    raise Exception(f"{payload['code']}: {payload['message']}")
    return result

def create_flow(name, instruction, trigger_keyword, channel="whatsapp"):
    return call_freestand_sse("/api/v1/agent/flows", {
        "name": name,
        "instruction": instruction,
        "channel": channel,
        "trigger_keyword": trigger_keyword,
    })

def edit_flow(flow_id, instruction):
    return call_freestand_sse(f"/api/v1/agent/flows/{flow_id}/edit", {
        "instruction": instruction,
    })

def publish_flow(flow_id):
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    r = httpx.post(f"{FREESTAND_URL}/api/v1/agent/flows/{flow_id}/publish",
                   headers=headers, json={}, timeout=30)
    r.raise_for_status()
    return r.json()

# Usage
flow = create_flow(
    name="Product Inquiry",
    instruction="ask what product they want, ask email, say thanks",
    trigger_keyword="product"
)
print(f"Test URL: {flow['test_url']}")

# Edit then publish
draft = edit_flow(flow["flow_id"], "also ask for their phone number before saying thanks")
print(f"Draft saved: v{draft['version']} — {draft['summary']}")

result = publish_flow(flow["flow_id"])
print(f"Published v{result['version']} — {result['test_url']}")
```

### Raw curl

```bash
# Create (SSE streaming)
curl -N -X POST $FREESTAND_URL/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"name":"My Flow","instruction":"ask for name then say hello","channel":"whatsapp","trigger_keyword":"hello"}'

# List flows
curl $FREESTAND_URL/api/v1/agent/flows \
  -H "X-API-Key: $FREESTAND_API_KEY"

# Edit (SSE streaming)
curl -N -X POST $FREESTAND_URL/api/v1/agent/flows/{flow_id}/edit \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"instruction":"also ask for their phone number before saying thanks"}'

# Publish (JSON)
curl -X POST $FREESTAND_URL/api/v1/agent/flows/{flow_id}/publish \
  -H "X-API-Key: $FREESTAND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```
