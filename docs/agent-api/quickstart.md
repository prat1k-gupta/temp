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
      "magic_flow_url": "https://your-freestand-url/flow/..."
    }
  ],
  "total": 1
}
```

## 4. Wire it into your AI agent

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
}
```

### Python (httpx)

```python
import os
import json
import httpx

FREESTAND_URL = "https://your-freestand-url"
API_KEY = os.environ["FREESTAND_API_KEY"]

def create_flow(name, instruction, trigger_keyword, channel="whatsapp"):
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    body = {
        "name": name,
        "instruction": instruction,
        "channel": channel,
        "trigger_keyword": trigger_keyword,
    }
    result = None
    with httpx.stream("POST", f"{FREESTAND_URL}/api/v1/agent/flows",
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

# Usage
flow = create_flow(
    name="Product Inquiry",
    instruction="ask what product they want, ask email, say thanks",
    trigger_keyword="product"
)
print(f"Test URL: {flow['test_url']}")
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
```
