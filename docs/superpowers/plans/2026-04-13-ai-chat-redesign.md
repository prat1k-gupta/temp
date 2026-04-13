# AI Chat UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating bottom-center AI chat panel with a right-side resizable panel rendered via `ai-elements` shadcn components. Add markdown rendering, collapsible thinking blocks, toggle button in FlowHeader, and Cmd+I shortcut.

**Architecture:** Install `ai-elements` registry for Message/Conversation/Reasoning primitives. Wrap `AIAssistant` in a new `AIChatPanelWrapper` that mirrors `PropertiesPanelWrapper` (drag-resize, always-mounted inner, `display: none` when closed). Refactor the rendering tree in `AIAssistant` to use the new components. Preserve `handleSend`, NDJSON stream reader, `updateStreamingMessage`, and all tool logic unchanged.

**Tech Stack:** shadcn/ai (vercel ai-elements), `streamdown` markdown, `use-stick-to-bottom`, framer motion, Tailwind v4, React 18, Next.js 14

**Spec:** `docs/superpowers/specs/2026-04-13-ai-chat-redesign-design.md`

---

### Task 1: Install ai-elements components via CLI

**Files:**
- Create: `components/ai-elements/message.tsx` (via CLI)
- Create: `components/ai-elements/reasoning.tsx` (via CLI)
- Create: `components/ai-elements/conversation.tsx` (via CLI)
- Create: `components/ai-elements/shimmer.tsx` (via CLI, dep of Reasoning)
- Create: `components/ui/button-group.tsx` (via CLI, dep of message.tsx)
- Modify: `package.json` (deps added automatically)

- [ ] **Step 1: Install the `message` component**

Run (answer "n" to any prompts about overwriting existing files):
```bash
yes "n" | /opt/homebrew/bin/npx --yes ai-elements@latest add message
```

Expected: `✔ Created 2 files: components/ui/button-group.tsx, components/ai-elements/message.tsx` plus "Skipped" entries for files like `button.tsx`, `separator.tsx`, `tooltip.tsx`.

- [ ] **Step 2: Install the `reasoning` component**

```bash
yes "n" | /opt/homebrew/bin/npx --yes ai-elements@latest add reasoning
```

Expected: `✔ Created 2 files: components/ai-elements/shimmer.tsx, components/ai-elements/reasoning.tsx`.

- [ ] **Step 3: Install the `conversation` component**

```bash
yes "n" | /opt/homebrew/bin/npx --yes ai-elements@latest add conversation
```

Expected: `✔ Created 1 file: components/ai-elements/conversation.tsx`.

- [ ] **Step 4: Verify package.json additions**

```bash
git diff package.json
```

Expected to see these new dependencies added:
- `@radix-ui/react-use-controllable-state`
- `@streamdown/cjk`, `@streamdown/code`, `@streamdown/math`, `@streamdown/mermaid`
- `motion`
- `shiki`
- `streamdown`
- `use-stick-to-bottom`

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: clean install, no errors.

- [ ] **Step 6: TypeScript check — `message.tsx` should have 3 errors**

```bash
npx tsc --noEmit
```

Expected:
```
components/ai-elements/message.tsx (3 errors)
  L90: TS2322 Type '"icon-sm"' is not assignable...
  L268: TS2322 Type '"icon-sm"' is not assignable...
  L291: TS2322 Type '"icon-sm"' is not assignable...
```

These are expected — they get fixed in Task 2 by trimming the unused components.

- [ ] **Step 7: Commit the install**

```bash
git add components/ai-elements/ components/ui/button-group.tsx package.json package-lock.json
git commit -m "chore: install ai-elements components (message, reasoning, conversation)"
```

---

### Task 2: Trim `message.tsx` to only exports we use

**Files:**
- Modify: `components/ai-elements/message.tsx`
- Delete: `components/ui/button-group.tsx` (after trim — no consumers)

- [ ] **Step 1: Replace `message.tsx` with the trimmed version**

Overwrite `components/ai-elements/message.tsx` with:

```typescript
"use client"

import { cn } from "@/lib/utils"
import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import type { UIMessage } from "ai"
import type { ComponentProps, HTMLAttributes } from "react"
import { memo } from "react"
import { Streamdown } from "streamdown"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"]
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageResponseProps = ComponentProps<typeof Streamdown>

const streamdownPlugins = { cjk, code, math, mermaid }

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children
)

MessageResponse.displayName = "MessageResponse"
```

- [ ] **Step 2: Delete `button-group.tsx` (no longer has consumers)**

```bash
rm components/ui/button-group.tsx
```

- [ ] **Step 3: TypeScript check — should be clean**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: `TypeScript compilation completed` with no errors. If errors remain, any remaining references to `MessageAction`, `MessageBranch`, `MessageToolbar`, or `button-group` need to be removed.

- [ ] **Step 4: Commit the trim**

```bash
git add components/ai-elements/message.tsx components/ui/button-group.tsx
git commit -m "chore: trim message.tsx to Message/MessageContent/MessageResponse only"
```

---

### Task 3: Create `AIEmptyState` component

**Files:**
- Create: `components/ai/ai-empty-state.tsx`

- [ ] **Step 1: Create the file**

Create `components/ai/ai-empty-state.tsx` with:

```typescript
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

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/ai/ai-empty-state.tsx
git commit -m "feat(ai): add AIEmptyState component with context-aware suggestions"
```

---

### Task 4: Create `AIChatPanelWrapper` component

**Files:**
- Create: `components/ai/ai-chat-panel-wrapper.tsx`

- [ ] **Step 1: Create the wrapper file**

Create `components/ai/ai-chat-panel-wrapper.tsx` with:

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
  onApplyFlow?: (
    flowData: { nodes: any[]; edges: any[]; nodeOrder?: string[] },
    meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }
  ) => void
  onUpdateFlow?: (
    updates: {
      nodes?: any[]
      edges?: any[]
      description?: string
      removeNodeIds?: string[]
      removeEdges?: any[]
      positionShifts?: Array<{ nodeId: string; dx: number }>
    },
    meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }
  ) => void
  publishedFlowId?: string
  waAccountId?: string
}

export function AIChatPanelWrapper({
  isOpen,
  onClose,
  flowId,
  platform,
  flowContext,
  existingFlow,
  selectedNode,
  onApplyFlow,
  onUpdateFlow,
  publishedFlowId,
  waAccountId,
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
      try {
        localStorage.setItem(STORAGE_KEY_WIDTH, String(panelWidth))
      } catch { /* quota */ }
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
      {/* Drag handle — always mounted, hidden when closed */}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 cursor-pointer"
            aria-label="Close AI chat panel"
          >
            <CloseIcon className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden">
          <AIAssistant
            flowId={flowId}
            platform={platform}
            flowContext={flowContext}
            existingFlow={existingFlow}
            selectedNode={selectedNode}
            onApplyFlow={onApplyFlow}
            onUpdateFlow={onUpdateFlow}
            publishedFlowId={publishedFlowId}
            waAccountId={waAccountId}
            isPanelOpen={isOpen}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check — expect 1 error for `isPanelOpen` prop**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: error about `isPanelOpen` not being on `AIAssistantProps`. That's OK — we add it in Task 5.

- [ ] **Step 3: Commit (even with the error — we're splitting the change)**

```bash
git add components/ai/ai-chat-panel-wrapper.tsx
git commit -m "feat(ai): add AIChatPanelWrapper with drag-resize and always-mounted inner

The wrapper owns open/close state via isOpen prop and width via drag handle.
Inner AIAssistant is always mounted with visibility toggled via display: none
to preserve stream state, input draft, and appliedMessageIds across open/close."
```

---

### Task 5: Refactor `AIAssistant` — delete dead effects, add `isPanelOpen` prop

**Files:**
- Modify: `components/ai/ai-assistant.tsx`

This task only deletes dead code and adds the `isPanelOpen` prop + focus effect. Rendering stays unchanged for now (next task). After this task, the panel wrapper compiles.

- [ ] **Step 1: Delete the `GREETING_MESSAGE` constant and initial state seeding**

In `components/ai/ai-assistant.tsx`, delete lines defining `GREETING_MESSAGE`:

```typescript
// DELETE
const GREETING_MESSAGE: Message = {
  id: "1",
  role: "assistant",
  content: "Hi! I'm your Freestand AI Assistant. I can help you create or edit flows. What would you like to do?",
  timestamp: new Date(),
}
```

- [ ] **Step 2: Update the messages `useState` initializer**

Replace the current messages init block:

```typescript
// BEFORE
const [messages, setMessages] = useState<Message[]>(() => {
  if (flowId && typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${flowId}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false }))
      }
    } catch { /* ignore corrupted storage */ }
  }
  return [GREETING_MESSAGE]
})
```

With:

```typescript
// AFTER
const [messages, setMessages] = useState<Message[]>(() => {
  if (!flowId || typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${flowId}`)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false }))
      // Strip legacy hardcoded greeting if still in storage
      .filter((m: any) => !(m.role === "assistant" && m.id === "1" && m.content?.startsWith("Hi! I'm your Freestand AI")))
  } catch {
    return []
  }
})
```

- [ ] **Step 3: Delete `isFocused` state and all its effects**

Delete:
```typescript
const [isFocused, setIsFocused] = useState(false)
```

Delete the auto-focus effect (the one that calls `setTimeout(() => inputRef.current?.focus(), 100)` when `isFocused` changes).

Delete the auto-expand-on-new-flowData effect (uses `seenMessageIds`).

Delete the click-outside-to-collapse `useEffect` (the one with `handleClickOutside` that sets up `document.addEventListener("mousedown", ...)`).

Delete the `seenMessageIds` state:
```typescript
const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 4: Delete the width measurement state and effects**

Delete:
```typescript
const chatContainerRef = useRef<HTMLDivElement>(null)
const [containerWidth, setContainerWidth] = useState<number | null>(null)
```

Delete the two effects that measure `chatContainerRef.current.offsetWidth` and set `containerWidth`.

- [ ] **Step 5: Delete the scroll throttle state and effects**

Delete:
```typescript
const scrollThrottleRef = useRef<number | null>(null)
```

Delete the scroll-related `useEffect` that uses `scrollThrottleRef` and calls `requestAnimationFrame`.

Delete the `scrollToBottom` callback (no longer used — `Conversation` handles it).

Keep `scrollContainerRef` and `messagesEndRef` for now — they're referenced by JSX that we'll replace in Task 6.

- [ ] **Step 6: Add `isPanelOpen` prop to `AIAssistantProps`**

Add to `AIAssistantProps`:

```typescript
interface AIAssistantProps {
  // ... existing props ...
  isPanelOpen?: boolean  // NEW — auto-focus textarea when panel opens
}
```

Add to the function signature destructure:

```typescript
export function AIAssistant({
  // ... existing props ...
  isPanelOpen,
}: AIAssistantProps) {
```

- [ ] **Step 7: Add the auto-focus-on-panel-open effect**

After the other `useEffect` hooks, add:

```typescript
// Auto-focus textarea when panel opens (after display:none → display:flex)
useEffect(() => {
  if (isPanelOpen) {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }
}, [isPanelOpen])
```

- [ ] **Step 8: Add AbortController cleanup on unmount**

After the new focus effect, add:

```typescript
// Abort in-flight stream on unmount (safety net)
useEffect(() => {
  return () => {
    abortControllerRef.current?.abort()
  }
}, [])
```

- [ ] **Step 9: Remove `setIsFocused` calls from `handleSend` and the result handler**

Search for all `setIsFocused(` calls and delete them:
- In `handleSend` near the top: delete `if (!isFocused) setIsFocused(true)`
- In the `result` event case: delete `setIsFocused(false)` (create branch) and `setIsFocused(true)` (non-auto-apply branch)

After these deletions, the result case branches become:

```typescript
// Apply to canvas
if (isAutoApplyCreate) {
  onApplyFlow!(data.flowData!, meta)
} else if (isAutoApplyEdit) {
  onUpdateFlow!(data.updates!, meta)
}
// Third branch `else if (data.flowData) { setIsFocused(true) }` is fully deleted
```

- [ ] **Step 10: Remove `Card`, `ChevronDown`, `Sparkles` from imports**

Delete these imports:

```typescript
// DELETE
import { Card } from "@/components/ui/card"
```

From the lucide-react import, remove `ChevronDown` and `Sparkles`:

```typescript
// BEFORE
import { Send, ChevronDown, Sparkles, Loader2, RotateCcw, Check } from "lucide-react"

// AFTER
import { Send, Loader2, RotateCcw, Check } from "lucide-react"
```

- [ ] **Step 11: TypeScript check — expect errors about deleted state references**

```bash
npx tsc --noEmit 2>&1 | tail -30
```

Expected: errors about `isFocused`, `setIsFocused`, `seenMessageIds`, `chatContainerRef`, `containerWidth`, `scrollThrottleRef`, `scrollToBottom`, `Card`, `ChevronDown`, `Sparkles` not existing in the file (they're still referenced in JSX which we'll replace in Task 6).

**Leave the errors for now** — the next task replaces the JSX entirely.

- [ ] **Step 12: Commit the state/effects deletion**

```bash
git add components/ai/ai-assistant.tsx
git commit -m "refactor(ai): delete dead chat effects and state, add isPanelOpen prop

- Delete isFocused, seenMessageIds, containerWidth, scrollThrottleRef
- Delete click-outside handler, auto-expand, width measurement, scroll throttle effects
- Delete GREETING_MESSAGE initial seed, filter legacy greeting from restore
- Remove setIsFocused calls from handleSend and result handler
- Add isPanelOpen prop for auto-focus-on-open
- Add AbortController unmount cleanup

JSX still references deleted state — fixed in the next commit."
```

---

### Task 6: Replace `AIAssistant` render tree with shadcn/ai components

**Files:**
- Modify: `components/ai/ai-assistant.tsx`

- [ ] **Step 1: Add the shadcn/ai imports**

Add to the top of `components/ai/ai-assistant.tsx`:

```typescript
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Reasoning, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import { CollapsibleContent } from "@/components/ui/collapsible"
import { AIEmptyState } from "@/components/ai/ai-empty-state"
```

- [ ] **Step 2: Delete the `renderNodePreview` helper**

It's dead code in the new render tree. Delete the entire `renderNodePreview` function.

- [ ] **Step 3: Replace the full JSX return block**

Find the current `return (` block in `AIAssistant` (around line 475-800) and replace everything from the opening `return (` to the closing `)` with this new tree:

```tsx
return (
  <div className="flex flex-col h-full">
    <Conversation className="flex-1">
      <ConversationContent>
        {messages.length === 0 ? (
          <AIEmptyState
            hasRealNodes={(existingFlow?.nodes || []).some((n: any) => n.type !== "start")}
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetry}
                      className="cursor-pointer"
                    >
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
                        setAppliedMessageIds((prev) => new Set(prev).add(msg.id))
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
          onChange={(e) => {
            if (!isLoading) setInput(e.target.value)
          }}
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
)
```

- [ ] **Step 4: Remove any still-dead refs**

After the JSX replacement, `messagesEndRef` and `scrollContainerRef` are no longer referenced. Delete them:

```typescript
// DELETE these lines if still present
const messagesEndRef = useRef<HTMLDivElement>(null)
const scrollContainerRef = useRef<HTMLDivElement>(null)
```

Also delete `inputBarRef` if no longer referenced:

```typescript
const inputBarRef = useRef<HTMLDivElement>(null)  // delete if unused
```

- [ ] **Step 5: TypeScript check — should be clean**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: `TypeScript compilation completed` with no errors.

- [ ] **Step 6: Commit the render tree replacement**

```bash
git add components/ai/ai-assistant.tsx
git commit -m "feat(ai): render chat with shadcn/ai Message, Conversation, Reasoning

- Replaces custom bubbles with shadcn/ai Message/MessageContent/MessageResponse
- Markdown rendering via streamdown for assistant messages
- User messages render as plain div (no markdown parsing) with brand blue bg
- Tool steps grouped under <Reasoning> collapsible, rendered as plain div rows
- Auto-scroll via <Conversation>'s use-stick-to-bottom
- Empty state shows <AIEmptyState> with context-aware suggestions
- Preserves handleSend, stream reader, updateStreamingMessage unchanged"
```

---

### Task 7: Add `[data-panel='ai-chat']` to `isInsideGuardedElement` + Cmd+I handler

**Files:**
- Modify: `hooks/use-clipboard.ts`

- [ ] **Step 1: Add `data-panel='ai-chat'` to `isInsideGuardedElement`**

In `hooks/use-clipboard.ts`, find the `isInsideGuardedElement` function (around line 8) and add the new selector:

```typescript
// BEFORE
function isInsideGuardedElement(element: Element | null): boolean {
  if (!element) return false
  return !!(
    element.closest("input") ||
    element.closest("textarea") ||
    element.closest("[contenteditable]") ||
    element.closest("[role='dialog']") ||
    element.closest("[data-panel='properties']") ||
    element.closest("[role='listbox']") ||
    element.closest("[role='menu']")
  )
}

// AFTER
function isInsideGuardedElement(element: Element | null): boolean {
  if (!element) return false
  return !!(
    element.closest("input") ||
    element.closest("textarea") ||
    element.closest("[contenteditable]") ||
    element.closest("[role='dialog']") ||
    element.closest("[data-panel='properties']") ||
    element.closest("[data-panel='ai-chat']") ||
    element.closest("[role='listbox']") ||
    element.closest("[role='menu']")
  )
}
```

- [ ] **Step 2: Add `onToggleAIChat` to `UseClipboardParams`**

Update the interface (around line 21):

```typescript
interface UseClipboardParams {
  // ... existing params ...
  onToggleAIChat?: () => void
}
```

- [ ] **Step 3: Destructure the new param in `useClipboard`**

Add to the destructure block (around line 49-67):

```typescript
export function useClipboard({
  // ... existing params ...
  onToggleAIChat,
}: UseClipboardParams) {
```

- [ ] **Step 4: Add the Cmd+I handler inside the existing keydown handler**

Find the `handleKeyDown` function (around line 209) and add the Cmd+I handler near the top, **before** the `if (guarded) return` line but after the undo/redo handlers. The undo/redo handlers already run before the guard, so put Cmd+I next to them:

```typescript
// Undo: Cmd+Z (no shift)
if (isCtrlOrCmd && event.key === "z" && !event.shiftKey && !guarded) {
  event.preventDefault()
  undo?.()
  return
}

// Redo: Cmd+Shift+Z
if (isCtrlOrCmd && event.key === "z" && event.shiftKey && !guarded) {
  event.preventDefault()
  redo?.()
  return
}

// Toggle AI chat panel: Cmd+I (guarded — not fired when inside input/panel)
if (isCtrlOrCmd && event.key.toLowerCase() === "i" && !guarded) {
  event.preventDefault()
  onToggleAIChat?.()
  return
}

if (guarded) return
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add hooks/use-clipboard.ts
git commit -m "feat(clipboard): add ai-chat guarded element + Cmd+I toggle shortcut"
```

---

### Task 8: Add AI toggle button to `FlowHeader`

**Files:**
- Modify: `components/flow/flow-header.tsx`

- [ ] **Step 1: Add two props to `FlowHeaderProps`**

In `components/flow/flow-header.tsx` (around line 95-146), add to the interface:

```typescript
interface FlowHeaderProps {
  // ... existing props ...
  isAIChatOpen?: boolean
  onToggleAIChat?: () => void
}
```

- [ ] **Step 2: Destructure the new props**

In the `FlowHeader` function signature (around line 148-199), add to the destructure:

```typescript
export function FlowHeader({
  // ... existing props ...
  isAIChatOpen,
  onToggleAIChat,
}: FlowHeaderProps) {
```

- [ ] **Step 3: Import `Sparkles` icon**

The file already imports from `lucide-react`. Add `Sparkles` to the existing import if not already present:

```typescript
// If not already imported:
import { ..., Sparkles } from "lucide-react"
```

Check with `grep "Sparkles" components/flow/flow-header.tsx` before adding.

- [ ] **Step 4: Add the AI button between Mode Toggle separator and PublishModal**

Find the separator line `<div className="h-5 w-px bg-border mx-1" />` (around line 326) and insert the button AFTER it, BEFORE `<PublishModal ...>`:

```tsx
<div className="h-5 w-px bg-border mx-1" />

{/* AI Toggle Button */}
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

{/* Publish Button */}
<PublishModal
  ...
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/flow/flow-header.tsx
git commit -m "feat(flow-header): add AI chat toggle button with active highlight"
```

---

### Task 9: Integrate `AIChatPanelWrapper` into the flow page

**Files:**
- Modify: `app/flow/[id]/page.tsx`

- [ ] **Step 1: Add `AIChatPanelWrapper` import**

Near the top of `app/flow/[id]/page.tsx`:

```typescript
// Find the existing import:
import { AISuggestionsPanel, AIAssistant } from "@/components/ai"

// Replace with (drop AIAssistant — no longer rendered directly):
import { AISuggestionsPanel } from "@/components/ai"
import { AIChatPanelWrapper } from "@/components/ai/ai-chat-panel-wrapper"
```

- [ ] **Step 2: Add `isAIChatOpen` state with localStorage persistence**

Find a good spot after the other `useState` calls in `MagicFlowInner` (near where `isFlowGraphPanelOpen` lives). Add:

```typescript
const [isAIChatOpen, setIsAIChatOpen] = useState<boolean>(() => {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem("magic-flow-ai-chat-open") === "true"
  } catch {
    return false
  }
})

useEffect(() => {
  try {
    localStorage.setItem("magic-flow-ai-chat-open", String(isAIChatOpen))
  } catch { /* quota */ }
}, [isAIChatOpen])

const toggleAIChat = useCallback(() => setIsAIChatOpen((prev) => !prev), [])
```

- [ ] **Step 3: Delete the bottom `<Panel>` containing `<AIAssistant>`**

Find lines 765-778 (the `<Panel position="bottom-center" className="mb-4">...<AIAssistant ... /></Panel>` block) and delete the entire Panel including the AIAssistant inside it.

- [ ] **Step 4: Render `<AIChatPanelWrapper>` before `<AISuggestionsPanel>`**

Find the AI Suggestions Panel block (around lines 827-846). **Insert the AI chat wrapper immediately before it** so the flex order is: canvas → AI chat → suggestions → properties.

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

{/* AI Suggestions Panel */}
<div
  className={`transition-all duration-300 ease-in-out ${
    flowAI.isAISuggestionsPanelOpen ? "w-80" : "w-0"
  } overflow-hidden bg-background border-r border-border`}
>
  <AISuggestionsPanel ... />
</div>
```

- [ ] **Step 5: Pass the toggle props to `FlowHeader`**

Find the `<FlowHeader ...>` render and add two props:

```tsx
<FlowHeader
  // ... existing props ...
  isAIChatOpen={isAIChatOpen}
  onToggleAIChat={toggleAIChat}
/>
```

- [ ] **Step 6: Pass `onToggleAIChat` to `useClipboard`**

Find the `useClipboard({...})` call (around line 200) and add the new param:

```typescript
const clipboard = useClipboard({
  // ... existing params ...
  onToggleAIChat: toggleAIChat,
})
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add app/flow/[id]/page.tsx
git commit -m "feat(flow): integrate AIChatPanelWrapper as right-side panel

- Add isAIChatOpen state with localStorage persistence
- Remove bottom <Panel> containing AIAssistant
- Render AIChatPanelWrapper before AISuggestionsPanel (order: canvas → AI → suggestions → properties)
- Pass toggle to FlowHeader and useClipboard (Cmd+I)"
```

---

### Task 10: Run full test suite and smoke test

**Files:**
- None — verification only

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: `TypeScript compilation completed` with no errors.

- [ ] **Step 2: Run the test suite**

```bash
npm run test -- --run
```

Expected: all existing tests pass. Phase A tests (`lib/ai/__tests__/phase-a.test.ts`) check for strings in `ai-assistant.tsx` that survive the refactor (`publishedFlowId?: string`, `waAccountId?: string`, `getAccessToken`, `"Authorization"`) — they should still pass.

If any test fails because of the refactor, DO NOT skip or delete it. Investigate. The most likely failures are the phase-a assertions if you accidentally deleted the auth header logic — restore it.

- [ ] **Step 3: Start the dev server**

```bash
docker compose restart app
```

Wait for `✓ Ready` in the logs:

```bash
docker logs magic-flow-app-1 --tail 10
```

- [ ] **Step 4: Manual smoke test checklist**

Open a flow in the browser and verify each item:

**Panel open/close:**
- [ ] Click the `✦ AI` button in the FlowHeader → panel slides in from the right
- [ ] Click the `×` button in the panel header → panel slides out
- [ ] Press `Cmd+I` (or `Ctrl+I`) → panel toggles
- [ ] Refresh page → panel open state persists
- [ ] Active state on the AI button when panel is open (blue background)

**Panel resize:**
- [ ] Hover the left edge of the panel → cursor changes to horizontal resize
- [ ] Drag left → panel gets wider (up to 800px)
- [ ] Drag right → panel gets narrower (down to 360px)
- [ ] Refresh → width persists

**Empty state (new flow with no chat history):**
- [ ] Hero shows: Sparkles icon, "What can I help you with?" title, description, 3 suggestion pills
- [ ] For an empty canvas: pills show "Create a customer feedback survey...", "Build a product recommendation bot...", "Add user registration..."
- [ ] For a flow with existing nodes: pills show "Add a follow-up question...", "Add conditional routing...", "Review this flow..."
- [ ] Click a suggestion pill → it submits as a user message

**Streaming (edit mode — flow with existing nodes):**
- [ ] Send a message → "Thinking..." dots briefly appear
- [ ] Reasoning block appears with tool step rows (spinner + text)
- [ ] Tool rows transition from spinning to green check as each completes
- [ ] Message content streams in via streamdown (words appear progressively)
- [ ] After streaming ends, Reasoning block auto-collapses 1s later to "Thought for Xs"
- [ ] Click "Thought for Xs" → expands to show the tool rows again

**Markdown rendering:**
- [ ] AI responses with `**bold**` render as **bold**
- [ ] `- list items` render as bulleted list
- [ ] Code blocks with triple backticks render as code blocks
- [ ] User messages with `**asterisks**` render as literal text (not bold)

**User message styling:**
- [ ] User messages appear right-aligned with `bg-primary` (blue) background and white text
- [ ] Assistant messages appear left-aligned with no background

**Create mode:**
- [ ] Empty flow, ask AI to create something → flow applies to canvas
- [ ] Chat panel stays open (does NOT auto-close)
- [ ] Scroll up in chat to read the AI's confirmation message

**Close mid-stream:**
- [ ] Start a stream on a slow request → while streaming, click `×` to close
- [ ] Reopen the panel → the message continues streaming / shows completed content
- [ ] No error, no orphaned state

**Abort via new message:**
- [ ] Send a message while another is streaming → first aborts cleanly, second runs

**Keyboard guard:**
- [ ] Focus the chat textarea
- [ ] Press `Cmd+Z` → does NOT undo canvas actions
- [ ] Press `Cmd+V` → does NOT paste nodes
- [ ] Press `Delete` → does NOT delete selected canvas nodes
- [ ] Press `Cmd+I` while in the textarea → does NOT toggle panel (guarded) — but Cmd+I while focus is on the canvas DOES toggle

**Persistence:**
- [ ] Send a message, close panel, refresh page, open panel → message still shown
- [ ] No "Hi! I'm your Freestand AI Assistant" greeting shown after refresh (legacy greeting stripped)

**Phase A features (regression check):**
- [ ] `trigger_flow` tool still works — ask AI to test a published flow
- [ ] `list_variables` tool still available
- [ ] `undo_last` tool still available

**Three panels coexistence:**
- [ ] Open AI chat (Cmd+I)
- [ ] Click a node → properties panel opens AND AI suggestions panel opens
- [ ] All three right-rail panels visible simultaneously
- [ ] Canvas shrinks to fit
- [ ] Close each → canvas expands back

- [ ] **Step 5: If any smoke test fails, file a follow-up task**

Don't skip the task — fix it. Most likely issues:
- Streamdown CSS conflicts → override via className on `<MessageResponse>`
- `group-[.is-user]:bg-primary` not applying → check the `className` prop on `MessageContent` matches what `Message` wrapper expects
- Reasoning not auto-collapsing → verify `defaultOpen={!!msg.isStreaming}` is set and `isStreaming` transitions false in the result handler
- `[data-panel='ai-chat']` guard not working → verify `data-panel` attribute on the wrapper root, not an inner div

- [ ] **Step 6: Push the branch and create a PR**

```bash
git push -u origin feat/ai-chat-redesign
gh pr create --title "feat: AI chat UI redesign — right-side panel with shadcn/ai" --body "$(cat <<'EOF'
## Summary

- Moves AI chat from floating bottom-center to right-side resizable panel (mirrors PropertiesPanelWrapper)
- Replaces custom message bubbles with shadcn/ai Message, MessageContent, MessageResponse (streamdown markdown)
- Replaces custom tool step list with Reasoning collapsible + plain div rows
- Replaces custom scroll throttle with shadcn/ai Conversation (use-stick-to-bottom)
- Adds AI toggle button in FlowHeader + Cmd+I keyboard shortcut
- Adds context-aware suggestion pills in empty state
- Preserves all streaming logic, tool definitions, and Phase A/B features

## Preserved (zero changes)

- NDJSON stream reader + handleSend
- updateStreamingMessage with ref-based race fix
- AbortController abort logic
- Custom Message format and localStorage persistence
- All tool definitions (apply_edit, validate_result, build_and_validate, trigger_flow, list_variables, undo_last, save_as_template)
- sanitizeUnicode fix
- Server route (NDJSON)

## Test plan

- [ ] Edit mode streaming with tool steps
- [ ] Create mode (panel stays open)
- [ ] Markdown rendering for assistant messages
- [ ] User messages NOT rendered as markdown
- [ ] Resize + persistence
- [ ] Cmd+I toggle
- [ ] Phase A tools still work

Spec: docs/superpowers/specs/2026-04-13-ai-chat-redesign-design.md
EOF
)"
```

Don't push/create the PR if smoke tests failed. Fix first, then push.

---

## Self-Review

**Spec coverage check:**
- Right-side resizable panel mirroring PropertiesPanelWrapper → Task 4
- shadcn/ai components for rendering → Tasks 1, 2, 6
- Real markdown (streamdown) → Task 6 (`<MessageResponse>`)
- Tool steps as plain rows inside Reasoning → Task 6
- Custom empty state with suggestions → Tasks 3, 6
- FlowHeader AI toggle button → Task 8
- Cmd+I keyboard shortcut → Task 7
- Delete dead effects (click-outside, width, scroll throttle, isFocused) → Task 5
- Preserve streaming logic (handleSend, updateStreamingMessage, abort) → Tasks 5, 6 (unchanged)
- Preserve tool definitions → not touched
- Panel order canvas → AI chat → suggestions → properties → Task 9
- `[data-panel='ai-chat']` in isInsideGuardedElement → Task 7
- AbortController unmount cleanup → Task 5
- No auto-close on create → Task 5 (setIsFocused deletions)
- User messages render as plain div (no markdown) → Task 6
- User messages keep brand primary color → Task 6 (className override)
- Smoke test → Task 10

**Placeholder scan:** No "TBD", "TODO", "fill in details", or "similar to Task N" in the plan.

**Type consistency:**
- `AIAssistantProps.isPanelOpen?: boolean` (Task 5) matches `isPanelOpen={isOpen}` (Task 4)
- `AIChatPanelWrapperProps` matches the props passed in Task 9
- `UseClipboardParams.onToggleAIChat?: () => void` (Task 7) matches `onToggleAIChat: toggleAIChat` (Task 9)
- `FlowHeaderProps.isAIChatOpen / onToggleAIChat` (Task 8) matches `isAIChatOpen={isAIChatOpen}` in Task 9
- `formatToolStep` signature unchanged (kept inline in ai-assistant.tsx)
- `Message` interface fields (`toolSteps`, `isStreaming`, `flowData`, etc.) unchanged — render tree uses them as-is

**Risks addressed by tasks:**
- R1 (`icon-sm` errors): Task 2 trims message.tsx
- R2 (legacy greeting): Task 5 filter
- R3 (three panels overflow): out of scope, documented
- R4 (Reasoning timing): defaultOpen={!!msg.isStreaming} in Task 6
- R5 (empty state inside Conversation): Task 6 renders AIEmptyState as a child of ConversationContent
- R6 (streamdown CSS): smoke test catches it; mitigation via className override
- R7 (auto-focus): Task 5 adds isPanelOpen effect
- R8 (orphan fetch on close): Task 4 always-mounts, Task 5 adds unmount cleanup
- R9 (brand color): Task 6 uses `group-[.is-user]:bg-primary` override
