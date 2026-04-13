# AI Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blocking AI generation with streaming responses so users see tool steps and message text typing out in real-time instead of a "Thinking..." spinner.

**Architecture:** Edit mode swaps `generateText()` for `streamText()` with per-tool-call callbacks that emit NDJSON events through a `ReadableStream`. Create mode stays blocking (emits a single `result` event). The chat panel reads the NDJSON stream, updating a placeholder message progressively via functional `setMessages`.

**Tech Stack:** Vercel AI SDK (`streamText`, `experimental_onToolCallStart`, `experimental_onToolCallFinish`, `onChunk`), Next.js `ReadableStream`, NDJSON protocol, React state with refs

**Spec:** `docs/superpowers/specs/2026-04-11-ai-streaming-design.md`

---

### Task 1: Add `StreamEvent` Type and `generateFlowStreaming()` Wrapper

Add the shared stream event type and the top-level streaming entry point that delegates to edit (streaming) or create (blocking) mode with fallback handling.

**Files:**
- Modify: `lib/ai/tools/generate-flow.ts`

- [ ] **Step 1: Add `StreamEvent` type export after `GenerateFlowResponse`**

In `lib/ai/tools/generate-flow.ts`, add after the `GenerateFlowResponse` interface (after line 49):

```typescript
/**
 * NDJSON stream event types for AI streaming responses.
 * Used by route handler (emitter) and chat panel (consumer).
 */
export type StreamEvent =
  | { type: 'tool_step'; tool: string; status: 'running' | 'done'; summary?: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'result'; data: GenerateFlowResponse }
  | { type: 'error'; message: string }
```

- [ ] **Step 2: Add `buildToolSummary` helper**

Add below the `StreamEvent` type:

```typescript
/**
 * Extract a user-friendly summary from a tool execution result.
 */
export function buildToolSummary(toolName: string, result: unknown): string | undefined {
  const r = result as Record<string, any> | null
  if (!r) return undefined

  switch (toolName) {
    case 'apply_edit':
      if (r.summary) {
        const parts: string[] = []
        if (r.summary.newNodes > 0) parts.push(`${r.summary.newNodes} new nodes`)
        if (r.summary.nodeUpdates > 0) parts.push(`${r.summary.nodeUpdates} updates`)
        if (r.summary.removedNodes > 0) parts.push(`${r.summary.removedNodes} removals`)
        if (r.summary.newEdges > 0) parts.push(`${r.summary.newEdges} new edges`)
        if (r.summary.removedEdges > 0) parts.push(`${r.summary.removedEdges} edge removals`)
        return parts.join(', ') || undefined
      }
      return r.error ? `Error: ${r.error}` : undefined
    case 'validate_result':
      if (r.valid) return 'No issues found'
      return r.issueCount ? `Found ${r.issueCount} issue${r.issueCount > 1 ? 's' : ''}` : undefined
    case 'get_node_details':
      return r.type ? `Inspected ${r.type} node` : undefined
    case 'get_node_connections':
      return r.nodeId ? `Checked connections for ${r.nodeId}` : undefined
    default:
      return undefined
  }
}
```

- [ ] **Step 3: Add `generateFlowStreaming()` function**

Add the new function after `generateFlow()` (after line 110). This imports `executeEditModeStreaming` (created in Task 2) and delegates:

```typescript
import { executeEditModeStreaming } from "./generate-flow-edit"

// Add this import at the top of the file (with the other imports)
```

Then add the function body:

```typescript
/**
 * Streaming entry point for AI flow generation.
 * Edit mode: streams tool steps + text deltas via emit().
 * Create mode: blocking generation, emits single result event.
 * Falls back to handleFallback on errors.
 */
export async function generateFlowStreaming(
  request: GenerateFlowRequest,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  try {
    const aiClient = getAIClient()
    const platformGuidelines = getPlatformGuidelines(request.platform)

    const hasRealNodes = request.existingFlow &&
      request.existingFlow.nodes.some(n => n.type !== "start")
    const hasEdges = request.existingFlow &&
      request.existingFlow.edges.length > 0
    const isEditRequest = Boolean(hasRealNodes || hasEdges)

    const templateResolver: TemplateResolver | undefined = request.userTemplateData
      ? (id: string) => {
          const tpl = request.userTemplateData!.find(t => t.id === id)
          return tpl ? { nodes: tpl.nodes, edges: tpl.edges } : null
        }
      : undefined

    const systemPrompt = buildSystemPrompt(request, platformGuidelines, isEditRequest)
    const userPrompt = buildUserPrompt(request, isEditRequest)

    if (isEditRequest) {
      try {
        await executeEditModeStreaming(request, systemPrompt, userPrompt, templateResolver, emit)
      } catch (error) {
        console.warn("[generate-flow] Streaming edit failed, falling back:", error)
        const fallbackResult = await handleFallback(aiClient, request, systemPrompt, userPrompt, isEditRequest, templateResolver)
        if (fallbackResult) {
          emit({ type: 'result', data: fallbackResult })
        } else {
          emit({ type: 'error', message: 'Failed to generate flow' })
        }
      }
    } else {
      try {
        const result = await executeCreateMode(request, systemPrompt, userPrompt, templateResolver)
        if (result) {
          emit({ type: 'result', data: result })
        } else {
          emit({ type: 'error', message: 'Failed to generate flow' })
        }
      } catch (error) {
        console.warn("[generate-flow] Create mode failed, falling back:", error)
        const fallbackResult = await handleFallback(aiClient, request, systemPrompt, userPrompt, isEditRequest, templateResolver)
        if (fallbackResult) {
          emit({ type: 'result', data: fallbackResult })
        } else {
          emit({ type: 'error', message: 'Failed to generate flow' })
        }
      }
    }
  } catch (error) {
    console.error("[generate-flow] Streaming error:", error)
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Internal error' })
  }
}
```

- [ ] **Step 4: Add the missing import for `executeEditModeStreaming`**

At the top of `lib/ai/tools/generate-flow.ts`, update the import from `generate-flow-edit.ts` (line 9):

Change:
```typescript
import { executeEditMode, applyNodeUpdates } from "./generate-flow-edit"
```

To:
```typescript
import { executeEditMode, executeEditModeStreaming, applyNodeUpdates } from "./generate-flow-edit"
```

- [ ] **Step 5: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

This will fail because `executeEditModeStreaming` doesn't exist yet. That's expected — it's created in Task 2. Verify the only error is the missing import.

**Commit:** Deferred to after Task 2 (they form a unit).

---

### Task 2: Add `executeEditModeStreaming()` to `generate-flow-edit.ts`

Create the streaming edit mode function that replaces `generateText()` with `streamText()` and emits real-time events via the `emit` callback.

**Files:**
- Modify: `lib/ai/tools/generate-flow-edit.ts`

- [ ] **Step 1: Add `streamText` to imports**

In `lib/ai/tools/generate-flow-edit.ts`, update the import on line 2:

Change:
```typescript
import { generateText, tool, stepCountIs } from "ai"
```

To:
```typescript
import { generateText, streamText, tool, stepCountIs } from "ai"
```

- [ ] **Step 2: Add imports for `StreamEvent` and `buildToolSummary`**

Add after the existing imports (after line 11):

```typescript
import type { StreamEvent } from "./generate-flow"
import { buildToolSummary } from "./generate-flow"
```

- [ ] **Step 3: Add `executeEditModeStreaming()` function**

Add after the `executeEditMode` function (after line 118). This mirrors the structure of `executeEditMode` but uses `streamText` with callbacks:

```typescript
/**
 * Streaming variant of executeEditMode.
 * Uses streamText() with per-tool-call callbacks to emit real-time events.
 */
export async function executeEditModeStreaming(
  request: GenerateFlowRequest,
  systemPrompt: string,
  userPrompt: string,
  templateResolver: TemplateResolver | undefined,
  emit: (event: StreamEvent) => void,
): Promise<void> {
  const existingNodes = request.existingFlow?.nodes || []
  const existingEdges = request.existingFlow?.edges || []
  let finalEditResult: BuildEditFlowResult | null = null as BuildEditFlowResult | null
  let finalTemplateMetadata: { suggestedName: string; description: string; aiMetadata: TemplateAIMetadata } | null = null

  const result = streamText({
    model: getModel('claude-sonnet'),
    system: systemPrompt,
    prompt: userPrompt,
    tools: createEditTools(existingNodes, existingEdges, request, templateResolver, {
      setEditResult: (r) => { finalEditResult = r },
      setTemplateMetadata: (m) => { finalTemplateMetadata = m },
      getEditResult: () => finalEditResult,
    }),
    stopWhen: stepCountIs(12),
    temperature: 0.3,

    experimental_onToolCallStart: ({ toolCall }) => {
      emit({ type: 'tool_step', tool: toolCall.toolName, status: 'running' })
    },
    experimental_onToolCallFinish: ({ toolCall, ...rest }) => {
      const output = 'output' in rest && rest.success ? rest.output : undefined
      const summary = buildToolSummary(toolCall.toolName, output)
      emit({ type: 'tool_step', tool: toolCall.toolName, status: 'done', summary })
    },

    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta' && chunk.textDelta) {
        emit({ type: 'text_delta', delta: chunk.textDelta })
      }
    },

    onStepFinish: (step) => {
      const calls = step.toolCalls?.map((tc: any) => ({
        tool: tc.toolName,
        input: tc.toolName === 'apply_edit'
          ? { chains: tc.args?.chains?.length, nodeUpdates: tc.args?.nodeUpdates?.length, removeNodeIds: tc.args?.removeNodeIds?.length, addEdges: tc.args?.addEdges?.length }
          : tc.args,
      }))
      const results = step.toolResults?.map((tr: any) => ({
        tool: tr.toolName,
        result: tr.result,
      }))
      console.log(`[generate-flow] Streaming step (${step.finishReason}):`, JSON.stringify({ calls, results }, null, 2))
    },
  })

  // Await completion — this drives the stream consumption
  const aiMessage = await result.text || 'Flow updated successfully'
  const steps = await result.steps

  console.log("[generate-flow] Streaming edit completed:", {
    steps: steps.length,
    hasEditResult: !!finalEditResult,
    message: aiMessage.substring(0, 100),
  })

  // Build the final GenerateFlowResponse (same logic as executeEditMode)
  if (finalTemplateMetadata) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: "save_as_template",
        templateMetadata: finalTemplateMetadata,
      },
    })
    return
  }

  if (!finalEditResult) {
    emit({
      type: 'result',
      data: {
        message: aiMessage,
        action: "edit",
      },
    })
    return
  }

  const updatedNodes = applyNodeUpdates(finalEditResult.nodeUpdates, existingNodes)

  emit({
    type: 'result',
    data: {
      message: aiMessage,
      updates: {
        nodes: [...updatedNodes, ...finalEditResult.newNodes],
        edges: finalEditResult.newEdges,
        removeNodeIds: finalEditResult.removeNodeIds.length > 0 ? finalEditResult.removeNodeIds : undefined,
        removeEdges: finalEditResult.removeEdges.length > 0 ? finalEditResult.removeEdges : undefined,
        positionShifts: finalEditResult.positionShifts.length > 0 ? finalEditResult.positionShifts : undefined,
      },
      action: "edit",
      warnings: finalEditResult.warnings.length > 0 ? finalEditResult.warnings : undefined,
      debugData: {
        toolSteps: steps.length,
        toolTrace: steps.map((s: any) => ({
          finishReason: s.finishReason,
          toolCalls: s.toolCalls?.map((tc: any) => tc.toolName),
          warnings: s.toolResults?.flatMap((tr: any) => tr.result?.warnings || []),
        })),
      },
    },
  })
}
```

- [ ] **Step 4: Export the new function**

The function is already exported via the `export async function` declaration. Verify the import added in Task 1 Step 4 matches:

```typescript
import { executeEditMode, executeEditModeStreaming, applyNodeUpdates } from "./generate-flow-edit"
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If there are type issues with the `experimental_onToolCallFinish` discriminated union, the `'output' in rest && rest.success` pattern handles both branches safely.

**Commit (Tasks 1+2 together):**
```bash
git add lib/ai/tools/generate-flow.ts lib/ai/tools/generate-flow-edit.ts
git commit -m "feat(ai): add StreamEvent type, generateFlowStreaming(), and executeEditModeStreaming()

- StreamEvent NDJSON type with tool_step, text_delta, result, error variants
- generateFlowStreaming() delegates to streaming edit or blocking create with fallback
- executeEditModeStreaming() uses streamText() with experimental_onToolCallStart/Finish + onChunk
- buildToolSummary() extracts user-friendly summaries from tool results"
```

---

### Task 3: Route Handler Streaming Response

Replace the blocking `NextResponse.json(result)` with a `ReadableStream` that emits NDJSON events. Pre-stream validation errors still return normal JSON responses.

**Files:**
- Modify: `app/api/ai/flow-assistant/route.ts`

- [ ] **Step 1: Replace the entire route handler**

Replace the full contents of `app/api/ai/flow-assistant/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { generateFlowStreaming } from "@/lib/ai/tools/generate-flow"
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"
import type { Platform } from "@/types"

export async function POST(request: NextRequest) {
  // Pre-stream validation — returns JSON errors (not streamed)
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your .env.local file." },
      { status: 500 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  const {
    message,
    platform,
    flowContext,
    conversationHistory,
    existingFlow,
    selectedNode,
    userTemplates,
    userTemplateData,
  } = body

  const validPlatforms: Platform[] = ["web", "whatsapp", "instagram"]

  if (!message || !platform) {
    return NextResponse.json(
      { error: "Missing required fields: message, platform" },
      { status: 400 }
    )
  }

  if (!validPlatforms.includes(platform)) {
    return NextResponse.json(
      { error: `Invalid platform: "${platform}". Must be one of: ${validPlatforms.join(", ")}` },
      { status: 400 }
    )
  }

  const requestData = {
    prompt: message,
    platform: platform as Platform,
    flowContext,
    conversationHistory,
    existingFlow,
    selectedNode,
    userTemplates,
    userTemplateData,
  }

  // Streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // Controller already closed — ignore
        }
      }

      try {
        await generateFlowStreaming(requestData, emit)
      } catch (error) {
        console.error("[api/ai/flow-assistant] Stream error:", error)
        emit({ type: 'error', message: error instanceof Error ? error.message : 'Internal error' })
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed — ignore
        }
      }
    },
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

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Commit:**
```bash
git add app/api/ai/flow-assistant/route.ts
git commit -m "feat(ai): route handler returns NDJSON ReadableStream

Pre-stream validation errors return normal JSON responses.
Stream events emitted via generateFlowStreaming() callback."
```

---

### Task 4: Chat Panel Stream Reader and `updateStreamingMessage`

Update the chat panel to read the NDJSON stream, create a placeholder message, and progressively update it as events arrive. Add `AbortController` for cancellation.

**Files:**
- Modify: `components/ai/ai-assistant.tsx`

- [ ] **Step 1: Add `StreamEvent` import and extend `Message` interface**

At the top of `components/ai/ai-assistant.tsx`, add the import (after the existing imports, around line 11):

```typescript
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"
```

Update the `Message` interface (lines 13-30) to add the new fields. Add before the closing `}`:

```typescript
  toolSteps?: Array<{ tool: string; status: 'running' | 'done'; summary?: string }>
  isStreaming?: boolean
```

The full interface becomes:

```typescript
interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  flowData?: { nodes: any[]; edges: any[]; nodeOrder?: string[] }
  updates?: { nodes?: any[]; edges?: any[]; description?: string; removeNodeIds?: string[]; removeEdges?: any[]; positionShifts?: Array<{ nodeId: string; dx: number }> }
  isAutoApplied?: boolean
  isTemplateSaved?: boolean
  isError?: boolean
  warnings?: string[]
  debugData?: Record<string, unknown>
  templateMetadata?: {
    suggestedName: string
    description: string
    aiMetadata: TemplateAIMetadata
  }
  toolSteps?: Array<{ tool: string; status: 'running' | 'done'; summary?: string }>
  isStreaming?: boolean
}
```

- [ ] **Step 2: Add refs for streaming state**

Inside the `AIAssistant` component, add after the existing refs (after line 130, near `inputBarRef`):

```typescript
  const streamingMessageIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
```

- [ ] **Step 3: Add `updateStreamingMessage` helper**

Add after the refs, before the `useEffect` hooks:

```typescript
  const updateStreamingMessage = useCallback((updater: (msg: Message) => Message) => {
    setMessages(prev => prev.map(m =>
      m.id === streamingMessageIdRef.current ? updater(m) : m
    ))
  }, [])
```

- [ ] **Step 4: Update input disable logic**

The input should be disabled during both loading and streaming. Update the `isInputDisabled` check. In the Textarea `readOnly` prop (line 542) and Send button `disabled` prop (line 554), change:

In the `readOnly` prop on the Textarea (line 542):

Change:
```typescript
          readOnly={isLoading}
```

To:
```typescript
          readOnly={isLoading || messages.some(m => m.isStreaming)}
```

In the Send button `disabled` prop (line 554):

Change:
```typescript
          disabled={!input.trim() || isLoading}
```

To:
```typescript
          disabled={!input.trim() || isLoading || messages.some(m => m.isStreaming)}
```

In the Textarea `onChange` handler (line 538):

Change:
```typescript
          onChange={(e) => { if (!isLoading) setInput(e.target.value) }}
```

To:
```typescript
          onChange={(e) => { if (!isLoading && !messages.some(m => m.isStreaming)) setInput(e.target.value) }}
```

In the Textarea `placeholder` (line 541):

Change:
```typescript
          placeholder={isLoading ? "AI is thinking..." : "Ask AI to create or edit your flow..."}
```

To:
```typescript
          placeholder={isLoading ? "AI is thinking..." : messages.some(m => m.isStreaming) ? "AI is responding..." : "Ask AI to create or edit your flow..."}
```

- [ ] **Step 5: Replace `handleSend` with streaming implementation**

Replace the entire `handleSend` function (lines 245-333) with:

```typescript
  const handleSend = async (overrideInput?: string) => {
    const text = overrideInput ?? input
    if (!text.trim() || isLoading || messages.some(m => m.isStreaming)) return

    if (!isFocused) setIsFocused(true)

    // Abort any in-progress stream
    abortControllerRef.current?.abort()

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)
    lastFailedInputRef.current = null

    try {
      abortControllerRef.current = new AbortController()

      const response = await fetch("/api/ai/flow-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          message: userMessage.content,
          platform,
          flowContext,
          existingFlow,
          selectedNode: selectedNode
            ? { id: selectedNode.id, type: selectedNode.type, data: selectedNode.data, position: selectedNode.position }
            : undefined,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userTemplates,
          userTemplateData,
        }),
      })

      // Pre-stream errors return JSON (not NDJSON)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed (${response.status})`)
      }

      // Create placeholder streaming message
      const msgId = (Date.now() + 1).toString()
      streamingMessageIdRef.current = msgId
      const assistantMessage: Message = {
        id: msgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        toolSteps: [],
        isStreaming: true,
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsLoading(false) // Remove thinking dots — streaming message is now visible

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
          let event: StreamEvent
          try {
            event = JSON.parse(line)
          } catch {
            console.warn("[AI Assistant] Failed to parse stream event:", line)
            continue
          }

          switch (event.type) {
            case 'tool_step':
              updateStreamingMessage(msg => ({
                ...msg,
                toolSteps: event.status === 'running'
                  ? [...(msg.toolSteps || []), { tool: event.tool, status: 'running' as const }]
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

            case 'result': {
              const data = event.data
              const meta = { warnings: data.warnings, debugData: data.debugData, userPrompt: userMessage.content }
              const isAutoApplyCreate = data.action === 'create' && data.flowData && onApplyFlow
              const isAutoApplyEdit = data.updates && onUpdateFlow

              updateStreamingMessage(msg => ({
                ...msg,
                content: msg.content || data.message || "Done.",
                flowData: data.flowData,
                updates: data.updates,
                isStreaming: false,
                isAutoApplied: !!(isAutoApplyCreate || isAutoApplyEdit),
                warnings: data.warnings,
                debugData: data.debugData,
                templateMetadata: data.templateMetadata,
              }))

              // Apply to canvas
              if (isAutoApplyCreate) {
                setIsFocused(false)
                onApplyFlow!(data.flowData!, meta)
              } else if (isAutoApplyEdit) {
                onUpdateFlow!(data.updates!, meta)
              } else if (data.flowData) {
                setIsFocused(true)
              }
              break
            }

            case 'error':
              lastFailedInputRef.current = userMessage.content
              updateStreamingMessage(msg => ({
                ...msg,
                content: msg.content || event.message || "Sorry, something went wrong.",
                isStreaming: false,
                isError: true,
              }))
              break
          }
        }
      }

      streamingMessageIdRef.current = null
    } catch (error) {
      // Handle abort (user cancelled or component unmounted)
      if (error instanceof DOMException && error.name === 'AbortError') {
        updateStreamingMessage(msg => ({
          ...msg,
          content: msg.content || "Request cancelled.",
          isStreaming: false,
        }))
        streamingMessageIdRef.current = null
        setIsLoading(false)
        return
      }

      console.error("[AI Assistant] Error:", error)
      lastFailedInputRef.current = userMessage.content

      // If we already created a streaming message, update it with the error
      if (streamingMessageIdRef.current) {
        updateStreamingMessage(msg => ({
          ...msg,
          content: error instanceof Error && error.message !== "Request failed (500)"
            ? `Something went wrong: ${error.message}`
            : "Sorry, I encountered an error. Please try again.",
          isStreaming: false,
          isError: true,
        }))
        streamingMessageIdRef.current = null
      } else {
        // Error happened before streaming started (during fetch)
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: error instanceof Error && error.message !== "Request failed (500)"
            ? `Something went wrong: ${error.message}`
            : "Sorry, I encountered an error. Please try again.",
          timestamp: new Date(),
          isError: true,
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Commit:**
```bash
git add components/ai/ai-assistant.tsx
git commit -m "feat(ai): chat panel reads NDJSON stream with progressive message updates

- Placeholder message created on stream start with isStreaming=true
- updateStreamingMessage via functional setMessages + ref
- AbortController for stream cancellation
- tool_step, text_delta, result, error event handling
- Input disabled during streaming"
```

---

### Task 5: Tool Step Rendering UI

Add the tool step indicators inside assistant message bubbles — spinning icon for running, check for done, with user-friendly labels.

**Files:**
- Modify: `components/ai/ai-assistant.tsx`

- [ ] **Step 1: Add `formatToolStep` helper**

Add inside the `components/ai/ai-assistant.tsx` file, before the `AIAssistant` component (after the `renderNodePreview` function, around line 71):

```typescript
function formatToolStep(step: { tool: string; status: 'running' | 'done'; summary?: string }): string {
  if (step.status === 'done' && step.summary) return step.summary

  switch (step.tool) {
    case 'get_node_details': return 'Inspecting node...'
    case 'get_node_connections': return 'Checking connections...'
    case 'apply_edit': return step.status === 'done' ? 'Changes applied' : 'Applying changes...'
    case 'validate_result': return step.status === 'done' ? 'Validation complete' : 'Validating flow...'
    case 'save_as_template': return step.status === 'done' ? 'Template saved' : 'Saving as template...'
    case 'trigger_flow': return step.status === 'done' ? 'Test sent' : 'Sending test message...'
    case 'list_variables': return step.status === 'done' ? 'Variables listed' : 'Listing variables...'
    case 'undo_last': return step.status === 'done' ? 'Changes reverted' : 'Reverting changes...'
    default: return step.tool.replace(/_/g, ' ')
  }
}
```

- [ ] **Step 2: Add tool step rendering inside message bubbles**

In the message rendering loop (inside the `messages.map` callback), add the tool steps display. Find the line that renders the message content (line 413):

```typescript
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
```

Add **before** that line (tool steps render above the message text):

```typescript
                    {/* Tool step indicators */}
                    {message.toolSteps && message.toolSteps.length > 0 && (
                      <div className="space-y-0.5 mb-1.5">
                        {message.toolSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                            {step.status === 'running'
                              ? <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
                              : <Check className="w-2.5 h-2.5 text-success flex-shrink-0" />
                            }
                            <span>{formatToolStep(step)}</span>
                          </div>
                        ))}
                      </div>
                    )}
```

- [ ] **Step 3: Add streaming cursor after message text**

After the message content `<p>` tag, add a blinking cursor indicator when the message is still streaming. Find:

```typescript
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
```

Replace with:

```typescript
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                      {message.isStreaming && message.content && (
                        <span className="inline-block w-1.5 h-3.5 bg-foreground/50 ml-0.5 animate-pulse rounded-sm" />
                      )}
                    </p>
```

- [ ] **Step 4: Hide the content paragraph when empty and still streaming**

When the message content is empty (tool steps happening but no text yet), don't render an empty paragraph. Update the content rendering:

Replace:
```typescript
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {message.content}
                      {message.isStreaming && message.content && (
                        <span className="inline-block w-1.5 h-3.5 bg-foreground/50 ml-0.5 animate-pulse rounded-sm" />
                      )}
                    </p>
```

With:
```typescript
                    {(message.content || !message.isStreaming) && (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {message.content}
                        {message.isStreaming && message.content && (
                          <span className="inline-block w-1.5 h-3.5 bg-foreground/50 ml-0.5 animate-pulse rounded-sm" />
                        )}
                      </p>
                    )}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Commit:**
```bash
git add components/ai/ai-assistant.tsx
git commit -m "feat(ai): tool step indicators and streaming cursor in chat bubbles

- formatToolStep() maps tool names to user-friendly labels
- Spinning Loader2 for running steps, Check icon for done steps
- Blinking cursor while text is streaming
- Empty content hidden during tool-step-only phase"
```

---

### Task 6: localStorage Skip and Scroll Throttle

Prevent performance issues during streaming: skip localStorage writes while messages are streaming, and throttle auto-scroll to animation frames.

**Files:**
- Modify: `components/ai/ai-assistant.tsx`

- [ ] **Step 1: Update localStorage persistence to skip during streaming**

Find the localStorage persistence `useEffect` (lines 133-140):

```typescript
  useEffect(() => {
    if (flowId && typeof window !== "undefined" && messages.length > 1) {
      const toStore = messages.map(({ flowData, updates, debugData, ...rest }) => rest)
      try {
        localStorage.setItem(`${CHAT_STORAGE_PREFIX}${flowId}`, JSON.stringify(toStore))
      } catch { /* storage full — ignore */ }
    }
  }, [messages, flowId])
```

Replace with:

```typescript
  useEffect(() => {
    if (!flowId || typeof window === "undefined" || messages.length <= 1) return
    // Don't persist during streaming — too many updates
    if (messages.some(m => m.isStreaming)) return
    const toStore = messages.map(({ flowData, updates, debugData, ...rest }) => rest)
    try {
      localStorage.setItem(`${CHAT_STORAGE_PREFIX}${flowId}`, JSON.stringify(toStore))
    } catch { /* storage full — ignore */ }
  }, [messages, flowId])
```

- [ ] **Step 2: Add throttled scroll ref**

Find the `scrollThrottleRef` — it doesn't exist yet. Add it near the other refs (after `scrollContainerRef`):

```typescript
  const scrollThrottleRef = useRef<number | null>(null)
```

- [ ] **Step 3: Replace auto-scroll `useEffect` with throttled version**

Find the auto-scroll `useEffect` (lines 149-151):

```typescript
  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])
```

Replace with:

```typescript
  useEffect(() => {
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = requestAnimationFrame(() => {
      scrollToBottom()
      scrollThrottleRef.current = null
    })
  }, [messages, isLoading, scrollToBottom])
```

- [ ] **Step 4: Cleanup the animation frame on unmount**

Add a cleanup `useEffect` to cancel any pending animation frame. Add right after the throttled scroll effect:

```typescript
  useEffect(() => {
    return () => {
      if (scrollThrottleRef.current) {
        cancelAnimationFrame(scrollThrottleRef.current)
      }
    }
  }, [])
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Commit:**
```bash
git add components/ai/ai-assistant.tsx
git commit -m "perf(ai): skip localStorage writes during streaming, throttle auto-scroll

- localStorage persistence skips while any message has isStreaming=true
- Auto-scroll throttled to requestAnimationFrame
- Animation frame cleanup on unmount"
```

---

### Task 7: Remove Dead `generateStream()` from `ai-client.ts`

The placeholder `generateStream()` method in the AI client is dead code that's replaced by the real streaming implementation. Remove it.

**Files:**
- Modify: `lib/ai/core/ai-client.ts`

- [ ] **Step 1: Remove `generateStream` method**

In `lib/ai/core/ai-client.ts`, delete the `generateStream` method (lines 177-186):

```typescript
  /**
   * Stream text generation (for future use)
   */
  async *generateStream(params: {
    systemPrompt: string
    userPrompt: string
  }): AsyncGenerator<string> {
    // TODO: Implement streaming when needed
    const response = await this.generate(params)
    yield response.text
  }
```

Remove these lines entirely. The class should end with the closing `}` of the `generateJSON` method.

- [ ] **Step 2: Verify no references to `generateStream`**

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.claude/worktrees/agent-a4aa8e58 && grep -r "generateStream" --include="*.ts" --include="*.tsx" lib/ app/ components/ 2>/dev/null
```

Expected: no results (or only the line you're about to delete).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

**Commit:**
```bash
git add lib/ai/core/ai-client.ts
git commit -m "chore: remove dead generateStream() placeholder from ai-client.ts"
```

---

### Task 8: Smoke Test

Verify everything compiles and the streaming integration works end-to-end.

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: clean output, no errors.

- [ ] **Step 2: Run existing tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all existing tests pass. No new tests are needed for streaming (it's an integration concern tested manually via the UI).

- [ ] **Step 3: Verify all modified files have correct imports**

Check each file has no unused imports and all needed imports are present:

```bash
cd /Users/pratikgupta/Freestand/magic-flow/.claude/worktrees/agent-a4aa8e58 && grep -n "import.*from" lib/ai/tools/generate-flow.ts lib/ai/tools/generate-flow-edit.ts app/api/ai/flow-assistant/route.ts components/ai/ai-assistant.tsx lib/ai/core/ai-client.ts
```

- [ ] **Step 4: Manual test checklist**

Start the dev server (`docker compose up` or `npm run dev`) and test:

1. **Edit mode streaming:** Open an existing flow, send a message like "Add a question asking for the user's name". Verify:
   - "Thinking..." dots appear initially
   - Tool steps appear with spinning indicators (e.g., "Inspecting node...", "Applying changes...")
   - Tool steps transition to check marks when done
   - Message text types out progressively
   - Flow updates apply to canvas when stream completes

2. **Create mode (blocking):** Open a blank flow, send "Create a greeting flow that asks for name and email". Verify:
   - "Thinking..." dots appear
   - Full message appears at once (no progressive typing)
   - Flow auto-applies to canvas

3. **Error handling:** Temporarily set an invalid API key. Verify:
   - Pre-stream validation error returns immediately
   - Error message displays correctly in chat

4. **Abort:** Send a message, then quickly send another (or refresh). Verify:
   - First stream is aborted cleanly
   - No duplicate messages appear

**No commit for this task — it's verification only.**
