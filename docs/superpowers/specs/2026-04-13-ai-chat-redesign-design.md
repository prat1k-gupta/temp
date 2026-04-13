# AI Chat UI Redesign — Phase B.1a

Visual redesign of the AI chat panel using Vercel's `ai-elements` shadcn registry. Moves the chat from a floating bottom-center panel to a right-side resizable panel. Replaces the custom-rendered message bubbles, tool step list, scroll logic, and width measurement with shadcn/ai components. **Does NOT change transport, message format, tool definitions, or any streaming logic.**

## Scope

**In scope (UI only):**
- Right-side resizable panel (mirrors `PropertiesPanelWrapper`)
- shadcn/ai components for rendering: `<Conversation>`, `<Message>`, `<MessageContent>`, `<MessageResponse>`, `<Reasoning>`
- Real markdown rendering (`streamdown` — assistant responses render `**bold**`, lists, tables, code blocks)
- Tool steps rendered as non-collapsible status rows inside a `<Reasoning>` collapse
- Custom empty state with context-aware suggestion pills (plain div, NOT `ConversationEmptyState`)
- "AI" toggle button in `FlowHeader`
- `Cmd+I` keyboard shortcut
- Delete dead effects (click-outside handler, width measurement, isFocused auto-expand, scroll throttle)

**Out of scope (deferred):**
- `useChat` migration and `UIMessage` parts format → potential future Phase B.1b (only if we hit limits of the current transport)
- Database storage for conversations → Phase B.2
- Tool consolidation (merging `apply_edit` + `validate_result`) → skipped, actively regresses inspection-after-failed-edit
- Multi-turn proper `messages[]` array instead of string concat → potential future Phase B.1b
- Mobile drawer (desktop-first)
- Model selector, conversation search, export, attachments, regenerate/branching
- Timestamp display in chat bubbles (intentionally removed for cleaner UI — still stored on Message objects)

## Preserved (zero changes)

| Component | Why it stays |
|---|---|
| `handleSend` function + NDJSON reader loop | Working transport, just shipped and tested |
| `updateStreamingMessage` with ref-based race fix | Critical fix from yesterday |
| `ensurePlaceholder` lazy placeholder creation | Create vs edit mode divergence |
| `AbortController` + abort logic | Working |
| Custom `Message` interface (`{ id, role, content, toolSteps, isStreaming, ... }`) | Not switching to `UIMessage` format |
| `sanitizeUnicode()` in `flow-prompts.ts` | Recent fix for broken emoji surrogates |
| All tool definitions (`apply_edit`, `validate_result`, `build_and_validate`, `trigger_flow`, `list_variables`, `undo_last`, `save_as_template`, etc.) | Phase A + Phase B tools |
| `generate-flow-edit.ts`, `generate-flow-create-streaming.ts`, `generate-flow.ts` | Server-side logic unchanged |
| Route handler NDJSON `ReadableStream` | No protocol change |
| `StreamEvent` type (`tool_step`, `text_delta`, `result`, `error`) | Still emitted by server, still consumed by client reader |
| localStorage persistence pattern (same key, same format, same skip-while-streaming rule) | Not changing storage |
| `useAccounts()` + `waAccountName` resolution | Phase A plumbing |
| `userTemplates` / `userTemplateData` loading | Request payload |
| `handleRetry` / `lastFailedInputRef` | Retry button behavior |
| `onApplyFlow` / `onUpdateFlow` callbacks | Canvas bridge |
| `appliedMessageIds` set (manual-apply tracking) | Still needed for "Apply Flow" buttons on non-auto-applied messages |

## Architecture

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  FlowHeader  [Edit] [View] [✦ AI*] [Publish]                   │  ← AI button, active when open
├──────────┬───────────────────┬────────────────┬────────────────┤
│          │                   │                │                │
│ Sidebar  │  ReactFlow        │  AI Chat       │  Properties    │
│  (left)  │   Canvas          │   Panel        │    Panel       │
│          │  (flex-1 — push)  │ (440px, resize)│ (320px, resize)│
│          │                   │                │                │
└──────────┴───────────────────┴────────────────┴────────────────┘
```

**Flex order (left to right):** canvas → **AI chat** → AI suggestions → properties panel. The AI chat is closest to the canvas because it's the most frequently used right-rail panel. `AISuggestionsPanel` and `PropertiesPanelWrapper` are only triggered by selecting a node.

All three right-rail panels can coexist. On 1760px screen: ~1000px canvas + 440px chat + 320px suggestions + 320px properties. On 1280px screens this overflows — users close panels manually. Addressed as known limitation.

### Component tree

```
AIChatPanelWrapper (NEW)
│ — owns open/close state via props
│ — owns width + drag resize + localStorage width persistence
│ — renders <AIAssistant /> ALWAYS mounted (visibility toggled via display: none)
│
└── AIAssistant (REFACTOR — rendering swapped, logic preserved)
    │ — owns messages, input, streaming state
    │ — owns stream reader loop, updateStreamingMessage, abort logic
    │
    ├── Header (title + close button)
    ├── Conversation (shadcn/ai — auto-scroll via use-stick-to-bottom)
    │   └── ConversationContent
    │       ├── [empty] → <AIEmptyState /> (plain flex hero + pills)
    │       └── [messages] → messages.map → <Message from={msg.role}>
    │           ├── Reasoning (shadcn/ai — collapsible thinking block)
    │           │   ├── ReasoningTrigger ("Thinking..." / "Thought for Xs")
    │           │   └── CollapsibleContent (from @/components/ui/collapsible)
    │           │       └── <ToolStepRow /> per step (plain div, NOT a Collapsible)
    │           └── MessageContent
    │               ├── [assistant] → <MessageResponse> (streamdown markdown)
    │               └── [user] → <div whitespace-pre-wrap> (plain text)
    └── Input bar (plain Textarea + send button)
```

## Dependencies

Install via `ai-elements` CLI:

```bash
npx ai-elements@latest add message
npx ai-elements@latest add reasoning
npx ai-elements@latest add conversation
```

These install source files into `components/ai-elements/` and add these npm deps (verified via spike on `spike/shadcn-ai` branch):

- `streamdown` + `@streamdown/cjk`, `@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid` — streaming markdown renderer
- `shiki` — code syntax highlighting (lazy-loaded; future concern for bundle size on AI route)
- `motion` — framer motion, used by `<Shimmer>` (dep of `<Reasoning>`)
- `use-stick-to-bottom` — auto-scroll library
- `@radix-ui/react-use-controllable-state` — state primitive for Reasoning

**We do NOT install `tool`** — we render tool step rows as plain `<div>`s. The `<Tool>` component is a Collapsible that expects a body (`<ToolContent>` with `<ToolInput>`/`<ToolOutput>` JSON). We only have a tool name + status + optional summary string — rendering it as a Collapsible with nothing inside creates a chevron that does nothing.

Files created by the CLI (commit):
- `components/ai-elements/message.tsx` (needs post-install trim, see below)
- `components/ai-elements/reasoning.tsx`
- `components/ai-elements/conversation.tsx`
- `components/ai-elements/shimmer.tsx` (used by Reasoning)
- `components/ui/button-group.tsx` (dep of message.tsx — only kept if not stripped during trim)

### Post-install fix: `components/ai-elements/message.tsx`

The installed `message.tsx` uses `size="icon-sm"` on Button components inside `MessageAction` / `MessageBranch*` / `MessageToolbar`. Our `components/ui/button.tsx` only has `"default" | "sm" | "lg" | "icon" | null` variants, causing 3 TypeScript errors.

**Fix:** Delete the unused exports from `message.tsx`. Keep only:
- `Message` (+ `MessageProps`)
- `MessageContent` (+ `MessageContentProps`)
- `MessageResponse` (+ `MessageResponseProps`)

Delete:
- `MessageAction`, `MessageActions`, and all their types
- `MessageBranch`, `MessageBranchContent`, `MessageBranchNext`, `MessageBranchPrevious`, `MessageBranchSelector`, `MessageBranchPage` and all their types
- `MessageToolbar` and its types
- `MessageBranchContext`, `useMessageBranch`, `MessageBranchContextType`

Also delete unused imports after the removal:
- `Button`, `ButtonGroup`, `ButtonGroupText`
- `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger`
- `ChevronLeftIcon`, `ChevronRightIcon`
- `createContext`, `useContext`, `useState`, `useEffect`, `useCallback`, `useMemo`
- `ReactElement`

Final `message.tsx` should be ~80 lines instead of 360. After the trim, `components/ui/button-group.tsx` can be deleted too (no consumers). Run `npx tsc --noEmit` to verify zero errors.

### No Tailwind config changes needed

We use Tailwind v4 (`@import "tailwindcss"` in `app/globals.css`, no `tailwind.config.*` file). Streamdown ships its own minimal styling with a `not-prose` class — it does NOT require `@tailwindcss/typography`. No CSS changes needed.

## `AIChatPanelWrapper` (new component)

File: `components/ai/ai-chat-panel-wrapper.tsx`. Mirrors `PropertiesPanelWrapper` for layout; extends it with always-mounted inner component for stable state across open/close cycles.

**Key architectural decision: `<AIAssistant>` is rendered ALWAYS** (not conditional on `isOpen`). We toggle visibility via `display: none` and width animation. This preserves:
- In-flight stream state (closing the panel mid-stream doesn't orphan the fetch)
- Input draft text
- `appliedMessageIds` set
- `streamingMessageIdRef.current`
- `messages` state (no re-reading localStorage on every open/close)
- `userTemplates` / `userTemplateData` (no refetching on every open/close)

```typescript
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { Sparkles, X as CloseIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIAssistant } from "@/components/ai/ai-assistant"

const MIN_WIDTH = 360
const MAX_WIDTH = 800
const DEFAULT_WIDTH = 440
const STORAGE_KEY_WIDTH = "magic-flow-ai-chat-width"

interface AIChatPanelWrapperProps {
  isOpen: boolean
  onClose: () => void
  flowId?: string
  platform: Platform
  flowContext?: string
  existingFlow: { nodes: Node[]; edges: Edge[] }
  selectedNode: Node | null
  onApplyFlow?: (flowData: any, meta?: any) => void
  onUpdateFlow?: (updates: any, meta?: any) => void
  publishedFlowId?: string
  waAccountId?: string
}

export function AIChatPanelWrapper({
  isOpen,
  onClose,
  ...assistantProps
}: AIChatPanelWrapperProps) {
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WIDTH)
      const n = stored ? parseInt(stored, 10) : DEFAULT_WIDTH
      return Number.isFinite(n) ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n)) : DEFAULT_WIDTH
    } catch {
      return DEFAULT_WIDTH
    }
  })
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = panelWidth
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [panelWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = startX.current - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
      setPanelWidth(newWidth)
    }
    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      try { localStorage.setItem(STORAGE_KEY_WIDTH, String(panelWidth)) } catch { /* quota */ }
    }
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [panelWidth])

  return (
    <div
      data-panel="ai-chat"
      className="relative bg-background border-l border-border overflow-hidden flex-shrink-0 flex flex-col"
      style={{
        width: isOpen ? panelWidth : 0,
        transition: isDragging.current ? "none" : "width 300ms ease-in-out",
      }}
    >
      {/* Drag handle — only visible when open */}
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors"
        style={{ display: isOpen ? "block" : "none" }}
      />

      {/* Header + body wrapper — hidden via CSS when closed, NOT unmounted */}
      <div
        className="flex flex-col h-full"
        style={{ minWidth: MIN_WIDTH, display: isOpen ? "flex" : "none" }}
      >
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Freestand AI</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 cursor-pointer" aria-label="Close AI chat panel">
            <CloseIcon className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <AIAssistant {...assistantProps} />
        </div>
      </div>
    </div>
  )
}
```

**Removed from previous spec draft:** `onClosePanel` prop is NOT passed to `AIAssistant`. The chat stays open after a successful create (same as edit). Users close manually when they want to see the canvas.

**Drag handle is always mounted** (not gated by `isOpen`) but hidden via `display: none` when closed. This avoids layout jitter on open/close.

## `AIAssistant` refactor

File: `components/ai/ai-assistant.tsx`. Biggest change in the PR. Current file is ~800 lines.

### Effects to DELETE

| Current code (approximate location) | Reason |
|---|---|
| `chatContainerRef` + `containerWidth` state + ResizeObserver effect (lines ~228-250) | Wrapper owns width |
| `isFocused` state and all its dependent effects | Wrapper owns open/close |
| Auto-expand effect on new `flowData` message (lines ~252-266) | No longer needed — panel stays open until user closes |
| Click-outside-to-collapse handler (lines ~268-302) | No longer needed — explicit close via button/Cmd+I |
| `scrollThrottleRef` + rAF scroll useEffect (lines ~186-199) | `<Conversation>` handles via `use-stick-to-bottom` |
| `GREETING_MESSAGE` constant + initial state seeding | Empty array → render empty state |
| Auto-focus textarea on `isFocused` toggle | Replaced by mount effect (fires once on component mount, which matches the always-mounted pattern poorly) — see "Auto-focus" below |

### Effects to ADD

**AbortController cleanup on unmount** (safety net, even though we're always-mounted via the wrapper — defensive):

```typescript
useEffect(() => {
  return () => {
    abortControllerRef.current?.abort()
  }
}, [])
```

### State to DELETE

- `isFocused: boolean`
- `containerWidth: number | null`
- `chatContainerRef: RefObject`
- `scrollThrottleRef: RefObject<number>`
- `seenMessageIds: Set<string>` (was used by auto-expand, which is gone)

### State to KEEP

- `messages: Message[]`
- `input: string`
- `isLoading: boolean`
- `appliedMessageIds: Set<string>` (still needed — manual "Apply Flow" button tracking)
- `streamingMessageIdRef: RefObject<string | null>` (critical race fix from yesterday)
- `abortControllerRef: RefObject<AbortController | null>`
- `lastFailedInputRef: RefObject<string | null>`
- `userTemplates`, `userTemplateData`
- `useAccounts()` result
- `waAccountName` (useMemo)
- `inputRef: RefObject<HTMLTextAreaElement>` (for auto-focus, see below)

### Initial messages (remove GREETING_MESSAGE)

```typescript
const [messages, setMessages] = useState<Message[]>(() => {
  if (!flowId || typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${flowId}`)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false }))
      // Clean out the legacy hardcoded greeting if it's in storage
      .filter((m: any) => !(m.role === "assistant" && m.id === "1" && m.content?.startsWith("Hi! I'm your Freestand AI")))
  } catch {
    return []
  }
})
```

### Result handler: remove `setIsFocused` calls, do NOT auto-close

The current stream reader's `result` case has these UX calls:

```typescript
// CURRENT
if (isAutoApplyCreate) {
  setIsFocused(false)
  onApplyFlow!(data.flowData!, meta)
} else if (isAutoApplyEdit) {
  onUpdateFlow!(data.updates!, meta)
} else if (data.flowData) {
  setIsFocused(true)
}
```

**All three branches change:**

```typescript
// NEW
if (isAutoApplyCreate) {
  onApplyFlow!(data.flowData!, meta)
} else if (isAutoApplyEdit) {
  onUpdateFlow!(data.updates!, meta)
}
// Third branch `else if (data.flowData) { setIsFocused(true) }` is DELETED entirely
// (the panel is already open — no need to open it)
```

The `setIsFocused(false)` on create is removed — the chat stays open showing the AI's confirmation message. User closes manually when they want to see the canvas. This matches edit-mode behavior (consistent UX).

### Auto-focus the textarea on mount

The wrapper renders `<AIAssistant>` always, but the panel is visually hidden when closed. We still want the textarea to be focused when the user first opens the panel. Since the component only mounts once, we can't use a mount effect.

**Pattern:** Pass `isOpen` down as a prop and focus via effect on transition:

Modify `AIAssistantProps`:
```typescript
interface AIAssistantProps {
  // ... existing props ...
  isPanelOpen?: boolean  // NEW — just for focus management
}
```

The wrapper passes it:
```tsx
<AIAssistant {...assistantProps} isPanelOpen={isOpen} />
```

Inside `AIAssistant`:
```typescript
useEffect(() => {
  if (isPanelOpen) {
    // Wait a tick for the display:none → display:flex transition
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }
}, [isPanelOpen])
```

### Imports to KEEP

```typescript
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Loader2, RotateCcw, Check } from "lucide-react"
import { getAllTemplates, getFlow } from "@/utils/flow-storage"
import { getAccessToken } from "@/lib/auth"
import { useAccounts } from "@/hooks/queries"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import { toast } from "sonner"
import type { TemplateAIMetadata } from "@/types"
```

### Imports to DELETE

```typescript
// import { Card } from "@/components/ui/card"                   // no longer used
// import { ChevronDown, Sparkles } from "lucide-react"          // ChevronDown was for collapse, Sparkles moved to wrapper
```

### Imports to ADD

```typescript
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { CollapsibleContent } from "@/components/ui/collapsible"
import { AIEmptyState } from "@/components/ai/ai-empty-state"
```

### Render tree (replaces current lines ~575-800)

```tsx
<div className="flex flex-col h-full">
  <Conversation className="flex-1">
    <ConversationContent>
      {messages.length === 0 ? (
        <AIEmptyState
          hasRealNodes={existingFlow.nodes.some(n => n.type !== "start")}
          onSelectSuggestion={(text) => handleSend(text)}
        />
      ) : (
        messages.map((msg) => (
          <Message key={msg.id} from={msg.role}>
            <MessageContent
              className={msg.role === "user" ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground" : undefined}
            >
              {/* Tool steps — grouped under a Reasoning collapse */}
              {msg.toolSteps && msg.toolSteps.length > 0 && (
                <Reasoning isStreaming={!!msg.isStreaming} defaultOpen={!!msg.isStreaming}>
                  <ReasoningTrigger />
                  <CollapsibleContent className="space-y-1 mt-2 pl-6">
                    {msg.toolSteps.map((step, i) => (
                      <div
                        key={`${msg.id}-step-${i}`}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        {step.status === "running" ? (
                          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                        ) : (
                          <Check className="w-3 h-3 text-success flex-shrink-0" />
                        )}
                        <span className="break-words">{formatToolStep(step)}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Reasoning>
              )}

              {/* Message content — markdown for assistant, plain for user */}
              {msg.content && (
                msg.role === "assistant" ? (
                  <MessageResponse>{msg.content}</MessageResponse>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-sm">{msg.content}</div>
                )
              )}

              {/* Error state + retry */}
              {msg.isError && lastFailedInputRef.current && (
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={handleRetry} className="cursor-pointer">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                </div>
              )}

              {/* Manual "Apply Flow" button for non-auto-applied flow data */}
              {msg.flowData && !msg.isAutoApplied && !appliedMessageIds.has(msg.id) && onApplyFlow && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      onApplyFlow(msg.flowData!, { warnings: msg.warnings })
                      setAppliedMessageIds(prev => new Set(prev).add(msg.id))
                    }}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    Apply Flow
                  </Button>
                </div>
              )}
            </MessageContent>
          </Message>
        ))
      )}
    </ConversationContent>
    <ConversationScrollButton />
  </Conversation>

  {/* Input bar */}
  <div className="p-3 border-t border-border flex-shrink-0">
    <div className="relative">
      <Textarea
        ref={inputRef}
        value={input}
        onChange={(e) => { if (!isLoading) setInput(e.target.value) }}
        onKeyDown={handleKeyDown}
        placeholder={isLoading ? "AI is thinking..." : "Ask AI to create or edit your flow..."}
        className="pr-10 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
        readOnly={isLoading}
        rows={1}
        onInput={(e) => {
          const target = e.target as HTMLTextAreaElement
          target.style.height = "auto"
          target.style.height = `${Math.min(target.scrollHeight, 120)}px`
        }}
      />
      <Button
        onClick={() => handleSend()}
        size="sm"
        disabled={!input.trim() || isLoading}
        className="absolute right-2 bottom-2 h-7 w-7 p-0 cursor-pointer"
        aria-label="Send message"
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
      </Button>
    </div>
  </div>
</div>
```

### Key rendering decisions explained

**Why `<Reasoning>` + `<CollapsibleContent>` (not `<ReasoningContent>`):** `ReasoningContent` expects `children: string` and passes it to Streamdown. Our tool steps are React components, not a string. `<Reasoning>` is itself a `Collapsible` (verified upstream), so we use `<CollapsibleContent>` from `@/components/ui/collapsible` directly. The auto-open/auto-close behavior comes from `Reasoning`'s internal state management around the `isStreaming` prop.

**Why plain `<div>`s for tool steps, not `<Tool>`:** `<Tool>` is a Collapsible that expects a `<ToolContent>` body with `<ToolInput>` (JSON input) and `<ToolOutput>` (JSON output). We only have a name + status + summary string. Rendering `<Tool>` with just `<ToolHeader>` gives a misleading chevron that expands to nothing. Plain `<div>` rows with icon + text are cleaner for our data.

**Why `<MessageResponse>` only for assistant:** Streamdown parses markdown. A user typing `**not bold**` would see "not bold" rendered bold. User messages render as plain `<div>` with `whitespace-pre-wrap`.

**Why `group-[.is-user]:bg-primary`:** `<Message>` adds `.is-user` / `.is-assistant` class to its wrapper. `MessageContent` uses `group-[.is-user]:bg-secondary` by default. We override with `bg-primary text-primary-foreground` to preserve the brand blue for user messages (matching the current design).

**Why ToolStepRow is not a separate component:** The row is 8 lines of JSX. Extracting it is YAGNI. Inline.

**`formatToolStep` stays inline** in `ai-assistant.tsx`. No new file.

### `handleSend` unchanged

No changes to the `handleSend` function, NDJSON reader, `updateStreamingMessage`, `ensurePlaceholder`, or error handling. The only change is the `result` case's UX calls (the `setIsFocused(...)` removals above).

## `AIEmptyState` (new component)

File: `components/ai/ai-empty-state.tsx`. Plain flex div — does NOT use `ConversationEmptyState` (which ignores title/description when children are provided).

```tsx
"use client"

import { Sparkles } from "lucide-react"

interface Suggestion {
  icon: string
  text: string
}

const SUGGESTIONS_EMPTY: Suggestion[] = [
  { icon: "✏️", text: "Create a customer feedback survey flow" },
  { icon: "🛒", text: "Build a product recommendation bot" },
  { icon: "📋", text: "Add user registration with email validation" },
]

const SUGGESTIONS_EXISTING: Suggestion[] = [
  { icon: "✨", text: "Add a follow-up question to collect feedback" },
  { icon: "🔀", text: "Add conditional routing based on the user's answer" },
  { icon: "🔍", text: "Review this flow for issues and suggest improvements" },
]

interface AIEmptyStateProps {
  hasRealNodes: boolean
  onSelectSuggestion: (text: string) => void
}

export function AIEmptyState({ hasRealNodes, onSelectSuggestion }: AIEmptyStateProps) {
  const suggestions = hasRealNodes ? SUGGESTIONS_EXISTING : SUGGESTIONS_EMPTY
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center gap-6">
      <Sparkles className="w-10 h-10 text-primary" />
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">What can I help you with?</h3>
        <p className="text-sm text-muted-foreground">Ask me to create or edit your flow</p>
      </div>
      <div className="space-y-2 w-full max-w-sm">
        {suggestions.map((s) => (
          <button
            key={s.text}
            type="button"
            onClick={() => onSelectSuggestion(s.text)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left text-sm cursor-pointer"
          >
            <span className="text-base">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

## `FlowHeader` changes

File: `components/flow/flow-header.tsx`. Add two props and an AI button.

```typescript
interface FlowHeaderProps {
  // ... existing props ...
  isAIChatOpen?: boolean
  onToggleAIChat?: () => void
}
```

In the right-section toolbar (between Mode Toggle and Publish), add:

```tsx
{onToggleAIChat && (
  <Button
    variant="ghost"
    size="sm"
    onClick={onToggleAIChat}
    className={cn("gap-1.5 cursor-pointer", isAIChatOpen && "bg-primary/10 text-primary")}
    aria-label="Toggle AI chat panel"
    aria-pressed={isAIChatOpen}
  >
    <Sparkles className="w-4 h-4" />
    AI
  </Button>
)}
```

## Page integration

File: `app/flow/[id]/page.tsx`.

### Add state for panel open/close

```typescript
const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(() => {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem("magic-flow-ai-chat-open") === "true"
  } catch {
    return false
  }
})

// Persist on change
useEffect(() => {
  try {
    localStorage.setItem("magic-flow-ai-chat-open", String(isAIChatOpen))
  } catch { /* quota */ }
}, [isAIChatOpen])

const toggleAIChat = useCallback(() => setIsAIChatOpen(prev => !prev), [])
```

### Remove the bottom `<Panel>` containing AIAssistant

Delete approximately lines 765-778 (the `<Panel position="bottom-center">...<AIAssistant /></Panel>` block).

### Render the wrapper in the flex chain

Find where `<PropertiesPanelWrapper>` is rendered (approximately lines 848-866). `<AISuggestionsPanel>` is rendered just before it (~lines 828-846). Insert `<AIChatPanelWrapper>` **before `<AISuggestionsPanel>`** — visual order is canvas → AI chat → suggestions → properties.

```tsx
<AIChatPanelWrapper
  isOpen={isAIChatOpen}
  onClose={() => setIsAIChatOpen(false)}
  flowId={flowId}
  platform={platform}
  flowContext={persistence.currentFlow?.description}
  existingFlow={{ nodes, edges }}
  selectedNode={nodeOps.selectedNode}
  onApplyFlow={flowAI.handleApplyFlow}
  onUpdateFlow={flowAI.handleUpdateFlow}
  publishedFlowId={persistence.currentFlow?.publishedFlowId}
  waAccountId={persistence.currentFlow?.waAccountId}
/>

<AISuggestionsPanel
  /* ... existing props ... */
/>

<PropertiesPanelWrapper
  /* ... existing props ... */
/>
```

### Pass toggle to FlowHeader

```tsx
<FlowHeader
  /* ... existing props ... */
  isAIChatOpen={isAIChatOpen}
  onToggleAIChat={toggleAIChat}
/>
```

### Pass toggle to `useClipboard`

```typescript
useClipboard({
  /* ... existing params ... */
  onToggleAIChat: toggleAIChat,
})
```

## Keyboard shortcut + guard

File: `hooks/use-clipboard.ts`.

### Update `isInsideGuardedElement`

```typescript
function isInsideGuardedElement(element: Element | null): boolean {
  if (!element) return false
  return !!(
    element.closest("input") ||
    element.closest("textarea") ||
    element.closest("[contenteditable]") ||
    element.closest("[role='dialog']") ||
    element.closest("[data-panel='properties']") ||
    element.closest("[data-panel='ai-chat']") ||  // NEW
    element.closest("[role='listbox']") ||
    element.closest("[role='menu']")
  )
}
```

### Add Cmd+I handler

Add a new param to `UseClipboardParams`:
```typescript
onToggleAIChat?: () => void
```

Inside the existing keyboard event handler (after other guards, before the clipboard handlers):

```typescript
// Toggle AI chat panel (Cmd+I / Ctrl+I)
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
  // Don't fire when user is in an input field or guarded element
  if (isInsideGuardedElement(e.target as Element)) return
  if (isInsideGuardedElement(document.activeElement as Element)) return
  e.preventDefault()
  onToggleAIChat?.()
  return
}
```

## AISuggestionsPanel coexistence

`components/ai/ai-suggestions-panel.tsx` is a separate 320px right-rail panel that opens when the user selects a node and asks for suggestions. Three right-rail panels can now exist simultaneously:

```
1280px screen: 220 (sidebar) + 440 (AI chat) + 320 (suggestions) + 320 (properties) = overflow
```

This is acknowledged but NOT addressed in this PR. Users close panels manually. Future work (Phase B.2 or later): auto-close the least-recently-used panel when a new one opens on narrow screens.

## localStorage persistence

No changes to the persistence pattern. Current behavior preserved:
- Key: `magic-flow-chat-{flowId}`
- Format: `Message[]` (our custom format, unchanged)
- Write: useEffect on `messages` change, skipped while `messages.some(m => m.isStreaming)`
- Read: `useState` initializer, with new filter to strip the legacy `GREETING_MESSAGE` if present

New localStorage keys added by this PR:
- `magic-flow-ai-chat-width` — number (panel width in px, persisted on drag end)
- `magic-flow-ai-chat-open` — boolean string (panel open state)

## Files Changed

| File | Type | Changes |
|------|------|---------|
| `package.json` | Modify | Add deps from `ai-elements` install (streamdown, @streamdown/cjk, @streamdown/code, @streamdown/math, @streamdown/mermaid, use-stick-to-bottom, motion, shiki, @radix-ui/react-use-controllable-state) |
| `components/ai-elements/message.tsx` | NEW (install) | Trim to `Message`, `MessageContent`, `MessageResponse` only; delete `MessageAction*`, `MessageBranch*`, `MessageToolbar` and their imports. ~80 lines final. |
| `components/ai-elements/reasoning.tsx` | NEW (install) | As-is |
| `components/ai-elements/conversation.tsx` | NEW (install) | As-is |
| `components/ai-elements/shimmer.tsx` | NEW (install) | As-is (dep of Reasoning) |
| `components/ui/button-group.tsx` | NEW (install) | Delete after message.tsx trim (no consumers) |
| `components/ai/ai-chat-panel-wrapper.tsx` | NEW | Side panel layout, drag handle, width persistence, always-mounted inner component toggled via `display: none` |
| `components/ai/ai-empty-state.tsx` | NEW | Plain flex hero + context-aware suggestion pills (NOT using ConversationEmptyState) |
| `components/ai/ai-assistant.tsx` | Refactor | Delete dead effects (click-outside, width measurement, scroll throttle, isFocused, GREETING_MESSAGE, auto-expand, seenMessageIds). Replace JSX with shadcn/ai components. Branch user vs assistant rendering. Add AbortController unmount cleanup. Add `isPanelOpen` prop for auto-focus. Delete `setIsFocused` calls in result handler (no auto-close). Preserve `handleSend`, stream reader, `updateStreamingMessage`, tool definitions, localStorage, `useAccounts`, `userTemplates`, `appliedMessageIds`. |
| `components/flow/flow-header.tsx` | Modify | Add `isAIChatOpen` / `onToggleAIChat` props + AI toggle button between Mode Toggle and Publish |
| `app/flow/[id]/page.tsx` | Modify | Add `isAIChatOpen` state with localStorage persistence, remove bottom `<Panel>` for AIAssistant, render `<AIChatPanelWrapper>` in flex chain BEFORE `<AISuggestionsPanel>`, pass toggle to FlowHeader, pass `onToggleAIChat` to `useClipboard` |
| `hooks/use-clipboard.ts` | Modify | Add `[data-panel='ai-chat']` to `isInsideGuardedElement`; add `Cmd+I` handler via `onToggleAIChat` param |

## Files NOT Changed

- `app/api/ai/flow-assistant/route.ts` — NDJSON stream stays
- `lib/ai/tools/generate-flow.ts` — transport logic stays
- `lib/ai/tools/generate-flow-edit.ts` — edit mode stays
- `lib/ai/tools/generate-flow-create-streaming.ts` — create mode stays
- `lib/ai/tools/flow-prompts.ts` — prompts and `sanitizeUnicode` stay
- `lib/ai/core/*` — models, AI client, node docs stay
- `utils/flow-plan-builder.ts` — builders stay
- `components/ai/ai-suggestions-panel.tsx` — suggestions panel stays
- Phase A tests in `lib/ai/__tests__/phase-a.test.ts` — still valid (only check strings that survive the refactor: `publishedFlowId?: string`, `waAccountId?: string`, `getAccessToken`, `"Authorization"`)

## Risks and Mitigations

### R1. `message.tsx` install has 3 TypeScript errors (`icon-sm` variant)
**Mitigation:** Post-install fix documented — trim `MessageAction*`, `MessageBranch*`, `MessageToolbar` exports and their imports. Implementer runs `npx tsc --noEmit` after the trim to verify.

### R2. Users with existing localStorage see a lingering `GREETING_MESSAGE`
**Mitigation:** The new `useState` initializer filters out any message matching the old greeting (id === "1" and role === "assistant" and content starts with "Hi! I'm your Freestand AI"). One-time cleanup on first load after deploy.

### R3. Three right-rail panels (chat + suggestions + properties) on narrow screens
**Mitigation:** Documented as known limitation. Out of scope. Users close panels manually.

### R4. `<Reasoning>` auto-collapse timing on restored messages
**Mitigation:** `Reasoning` auto-closes 1s after `isStreaming` transitions `true → false`. For restored messages, `isStreaming` is always `false` from init, so the transition never happens and auto-close never fires. The `defaultOpen={!!msg.isStreaming}` prop handles the initial state — restored messages get `defaultOpen={false}` → collapsed with "Thought for a few seconds" text (duration unknown since we don't persist it). Acceptable.

### R5. `<Conversation>` uses `use-stick-to-bottom` with no children (empty state)
**Mitigation:** `StickToBottom.Content` is just a scroll container — rendering the empty state inside it is fine. Tested in spike.

### R6. Streamdown CSS clashes with our design tokens
**Mitigation:** Streamdown uses its own minimal CSS (not `prose`). Tested in spike with bold/lists/code — works. If clashes surface during implementation, override via `className` on `MessageResponse`.

### R7. Removing `isFocused` breaks auto-focus textarea on panel open
**Mitigation:** New `isPanelOpen` prop passed from wrapper to AIAssistant. Effect fires on `isPanelOpen` transition true, focuses `inputRef` after 50ms delay (to let `display: none → flex` transition settle).

### R8. Closing panel mid-stream leaks the fetch (but does NOT unmount)
**Mitigation:** Since the component is always mounted (wrapper uses `display: none`, not conditional render), closing the panel does NOT abort the stream. The AI keeps generating in the background. The user reopens the panel and sees the completed response. **This is intentional** — matches how Cursor handles it. The mount cleanup effect is added as a safety net for React unmount (page navigation, etc.).

### R9. Brand color on user message bubble
**Mitigation:** Override `MessageContent` className with `group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground` to preserve the brand blue for user messages. Verified that shadcn/ai's `.is-user` class selector works with this pattern.

## Testing

### Manual smoke test (after implementation)

1. **Open/close** — click AI button in FlowHeader → panel slides in. Click X → slides out. Press Cmd+I → toggles. Width persists across reloads. Verify the `AIAssistant` component stays mounted (check React DevTools).
2. **Resize** — drag left edge → cursor changes, panel width updates, persists after reload.
3. **Empty state** — open a new flow with no chat history → hero (Sparkles + title + description) + 3 suggestion pills render. Click a suggestion → it submits as a user message.
4. **Streaming edit** — send a message on an existing flow → thinking dots appear → Reasoning block with tool step rows appears → tool rows transition from spinner to check → message text streams via streamdown → Reasoning auto-collapses 1s after stream ends to "Thought for Xs".
5. **Markdown rendering** — AI response with `**bold**`, lists, code blocks renders correctly (not as literal text).
6. **User message no-markdown** — type `**not bold**` as user → renders as literal text.
7. **Create mode** — empty flow, ask AI to create something → flow applies to canvas → **chat stays open** showing the AI's confirmation. User closes manually.
8. **Close mid-stream** — start a stream, close the panel → stream keeps running in background → reopen panel → message shows completed (no loss).
9. **Abort via new message** — send a message, then send another while the first is streaming → first aborts cleanly, second runs.
10. **Persistence** — send a message, close the panel, refresh the page, open the panel → message is still there (no greeting prefixed).
11. **Three panels coexistence** — open chat + click a node → all three right-rail panels visible, canvas shrinks to fit.
12. **Keyboard guard** — type in chat textarea, press Cmd+Z → does NOT undo canvas. Press Cmd+V → does NOT paste nodes. Press Delete → does NOT delete selected canvas nodes. Press Cmd+I → does NOT insert italic character, DOES toggle panel.
13. **Phase A features** — `trigger_flow` still works. `list_variables` still available. `undo_last` still works.
14. **User message brand color** — user messages render with `bg-primary` (blue) not `bg-secondary` (gray).
15. **Retry on error** — simulate a failed request → error message appears with Retry button → click retry → resends successfully.
16. **Manual Apply Flow** — if the AI returns flow data that isn't auto-applied (rare) → "Apply Flow" button appears → click → flow applies → button becomes "Applied".

### Automated tests

No new tests. Existing Phase A tests in `lib/ai/__tests__/phase-a.test.ts` remain valid since we didn't change tool implementations. The tests check for these strings in `ai-assistant.tsx`: `publishedFlowId?: string`, `waAccountId?: string`, `getAccessToken`, `"Authorization"` — all survive the refactor.

## Out of Scope (explicit)

- `useChat` hook migration — deferred to potential Phase B.1b
- `UIMessage` parts format — deferred
- Tool consolidation (`apply_and_validate` merge) — skipped, actively regresses inspection-after-failed-edit
- Database storage for conversations — Phase B.2
- Multi-turn `messages[]` array in request — deferred
- Mobile responsive drawer — desktop-first
- Model selector — single model (Sonnet)
- Conversation search / history navigation / export — future
- Attachment support — no backend, no UI
- Regenerate / branching — no thumbs up/down, no branch navigation
- Auto-close AISuggestionsPanel when chat opens — tri-panel overflow acknowledged but unaddressed
- Timestamps in chat bubbles — intentionally removed for cleaner UI (still stored on Message objects)
- `<Tool>` collapsible cards — replaced with plain `<div>` rows (we have no JSON input/output to expand to)
- `ConversationEmptyState` component — replaced with custom `<AIEmptyState>` (the component ignores title/description when children are provided)
