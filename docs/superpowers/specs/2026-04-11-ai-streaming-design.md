# AI Streaming (Phase B) — Design

Replace blocking AI generation with streaming responses. Users see the AI's message text typing out and tool steps as they happen, instead of staring at a "Thinking..." spinner.

## Current Architecture

- **Create mode** (`generate-flow-create.ts`): `aiClient.generateJSON()` → `generateObject()`. Returns full `FlowPlan` JSON. Self-correction loop (up to 2 retries).
- **Edit mode** (`generate-flow-edit.ts`): `generateText()` with 5+ tools, `stopWhen: stepCountIs(12)`, `onStepFinish` callback for logging.
- **API route** (`app/api/ai/flow-assistant/route.ts`): Calls `generateFlow()`, awaits result, returns `NextResponse.json(result)`.
- **Chat panel** (`components/ai/ai-assistant.tsx`): `fetch()` → `response.json()` → display full message. Shows "Thinking..." bouncing dots while waiting.

## What Changes

### Streaming protocol: Newline-Delimited JSON (NDJSON)

The API route returns a `ReadableStream` with newline-delimited JSON events instead of a single JSON response. Four event types:

```
{"type":"tool_step","tool":"get_node_details","status":"running"}
{"type":"tool_step","tool":"get_node_details","status":"done","summary":"Inspected quickReply node"}
{"type":"tool_step","tool":"apply_edit","status":"running"}
{"type":"tool_step","tool":"apply_edit","status":"done","summary":"3 new nodes, 1 removal"}
{"type":"tool_step","tool":"validate_result","status":"running"}
{"type":"tool_step","tool":"validate_result","status":"done","summary":"No issues found"}
{"type":"text_delta","delta":"Here's what I changed: I added a follow-up question..."}
{"type":"result","data":{"message":"...","updates":{...},"action":"edit","warnings":[...]}}
```

**Edit mode:** Emits `tool_step` events as each tool call starts/finishes (real-time, per tool call), then `text_delta` as the AI's final message streams, then `result` with the complete `GenerateFlowResponse`.

**Create mode:** No streaming during generation (server-blocking). Emits a single `result` event with the complete response once done. No fake text streaming — the client-side handles the typing animation for consistency.

**Errors:** Pre-stream validation errors (missing fields, invalid platform) return normal JSON error responses with HTTP status codes. Stream-level errors (AI failure, network) emit `{"type":"error","message":"..."}` and close the stream.

### Edit mode: `streamText()` with per-tool callbacks

Replace `generateText()` with `streamText()`. Use **callback-based** event emission — NOT `fullStream` iteration — to avoid double-consumption issues:

```typescript
import { streamText, tool, stepCountIs } from "ai"

const result = streamText({
  model: getModel('claude-sonnet'),
  system: systemPrompt,
  prompt: userPrompt,
  tools: createEditTools(...),
  stopWhen: stepCountIs(12),
  temperature: 0.3,

  // Per-tool-call callbacks (NOT onStepFinish which fires per-step)
  experimental_onToolCallStart: ({ toolName }) => {
    emit({ type: 'tool_step', tool: toolName, status: 'running' })
  },
  experimental_onToolCallFinish: ({ toolName, result }) => {
    const summary = buildToolSummary(toolName, result)
    emit({ type: 'tool_step', tool: toolName, status: 'done', summary })
  },

  // Text deltas
  onChunk: ({ chunk }) => {
    if (chunk.type === 'text-delta' && chunk.textDelta) {
      emit({ type: 'text_delta', delta: chunk.textDelta })
    }
  },
})

// Wait for completion, then build and emit the final result
const finalText = await result.text
// ... build GenerateFlowResponse from finalEditResult (same as today) ...
emit({ type: 'result', data: response })
```

**Why callbacks, not `fullStream`:** `fullStream` is an `AsyncIterableStream` — consuming it drives the entire generation. If you also register callbacks, both try to consume the stream, creating confusion. Using only callbacks (`experimental_onToolCallStart`, `experimental_onToolCallFinish`, `onChunk`) is clean: the stream is consumed by `await result.text`, callbacks fire as side effects.

`**experimental_onToolCallStart`** fires before each individual tool `execute()` — gives us per-tool "running" indicators. `onStepFinish` fires when an entire step (which may contain multiple tool calls) finishes — too coarse for real-time UX.

`**buildToolSummary**` extracts a user-friendly summary from each tool's result:

- `apply_edit`: `"${newNodes} new nodes, ${removedNodes} removals"` from `result.summary`
- `validate_result`: `"No issues found"` or `"Found ${n} issues"` from `result.issueCount`
- `get_node_details`: `"Inspected ${nodeType} node"` from `result.type`
- Others: no summary needed (tool name label is enough)

**Key constraint:** The tool callbacks (`setEditResult`, `setTemplateMetadata`) still work exactly as before — they're called by the tool `execute` functions. The only change is the outer `generateText` → `streamText` swap.

### Create mode: stays blocking, no fake streaming

Create mode uses `aiClient.generateJSON()` → `generateObject()` with a self-correction retry loop. The entire generation + build + validation is server-blocking. The client waits the same total time regardless.

**No fake streaming.** Instead of streaming the message word-by-word on the server (adds implementation complexity for zero time savings), emit a single `result` event with the complete response. The client-side handles typing animation for visual consistency (see "Client typing animation" below).

This keeps create mode simple and avoids: server-side delay loops, word-splitting logic, and testing burden for a cosmetic effect.

### Fallback path preserved

The existing `generateFlow()` function is preserved unchanged. The new `generateFlowStreaming()` calls it as a fallback when structured generation fails:

```typescript
export async function generateFlowStreaming(
  request: GenerateFlowRequest,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const isEditRequest = /* same detection as generateFlow */

  if (isEditRequest) {
    try {
      await executeEditModeStreaming(request, ..., emit)
    } catch (error) {
      // Fallback: try blocking generation, same as current handleFallback
      console.warn("[generate-flow] Streaming edit failed, falling back:", error)
      const fallbackResult = await handleFallback(aiClient, request, ...)
      if (fallbackResult) {
        emit({ type: 'result', data: fallbackResult })
      } else {
        emit({ type: 'error', message: 'Failed to generate flow' })
      }
    }
  } else {
    // Create mode: blocking generation, emit result
    try {
      const result = await executeCreateMode(request, ...)
      if (result) {
        emit({ type: 'result', data: result })
      } else {
        emit({ type: 'error', message: 'Failed to generate flow' })
      }
    } catch (error) {
      console.warn("[generate-flow] Create mode failed, falling back:", error)
      const fallbackResult = await handleFallback(aiClient, request, ...)
      if (fallbackResult) {
        emit({ type: 'result', data: fallbackResult })
      } else {
        emit({ type: 'error', message: 'Failed to generate flow' })
      }
    }
  }
}
```

### API route changes

The route handler returns a `ReadableStream` for streaming requests. **Pre-stream validation errors** (missing fields, invalid platform, no API key) still return normal `NextResponse.json()` with HTTP status codes — the client checks `response.ok` before entering the stream reader.

```typescript
export async function POST(request: NextRequest) {
  // Pre-stream validation — returns JSON errors (not streamed)
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Anthropic API key not configured." }, { status: 500 })
  }
  const body = await request.json()
  if (!message || !platform) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }
  // ... other validation ...

  // Streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      }
      try {
        await generateFlowStreaming(requestData, emit)
      } catch (error) {
        emit({ type: 'error', message: error instanceof Error ? error.message : 'Internal error' })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
```

### Chat panel: streaming message display

**New fields on `Message` interface:**

```typescript
interface Message {
  // ... existing fields ...
  toolSteps?: Array<{ tool: string; status: 'running' | 'done'; summary?: string }>
  isStreaming?: boolean
}
```

`**isLoading` vs `isStreaming` lifecycle:**

- `isLoading = true` on send. Shows "Thinking..." dots. Gates input (readonly, send button disabled).
- When first stream event arrives: `isLoading = false` (dots disappear), placeholder message has `isStreaming: true`.
- `isStreaming: true` on the message: shows streaming cursor. Input stays disabled (check `isLoading || messages.some(m => m.isStreaming)`).
- On `result` or `error` event: `isStreaming = false`. Input re-enabled.

`**updateStreamingMessage` implementation** — uses functional `setMessages` to avoid stale closures:

```typescript
const streamingMessageId = useRef<string | null>(null)

function updateStreamingMessage(updater: (msg: Message) => Message) {
  setMessages(prev => prev.map(m =>
    m.id === streamingMessageId.current ? updater(m) : m
  ))
}
```

**AbortController** for stream cancellation:

```typescript
const abortControllerRef = useRef<AbortController | null>(null)

// In handleSend:
abortControllerRef.current = new AbortController()
const response = await fetch("/api/ai/flow-assistant", {
  signal: abortControllerRef.current.signal,
  ...
})

// On cleanup or new send:
abortControllerRef.current?.abort()
```

**Stream reader with error handling:**

```typescript
// Check for non-streaming error responses first
if (!response.ok) {
  const errorData = await response.json().catch(() => ({}))
  throw new Error(errorData.error || `Request failed (${response.status})`)
}

// Create placeholder message
const msgId = (Date.now() + 1).toString()
streamingMessageId.current = msgId
const assistantMessage: Message = {
  id: msgId, role: "assistant", content: "", timestamp: new Date(),
  toolSteps: [], isStreaming: true,
}
setMessages(prev => [...prev, assistantMessage])
setIsLoading(false)  // Remove thinking dots — streaming message is now visible

// Read NDJSON stream
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue
    const event: StreamEvent = JSON.parse(line)

    switch (event.type) {
      case 'tool_step':
        updateStreamingMessage(msg => ({
          ...msg,
          toolSteps: event.status === 'running'
            ? [...(msg.toolSteps || []), { tool: event.tool, status: 'running' }]
            : (msg.toolSteps || []).map(s =>
                s.tool === event.tool && s.status === 'running'
                  ? { ...s, status: 'done' as const, summary: event.summary }
                  : s
              ),
        }))
        break
      case 'text_delta':
        updateStreamingMessage(msg => ({
          ...msg,
          content: msg.content + event.delta,
        }))
        break
      case 'result':
        // Final result — streamed text is authoritative, result.message is fallback only
        updateStreamingMessage(msg => ({
          ...msg,
          content: msg.content || event.data.message || "Done.",
          flowData: event.data.flowData,
          updates: event.data.updates,
          isStreaming: false,
          isAutoApplied: !!(event.data.flowData || event.data.updates),
          warnings: event.data.warnings,
          debugData: event.data.debugData,
          templateMetadata: event.data.templateMetadata,
        }))
        // Apply to canvas
        const meta = { warnings: event.data.warnings, debugData: event.data.debugData }
        if (event.data.action === 'create' && event.data.flowData && onApplyFlow) {
          onApplyFlow(event.data.flowData, meta)
        } else if (event.data.updates && onUpdateFlow) {
          onUpdateFlow(event.data.updates, meta)
        }
        break
      case 'error':
        updateStreamingMessage(msg => ({
          ...msg,
          content: msg.content || event.message,
          isStreaming: false,
          isError: true,
        }))
        break
    }
  }
}
streamingMessageId.current = null
```

`**result` message vs streamed text:** Streamed `text_delta` content is authoritative. The `result.data.message` field is a fallback used only when no text was streamed (e.g., create mode where text deltas are not emitted). The `content: msg.content || event.data.message` pattern keeps streamed text and falls back to the result message.

**Client typing animation for create mode:** Since create mode emits a single `result` event (no `text_delta`), the message appears all at once. For visual consistency, the chat panel can animate the text appearance client-side using a simple CSS animation or character reveal. This is optional polish, not a requirement — the feature works without it.

### localStorage persistence: skip while streaming

The `useEffect` that persists messages to `localStorage` runs on every `messages` change. During streaming, this would fire hundreds of times (every text delta, every tool step). Skip persistence while any message is streaming:

```typescript
useEffect(() => {
  if (!flowId) return
  // Don't persist during streaming — too many updates
  if (messages.some(m => m.isStreaming)) return
  try {
    localStorage.setItem(CHAT_STORAGE_PREFIX + flowId, JSON.stringify(messages))
  } catch { /* ignore */ }
}, [messages, flowId])
```

### Auto-scroll: throttle during streaming

The `useEffect` that calls `scrollToBottom()` on `messages` change fires on every delta during streaming. Throttle it:

```typescript
const scrollThrottleRef = useRef<number | null>(null)

useEffect(() => {
  if (scrollThrottleRef.current) return
  scrollThrottleRef.current = requestAnimationFrame(() => {
    scrollToBottom()
    scrollThrottleRef.current = null
  })
}, [messages, scrollToBottom])
```

### Tool step rendering

Inside the message bubble, tool steps render above the message text:

```tsx
{message.toolSteps && message.toolSteps.length > 0 && (
  <div className="space-y-0.5 mb-1.5">
    {message.toolSteps.map((step, i) => (
      <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
        {step.status === 'running'
          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
          : <Check className="w-2.5 h-2.5 text-success" />
        }
        <span>{formatToolStep(step)}</span>
      </div>
    ))}
  </div>
)}
```

`formatToolStep` maps tool names to user-friendly labels:

- `get_node_details` → "Inspecting node..."
- `get_node_connections` → "Checking connections..."
- `apply_edit` → "Applying changes..." / summary from tool result
- `validate_result` → "Validating flow..." / "No issues found" or "Found N issues"
- `save_as_template` → "Saving as template..."
- `trigger_flow` → "Sending test message..."
- `list_variables` → "Listing variables..."
- `undo_last` → "Reverting changes..."

### `StreamEvent` type

Defined in `lib/ai/tools/generate-flow.ts`, exported for use by route handler and client:

```typescript
export type StreamEvent =
  | { type: 'tool_step'; tool: string; status: 'running' | 'done'; summary?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'result'; data: GenerateFlowResponse }
  | { type: 'error'; message: string }
```

## Files Changed


| File                                 | Changes                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/ai/tools/generate-flow-edit.ts` | New `executeEditModeStreaming()` using `streamText()` with `experimental_onToolCallStart/Finish` + `onChunk` callbacks                                               |
| `lib/ai/tools/generate-flow.ts`      | New `StreamEvent` type, new `generateFlowStreaming()` wrapper with fallback handling                                                                                 |
| `app/api/ai/flow-assistant/route.ts` | Return `ReadableStream` with NDJSON events. Pre-stream validation stays as JSON error responses.                                                                     |
| `components/ai/ai-assistant.tsx`     | Stream reader with `AbortController`, `updateStreamingMessage` via ref, `isLoading`/`isStreaming` lifecycle, tool step rendering, localStorage skip, scroll throttle |
| `lib/ai/core/ai-client.ts`           | Remove placeholder `generateStream()` (dead code)                                                                                                                    |


## Not In Scope

- Progressive canvas rendering (future — option 3, add to roadmap)
- Create mode `streamObject()` (deprecated in SDK v6, self-correction loop makes it impractical)
- Client-side typing animation for create mode (optional polish)
- Suggest nodes revisit (add to roadmap as future)
- Handle resolution (already implemented — `findFreeHandle()` in `flow-plan-builder.ts`)

