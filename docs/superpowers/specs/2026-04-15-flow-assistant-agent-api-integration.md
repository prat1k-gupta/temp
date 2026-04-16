# Freestand Flow Assistant — Agent API Integration Guide

**For**: developers integrating Freestand's flow builder as a tool inside their own AI agent.
**Companion**: this is the customer-facing HOWTO. The implementation spec is `2026-04-15-flow-assistant-agent-api-design.md`.

## What you get

Five REST tools that let your AI agent build, edit, and publish Freestand chatbot flows on behalf of your users through natural-language conversation. A user asks your agent *"build a lead capture flow for my iPhone 11 launch"*, your agent calls the Freestand tools, and a working WhatsApp bot is live in 15-20 seconds.

You don't need to understand Freestand's node types, edge semantics, validation rules, or WhatsApp Cloud API. That's all handled inside the tool. You just pass a natural-language instruction.

## What this guide covers

1. [Prerequisites](#prerequisites)
2. [Quickstart — Vercel AI SDK](#quickstart--vercel-ai-sdk)
3. [The four tools](#the-four-tools)
4. [Integration examples](#integration-examples) — OpenAI, Anthropic, raw REST
5. [End-user UX patterns](#end-user-ux-patterns) — showing progress in your UI
6. [Error handling](#error-handling)
7. [Limits and constraints](#limits-and-constraints)
8. [FAQ](#faq)

---

## Prerequisites

Before integrating, you (the Freestand customer) need:

1. **A Freestand account with a connected WhatsApp Business number.** v1 only supports WhatsApp — Instagram and web channels land later. If you don't have WhatsApp set up yet, connect it in the MagicFlow dashboard under *Settings → Accounts*.
2. **An API key** — generate one at *Settings → API Keys → General → Create Key*. Copy the `whm_...` key immediately (it's only shown once). Store it as an environment variable in your agent's deployment.
3. **An AI agent you're already building** — this guide assumes you're using one of: Vercel AI SDK, OpenAI SDK, Anthropic SDK, or a custom tool-use loop. If you don't have an agent yet, start with the [Vercel AI SDK quickstart](https://sdk.vercel.ai) — it's the most ergonomic.

You do **not** need access to any Freestand code, repos, or credentials beyond your API key.

---

## Quickstart — Vercel AI SDK

There's no SDK or package to install. You wire the REST+SSE API into your existing agent with `fetch` and a ~30-line SSE reader. The pattern below is ready to copy into any TypeScript agent.

### 1. Write one helper that calls a streaming endpoint

```typescript
// freestand.ts — put this in your agent code
const FREESTAND_URL = "https://app.freestand.xyz"
const API_KEY = process.env.FREESTAND_API_KEY!

export type FreestandProgress = { phase: string; message: string; [k: string]: unknown }
export type FreestandResult = Record<string, unknown>

export async function callFreestandStreaming(
  path: string,
  body: Record<string, unknown>,
  onProgress?: (event: FreestandProgress) => void,
): Promise<FreestandResult> {
  const res = await fetch(`${FREESTAND_URL}${path}`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({ code: "http_error", message: res.statusText }))
    throw new Error(`${errBody.code}: ${errBody.message}`)
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  let result: FreestandResult | null = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const events = buffer.split("\n\n")
    buffer = events.pop() ?? ""
    for (const raw of events) {
      if (!raw.trim() || raw.startsWith(":")) continue // heartbeat
      const eventMatch = raw.match(/^event: (\w+)/m)
      const dataMatch = raw.match(/^data: (.+)$/m)
      if (!eventMatch || !dataMatch) continue
      const payload = JSON.parse(dataMatch[1])
      if (eventMatch[1] === "progress") onProgress?.(payload as FreestandProgress)
      if (eventMatch[1] === "result") result = payload
      if (eventMatch[1] === "error") throw Object.assign(new Error(payload.message), payload)
    }
  }

  if (!result) throw new Error("stream_ended_without_result")
  return result
}

export async function callFreestandJSON(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${FREESTAND_URL}${path}`, {
    ...init,
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ code: "http_error", message: res.statusText }))
    throw Object.assign(new Error(errBody.message), errBody)
  }
  return res.json()
}
```

That's the whole Freestand client. 70 lines of standard `fetch` + `ReadableStream`. No dependencies beyond what Node 18+ gives you out of the box.

### 2. Define four tools for your agent

Paste these into wherever your agent builds its tool list:

```typescript
import { tool } from "ai"
import { z } from "zod"
import { callFreestandStreaming, callFreestandJSON } from "./freestand"

export function createFreestandTools(onProgress?: (e: FreestandProgress) => void) {
  return {
    freestand_find_flow: tool({
      description: "Find an existing Freestand flow by name when you don't know its flow_id. Returns up to 50 recent flows. Your LLM picks the right match.",
      parameters: z.object({
        query: z.string().optional().describe("Hint to help ranking (optional)"),
      }),
      execute: async ({ query }) => {
        const qs = query ? `?query=${encodeURIComponent(query)}` : ""
        return callFreestandJSON(`/api/v1/agent/flows${qs}`)
      },
    }),

    freestand_create_flow: tool({
      description: "Build a new chatbot flow and publish it immediately. Collect instruction, channel, and trigger_keyword from the user BEFORE calling.",
      parameters: z.object({
        instruction: z.string().max(4000),
        channel: z.enum(["whatsapp", "instagram", "web"]),
        trigger_keyword: z.string().min(1).max(50),
      }),
      execute: (args) => callFreestandStreaming("/api/v1/agent/flows", args, onProgress),
    }),

    freestand_edit_flow: tool({
      description: "Edit an existing flow. Returns a DRAFT — the flow is NOT live until you call freestand_publish_flow. Always show the changes to the user and get confirmation first.",
      parameters: z.object({
        flow_id: z.string(),
        instruction: z.string().max(4000),
      }),
      execute: ({ flow_id, instruction }) =>
        callFreestandStreaming(`/api/v1/agent/flows/${flow_id}/edit`, { instruction }, onProgress),
    }),

    freestand_publish_flow: tool({
      description: "Publish the latest unpublished edits of a flow. Call after freestand_edit_flow once the user confirms.",
      parameters: z.object({
        flow_id: z.string(),
      }),
      execute: ({ flow_id }) =>
        callFreestandJSON(`/api/v1/agent/flows/${flow_id}/publish`, {
          method: "POST",
          body: JSON.stringify({}),
        }),
    }),
  }
}
```

### 3. Wire the tools into your agent

```typescript
import { generateText } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { createFreestandTools } from "./freestand-tools"

const tools = createFreestandTools((event) => {
  // Optional — stream progress to your end-user's UI
  // See "End-user UX patterns" below
  console.log(`[${event.phase}] ${event.message}`)
})

const result = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  tools,
  system: `${yourExistingSystemPrompt}\n\n${FREESTAND_SYSTEM_PROMPT_FRAGMENT}`,
  prompt: userMessage,
  maxSteps: 10,
})
```

`FREESTAND_SYSTEM_PROMPT_FRAGMENT` is the string below (see [System prompt fragment](#system-prompt-fragment)). Paste it into your system prompt or the LLM will invent tool arguments.

That's the whole integration: one helper file, one tools file, one import in your existing agent. ~150 lines total, yours to own and modify.

### Example conversation this enables

```
User: I want to build a chatbot that captures leads for my iPhone 11 launch next week

Agent: Great! I can build that for you. What keyword should customers type on
       WhatsApp to start the flow? Something short and memorable like "iphone11"
       works well.

User: Let's use "iphone11" as the keyword

Agent: [calls freestand_create_flow]
       [progress streams: "Analyzing your request" → "Building flow plan"
        → "Creating 6 nodes" → "Validating" → "Publishing"]
       
       Done! Your iPhone 11 lead capture flow is live.
       
       → Try it: https://wa.me/919876543210?text=iphone11
       → Edit: https://app.freestand.xyz/flow/mf_01HFR7X9...
       
       The flow collects the customer's name, city, and whether they currently
       own an iPhone. Existing iPhone users get routed to a human agent; new
       users get a waitlist confirmation.
       
       Would you like me to change anything?

User: Can you make the "what's your name" question more friendly?

Agent: [calls freestand_edit_flow with flow_id from the previous result]
       
       I updated the name question to "Hi there! 👋 What should I call you?" —
       friendlier tone with an emoji.
       
       This is saved as a draft (not live yet). Want me to publish it?

User: Yes please

Agent: [calls freestand_publish_flow]
       
       Published! The update is now live. Test it at the same link:
       https://wa.me/919876543210?text=iphone11
```

---

## The four tools

Full JSON schemas are in the OpenAPI spec at `/api/v1/agent/openapi.json`. Brief reference here:

### `freestand_find_flow`
Find a flow by name when you've lost the `flow_id` from context. Returns up to 50 recent flows with their names, trigger keywords, and IDs. Your LLM picks the right one by matching the user's description against the names.

**When to use**: when the user says *"edit my iphone flow"* in a new conversation where you don't already have a `flow_id` from an earlier tool call.

### `freestand_create_flow`
Builds a new flow from a natural-language instruction and publishes it immediately. **This is the one-shot happy path.**

Required params:
- `instruction` — what to build (string, ≤4000 chars)
- `channel` — `"whatsapp"` in v1
- `trigger_keyword` — the keyword customers will type to start the flow (1-50 chars, alphanumeric + `-` + `_`)

Returns: `flow_id`, `magic_flow_url`, `test_url`, `summary`, `node_count`.

**Your agent's job before calling this**: collect all three required params from the user. The tool treats missing params as errors — don't pass placeholders.

### `freestand_edit_flow`
Modify an existing flow. Returns proposed changes as a **draft** — the flow is NOT live until you call `freestand_publish_flow`.

Required params:
- `flow_id` — from an earlier `freestand_create_flow` or `freestand_find_flow` call
- `instruction` — what to change

Returns: `changes` array (a compact diff of what changed), `summary`, `version`, `next_action` (string hint to call publish).

**Your agent's job after calling this**: show the user the `changes` summary and ask for confirmation. Don't auto-publish.

### `freestand_publish_flow`
Publishes the latest unpublished edits of a flow. Call this after `freestand_edit_flow` once the user confirms. Returns `test_url` so they can verify.

Required params:
- `flow_id`

Returns: `published: true`, `test_url`, `version`.

Safe to retry. If there's nothing new to publish, returns `already_published: true` instead of an error.

---

## Integration examples

Copy-paste starting points for the three most common agent frameworks. The shared `callFreestandStreaming` / `callFreestandJSON` helpers from the [Quickstart](#quickstart--vercel-ai-sdk) are used in all of them.

### OpenAI SDK (function calling, TypeScript)

Define the tool schemas as plain JSON, handle the tool call loop yourself:

```typescript
import OpenAI from "openai"
import { callFreestandStreaming, callFreestandJSON } from "./freestand"

const client = new OpenAI()

const freestandTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "freestand_create_flow",
      description: "Build and publish a flow. Collect instruction, channel, and trigger_keyword from the user first.",
      parameters: {
        type: "object",
        properties: {
          instruction: { type: "string", maxLength: 4000 },
          channel: { type: "string", enum: ["whatsapp", "instagram", "web"] },
          trigger_keyword: { type: "string", minLength: 1, maxLength: 50 },
        },
        required: ["instruction", "channel", "trigger_keyword"],
      },
    },
  },
  // ... freestand_find_flow, freestand_edit_flow, freestand_publish_flow defined similarly
]

async function executeFreestandTool(name: string, args: Record<string, unknown>, onProgress?: (e: any) => void) {
  switch (name) {
    case "freestand_find_flow": {
      const qs = args.query ? `?query=${encodeURIComponent(String(args.query))}` : ""
      return callFreestandJSON(`/api/v1/agent/flows${qs}`)
    }
    case "freestand_create_flow":
      return callFreestandStreaming("/api/v1/agent/flows", args, onProgress)
    case "freestand_edit_flow":
      return callFreestandStreaming(`/api/v1/agent/flows/${args.flow_id}/edit`, { instruction: args.instruction }, onProgress)
    case "freestand_publish_flow":
      return callFreestandJSON(`/api/v1/agent/flows/${args.flow_id}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      })
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

// In your agent loop:
const response = await client.chat.completions.create({
  model: "gpt-4.1",
  messages: [
    { role: "system", content: yourSystemPrompt + "\n\n" + FREESTAND_SYSTEM_PROMPT_FRAGMENT },
    { role: "user", content: userMessage },
  ],
  tools: freestandTools,
})

for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  const args = JSON.parse(toolCall.function.arguments)
  const result = await executeFreestandTool(toolCall.function.name, args, (event) => {
    // stream to your UI
  })
  // Feed result back into the next turn as a tool_result message
}
```

### Anthropic SDK (native tool use, TypeScript)

```typescript
import Anthropic from "@anthropic-ai/sdk"
import { callFreestandStreaming, callFreestandJSON } from "./freestand"

const client = new Anthropic()

const freestandTools: Anthropic.Tool[] = [
  {
    name: "freestand_create_flow",
    description: "Build and publish a flow. Collect instruction, channel, and trigger_keyword from the user first.",
    input_schema: {
      type: "object",
      properties: {
        instruction: { type: "string" },
        channel: { type: "string", enum: ["whatsapp", "instagram", "web"] },
        trigger_keyword: { type: "string" },
      },
      required: ["instruction", "channel", "trigger_keyword"],
    },
  },
  // ... freestand_find_flow, freestand_edit_flow, freestand_publish_flow
]

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: yourSystemPrompt + "\n\n" + FREESTAND_SYSTEM_PROMPT_FRAGMENT,
  tools: freestandTools,
  messages: [{ role: "user", content: userMessage }],
})

// Anthropic tool-use loop: for each tool_use content block, call executeFreestandTool
// (same dispatch function as the OpenAI example above), then feed back as a tool_result.
```

### Python (OpenAI SDK + `httpx`)

For customers not on Node:

```python
import os
import json
import httpx
from openai import OpenAI

FREESTAND_URL = "https://app.freestand.xyz"
API_KEY = os.environ["FREESTAND_API_KEY"]

def call_freestand_streaming(path: str, body: dict, on_progress=None):
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    with httpx.stream("POST", f"{FREESTAND_URL}{path}", headers=headers, json=body, timeout=120) as r:
        r.raise_for_status()
        buffer = ""
        result = None
        for chunk in r.iter_text():
            buffer += chunk
            while "\n\n" in buffer:
                event, buffer = buffer.split("\n\n", 1)
                if not event.strip() or event.startswith(":"):
                    continue
                lines = event.split("\n")
                event_type = next((l[7:] for l in lines if l.startswith("event: ")), None)
                data_line = next((l[6:] for l in lines if l.startswith("data: ")), None)
                if not event_type or not data_line:
                    continue
                payload = json.loads(data_line)
                if event_type == "progress" and on_progress:
                    on_progress(payload)
                elif event_type == "result":
                    result = payload
                elif event_type == "error":
                    raise Exception(f"{payload['code']}: {payload['message']}")
        if result is None:
            raise Exception("stream_ended_without_result")
        return result

def call_freestand_json(path: str, method: str = "GET", body: dict = None):
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    r = httpx.request(method, f"{FREESTAND_URL}{path}", headers=headers, json=body)
    if r.status_code >= 400:
        err = r.json()
        raise Exception(f"{err.get('code', 'http_error')}: {err.get('message', r.text)}")
    return r.json()

# Tool definitions follow the standard OpenAI function-calling format.
# Dispatch tool_calls to the appropriate helper — same structure as the TypeScript example.
```

### Raw REST (any language)

If you're not on any of the supported SDKs, or you want a minimal reference, here are the raw HTTP calls. Every other example above builds on these.

**Create a flow** (SSE):
```bash
curl -N -X POST https://app.freestand.xyz/api/v1/agent/flows \
  -H "X-API-Key: whm_abcd1234..." \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "instruction": "build a lead capture flow for iphone 11",
    "channel": "whatsapp",
    "trigger_keyword": "iphone11"
  }'
```

Response is an event stream. Each event is one of:
```
event: progress
data: {"phase":"generating","message":"Creating 3 of 6 nodes"}

event: result
data: {"flow_id":"mf_01H...","version":2,"test_url":"https://wa.me/...","magic_flow_url":"...","summary":"..."}
```

Read the stream until you see `event: result` or `event: error`, then close the connection.

**Edit a flow** (SSE):
```bash
curl -N -X POST https://app.freestand.xyz/api/v1/agent/flows/mf_01H.../edit \
  -H "X-API-Key: whm_abcd1234..." \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"instruction": "make the welcome message friendlier"}'
```

Same SSE format. The final `event: result` contains `published: false` and a `changes` array.

**Publish a flow** (JSON, not streamed):
```bash
curl -X POST https://app.freestand.xyz/api/v1/agent/flows/mf_01H.../publish \
  -H "X-API-Key: whm_abcd1234..." \
  -H "Content-Type: application/json" \
  -d '{}'
```

Returns JSON with `test_url` and `published: true`.

**Find flows** (JSON):
```bash
curl https://app.freestand.xyz/api/v1/agent/flows?query=iphone \
  -H "X-API-Key: whm_abcd1234..."
```

Full REST reference is in the OpenAPI spec at `https://app.freestand.xyz/api/v1/agent/openapi.json`. You can generate typed clients for your language of choice (openapi-typescript, openapi-generator, openapi-python-client, etc.).

---

## End-user UX patterns

Your AI agent is running somewhere — a Slack bot, a web chat widget, a custom dashboard. When Freestand tools run, they take 10-20 seconds. Your end user shouldn't see a blank spinner. You have two patterns to choose from.

### Pattern A — Side-channel streaming (recommended)

You already have a stream/websocket/SSE channel to your end-user's UI. Pass an `onProgress` callback to `callFreestandStreaming` that pushes events into that channel. The LLM sees only the final result.

```typescript
const tools = createFreestandTools((event) => {
  // event = { phase: "generating", message: "Creating nodes", nodes_created: 2, nodes_total: 6 }
  yourWebSocket.send({
    type: "tool_progress",
    tool: "freestand_create_flow",
    phase: event.phase,
    message: event.message,
  })
})
```

The end user sees a live progress indicator in your UI ("Building 3 of 6 nodes…") while the LLM is blocked waiting for the tool. When the tool finishes, the LLM gets the final result and continues its response.

**When to use**: whenever you have any real-time UI channel to your end user. This is the right default for chat apps, dashboards, and anything with a frontend.

### Pattern B — Narrative-in-result

You don't have a side channel, or your LLM is running synchronously in a batch job. Collect progress events into a narrative string and include it in the tool result the LLM sees.

```typescript
function createFreestandToolsWithNarrative() {
  return {
    freestand_create_flow: tool({
      description: "...",
      parameters: z.object({ /* same as before */ }),
      execute: async (args) => {
        const progressLog: string[] = []
        const result = await callFreestandStreaming(
          "/api/v1/agent/flows",
          args,
          (event) => progressLog.push(`[${event.phase}] ${event.message}`),
        )
        return {
          ...result,
          progress_narrative: progressLog.join("\n"),
        }
      },
    }),
    // ... same for edit
  }
}
```

The LLM sees the narrative in the tool result alongside the final data and can relay it to the user. No real-time feedback, but no infrastructure needed either.

**When to use**: batch scripts, worker queues, terminal-only agents, anywhere without a UI connection to the end user.

---

## Error handling

Errors come back as JSON with a stable string `code` field. Your agent code checks the code in its catch block and handles it — or just re-throws to the LLM as a tool-result error and lets the LLM adapt based on the message.

Every error response has this shape:
```json
{
  "code": "keyword_conflict",
  "message": "Trigger keyword 'iphone11' is already in use",
  "...": "additional payload fields depending on the code"
}
```

HTTP pre-stream errors return the JSON directly. Mid-stream errors come as an SSE `event: error` with the same shape in `data`.

### Error codes reference

| Code | HTTP | Extra fields | What to do |
|---|---|---|---|
| `missing_required_param` | 400 | `param` | LLM violated schema. Shouldn't happen in production — fix your tool definitions. |
| `invalid_param` | 400 | `param` | Wrong enum value or type. Fix the LLM's arguments. |
| `invalid_instruction` | 400 | — | Too vague / empty / AI refused. Relay the `message` to the user; ask for more detail. |
| `invalid_trigger_keyword` | 400 | — | Keyword has spaces, special chars, or is too long. Normalize and retry. |
| `channel_not_connected` | 400 | `connected_channels` (array) | Tell the user which channels ARE available and ask them to pick one. |
| `keyword_conflict` | 409 | `existing_flow` (`{id, name, magic_flow_url}`) | Offer two options to the user: (a) pick a different keyword, (b) edit the existing flow using `existing_flow.id`. |
| `flow_not_found` | 404 | — | Your `flow_id` is wrong or belongs to another org. Fall back to `freestand_find_flow`. |
| `node_not_found` | 404 | — | During edit, the AI couldn't resolve a natural-language node reference. Ask the user to be more specific. |
| `unsupported_edit` | 400 | — | The edit is outside current capability. Relay to user. |
| `validation_failed` | 500 | `errors` (array of strings) | The AI produced a structurally invalid flow. Rare. Retry with a clearer instruction. |
| `no_account_configured` | 400 | — | Your org has 0 connected WhatsApp accounts. Connect one in the Freestand dashboard. |
| `publish_failed` | 502 | `upstream_error` | Runtime deploy to fs-whatsapp failed. Retry `publish_flow` — it's idempotent. |
| `unauthorized` | 401 | — | API key is missing, invalid, expired, or revoked. Check your env var. |
| `rate_limited` | 429 | `retry_after_seconds` | Wait and retry. |
| `internal_error` | 500 | — | Catch-all. Retryable after a brief backoff. Log the request ID from response headers. |

### Example catch pattern (TypeScript)

```typescript
try {
  await callFreestandStreaming("/api/v1/agent/flows", args, onProgress)
} catch (err: any) {
  if (err.code === "keyword_conflict") {
    // err.existing_flow = { id, name, magic_flow_url }
    // Option A: ask the user to pick a different keyword
    // Option B: offer to edit the existing flow instead
  } else if (err.code === "channel_not_connected") {
    // err.connected_channels = ["whatsapp"]
  } else if (err.code === "rate_limited") {
    await new Promise(r => setTimeout(r, err.retry_after_seconds * 1000))
    // retry
  } else {
    // Pass through to the LLM as a tool-result error
    throw err
  }
}
```

### What your system prompt should teach the LLM

See the [System prompt fragment](#system-prompt-fragment) section below for the exact text. In short:
- On `keyword_conflict`: tell the user which keyword conflicts and offer to either pick a new one or edit the existing flow
- On `channel_not_connected`: tell the user which channels ARE available and ask them to pick one
- On `invalid_instruction`: relay the AI's explanation and ask for more detail
- On `flow_not_found`: fall back to `freestand_find_flow` to recover

---

## System prompt fragment

Paste this exact text into your parent agent's system prompt (or concatenate it onto your existing prompt). The LLM reads this to understand when and how to use the five Freestand tools. Without it, the LLM will invent tool arguments and call tools out of order.

```
## Freestand Flow Tools

You have 4 tools for building and managing Freestand chatbot flows: freestand_find_flow, freestand_create_flow, freestand_edit_flow, freestand_publish_flow.

Freestand currently supports WhatsApp only. When the user asks to build a flow, the channel is always "whatsapp" — you don't need to ask.

### Building a new flow
When the user asks to build a new flow:
1. You need two things before calling freestand_create_flow: (a) the flow description, (b) the trigger keyword. Collect any that are missing. The channel is always "whatsapp".
2. Call freestand_create_flow with channel: "whatsapp" and the collected values. It publishes automatically. Tell the user the flow is live, share the test_url from the response so they can try it, and ask what they'd like to do next.
3. Remember the flow_id from the response — you'll need it if the user wants to edit this flow.

### Editing an existing flow
When the user asks to change a flow:
1. If you know the flow_id from an earlier create/edit call in this conversation, use it.
2. If you don't (e.g., the user says "edit my iphone flow" fresh), call freestand_find_flow and match by name.
3. Call freestand_edit_flow with the flow_id and the edit instruction. It returns a summary of changes as a DRAFT — the flow is NOT yet live.
4. Show the summary to the user. Paraphrase the changes array in plain language. Ask for confirmation: "Want me to publish this?"
5. If they confirm, call freestand_publish_flow. If they want to iterate, call freestand_edit_flow again — each call creates a new draft version.

### Handling errors
- keyword_conflict: the trigger keyword is already used. Tell the user and offer to (a) pick a different keyword, or (b) edit the existing flow instead (you have its ID from the error payload).
- channel_not_connected: the requested channel isn't configured. Tell the user which channels ARE connected and ask them to pick one.
- invalid_instruction: the description wasn't clear enough to build from. Ask the user for more detail.
- flow_not_found: the flow_id doesn't exist. Fall back to freestand_find_flow.

### What NOT to do
- Don't invent flow_ids. Always get them from a tool result.
- Don't call freestand_publish_flow without user confirmation after an edit.
- The channel is always "whatsapp" in v1 — don't ask the user.
- Don't batch multiple flow operations in one tool call. One create or one edit at a time.
```

Stored as a string in your code:

```typescript
export const FREESTAND_SYSTEM_PROMPT_FRAGMENT = `## Freestand Flow Tools
...
(paste the full block above)
`
```

```python
FREESTAND_SYSTEM_PROMPT_FRAGMENT = """## Freestand Flow Tools
...
"""
```

This fragment is ~350 tokens. It costs you that much context on every LLM call in exchange for correct tool usage. Worth it.

---

## Limits and constraints

### Payload limits
- `instruction` (create / edit): max 4000 characters
- `trigger_keyword`: 1-50 characters, must match `^[a-z0-9_-]+$` (lowercased server-side)
- Flow size: max 50 nodes per flow

### Rate limits (per API key)
- `create_flow` / `edit_flow`: 10 per minute
- `publish_flow`: 30 per minute
- `find_flow`: 120 per minute
- When exceeded, returns `429` with `retry_after_seconds` in the body

Limits are tunable — contact Freestand if your use case needs more.

### What the tool WILL do for you
- Generate structurally valid flows with correct node types, handles, variables, and branching
- Validate every flow before publishing
- Normalize trigger keywords (lowercase, trimmed)
- Reject invalid keywords with a clear error
- Preserve version history — every create and every edit is a new `MagicFlowVersion` row visible in the MagicFlow UI
- Surface AI reasoning errors back to the LLM with enough context to recover

### What the tool will NOT do for you
- Collect missing params from the user — your parent agent's system prompt must teach the LLM to collect `instruction`, `channel`, and `trigger_keyword` before calling create
- Cross-channel deployment — v1 is WhatsApp-only; Instagram / Line / Web support is tracked as future work
- Publish edits automatically — every edit returns a draft; you must explicitly call `publish_flow`
- Track flow_ids across conversations — your parent agent must remember the flow_id from earlier tool calls, or use `find_flow` to recover
- Manage WhatsApp message templates, Meta WA Flows (native forms), global variables, or any Phase C features — those require separate integrations not yet built

---

## FAQ

**Q: My LLM sometimes calls `create_flow` without collecting the trigger keyword first. How do I fix this?**

Your system prompt isn't being followed strictly enough. Three things to try: (1) make sure you're including `systemPromptFragment` in the system message, not the user message. (2) Move the Freestand instructions to the TOP of your system prompt, before your own content. (3) Use a capable model — the fragment assumes GPT-4.1, Claude Sonnet 4.6, or equivalent. Weaker models will skip tool-use instructions more often.

**Q: A flow I created via the API looks weird in the MagicFlow UI. Why?**

Every flow created via the agent API is visible and editable in the MagicFlow UI at the URL returned in `magic_flow_url`. If the visual layout looks off (overlapping nodes, weird spacing), open the flow and click *"Auto-layout"* in the toolbar — the AI-generated positioning is a best-effort rough layout, not pixel-perfect.

**Q: Can my end user edit the flow manually after my AI built it?**

Yes — the flow appears in the MagicFlow dashboard exactly as if a human had built it. Edits via the UI and edits via your API both write to the same version history. If a human edits while your agent is also editing, the last publish wins (race condition we accept in v1; see the design spec for details).

**Q: How do I roll back a bad edit?**

v1 doesn't expose rollback via the API. The user can roll back manually via the MagicFlow UI — open the flow, open *Version History*, click an earlier version, and publish it. Programmatic rollback is future work.

**Q: My conversation has been going for a while and the LLM is struggling to remember the `flow_id` from earlier. What should it do?**

This is the reason `freestand_find_flow` exists. Teach your LLM (via the system prompt fragment we ship) to fall back to `find_flow` whenever it's about to edit but doesn't have a `flow_id` in recent context. The fragment already says this — if it's not working, your model might be too weak or your prompt too crowded.

**Q: Is there a sandbox/test mode so I can build flows without publishing them live?**

Not in v1. Every `create_flow` publishes the flow immediately to your connected WhatsApp number. If you want to iterate without affecting real users, connect a **separate test account** (a WhatsApp sandbox number) to a separate Freestand org and use a key scoped to that org. The API is strictly scoped to one org per key.

**Q: What does my end user see during the 15-20 second flow generation?**

Whatever your UI renders. Use Pattern A (side-channel streaming) to push progress events from `onProgress` into your UI — you'll see events like `{phase: "generating", message: "Creating 3 of 6 nodes"}` fire 5-10 times over the lifetime of a single tool call. Typical UX is a progress bar or spinner with changing labels.

**Q: Can I deploy to multiple WhatsApp accounts from one agent?**

Not in v1. One API key is bound to one Freestand organization, and v1 assumes one account per org. If your agent needs to target multiple WhatsApp numbers (e.g., a SaaS platform building flows for many customers), you'd need to juggle multiple API keys — one per customer. This will be simplified when multi-account support ships.

**Q: I want to pass my own node structure, not a natural-language instruction. Can I?**

No. The agent API is intentionally natural-language-only. If you want to programmatically build flows with explicit node-by-node control, that's a different product surface — the raw flow JSON schema that the MagicFlow UI uses — and it isn't currently exposed for external use. Talk to Freestand if this is a hard requirement.

**Q: How do I authenticate from a server-side function where I can't store the API key in an env var?**

Treat the `whm_` key exactly like any other API secret — server-only, never in a browser, never in a git commit, never in a log line. If your deployment doesn't have secure env vars, fetch the key from a secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, Doppler, etc.) at function cold-start time.

---

## Support

- **Documentation**: `https://docs.freestand.xyz/agent-api`
- **GitHub issues**: file against the main Freestand repo with label `agent-api`
- **Feature requests**: contact your Freestand rep or file via the support portal
- **Security issues**: report privately to `security@freestand.xyz`
- **Status page**: `https://status.freestand.xyz`

---

## Changelog

- **2026-04-15** — v1.0 initial draft (spec approved, implementation pending)
