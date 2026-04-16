"use client"

import { Fragment, useState, useRef, useEffect, useCallback, useMemo } from "react"
import { flushSync } from "react-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Loader2, RotateCcw, Check } from "lucide-react"
import { getAllTemplates, getFlow } from "@/utils/flow-storage"
import { apiClient } from "@/lib/api-client"
import { useAccounts } from "@/hooks/queries"
import { flowKeys, versionKeys } from "@/hooks/queries/query-keys"
import { changeTracker } from "@/utils/change-tracker"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import type { TemplateAIMetadata } from "@/types"
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message as ChatMessage, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from "@/components/ai-elements/task"
import { AIEmptyState } from "@/components/ai/ai-empty-state"

type ToolStepDetails =
  | {
      kind: 'edit'
      added: Array<{ type: string; label?: string; preview?: string }>
      removed: Array<{ type: string; label?: string; preview?: string }>
      updated: Array<{ type: string; label?: string; fields: string[] }>
      edgesAdded: number
      edgesRemoved: number
    }
  | {
      kind: 'validate'
      valid: boolean
      issues: Array<{ type?: string; nodeLabel?: string; detail: string }>
    }

type MessagePart =
  | { type: 'text'; value: string }
  | {
      type: 'tool'
      tool: string
      status: 'running' | 'done'
      summary?: string
      details?: ToolStepDetails
      // Epoch ms when the tool entered running state. Used to enforce a
      // minimum visible time on the running spinner so fast local CPU tools
      // (apply_edit, validate_result) don't flip running → done before the
      // browser paints.
      runningAt?: number
      // Synthetic per-invocation id — lets the done handler target the exact
      // running call, not "the first running part that happens to have the
      // same tool name." Matters when the AI calls the same tool twice in
      // one turn (e.g. get_node_details on two nodes) and the done events
      // are deferred past MIN_TOOL_VISIBLE_MS: without a callId match, the
      // first applyDone flips every running row sharing the tool name.
      callId?: number
    }

// Minimum wall-clock time a running tool spinner should remain visible before
// transitioning to done. Pure local tools can complete in <10ms so without
// this the spinner never paints.
const MIN_TOOL_VISIBLE_MS = 350

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  // Chronological stream of text + tool blocks as they arrived. Populated on
  // streaming assistant messages; undefined on user messages and legacy
  // messages restored from localStorage before this field existed.
  parts?: MessagePart[]
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

interface AIAssistantProps {
  flowId?: string
  platform: "web" | "whatsapp" | "instagram"
  flowContext?: string
  existingFlow?: { nodes: any[]; edges: any[] }
  selectedNode?: any
  onApplyFlow?: (flowData: { nodes: any[]; edges: any[]; nodeOrder?: string[] }, meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }) => void
  onUpdateFlow?: (updates: { nodes?: any[]; edges?: any[]; description?: string; removeNodeIds?: string[]; removeEdges?: any[]; positionShifts?: Array<{ nodeId: string; dx: number }> }, meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }) => void
  publishedFlowId?: string
  waAccountId?: string
  waPhoneNumber?: string
  projectName?: string
  triggerKeywords?: string[]
  triggerMatchType?: string
  flowSlug?: string
  isPanelOpen?: boolean
}

const CHAT_STORAGE_PREFIX = "magic-flow-chat-"


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
    case 'build_and_validate': return step.status === 'done' ? 'Flow validated' : 'Building and validating flow...'
    default: return step.tool.replace(/_/g, ' ')
  }
}

function formatToolRunning(tool: string): string {
  switch (tool) {
    case 'get_node_details': return 'Inspecting node…'
    case 'get_node_connections': return 'Checking connections…'
    case 'apply_edit': return 'Applying changes…'
    case 'validate_result': return 'Validating flow…'
    case 'save_as_template': return 'Saving as template…'
    case 'trigger_flow': return 'Sending test message…'
    case 'list_variables': return 'Listing variables…'
    case 'undo_last': return 'Reverting changes…'
    case 'build_and_validate': return 'Building and validating…'
    default: return `Taking action: ${tool.replace(/_/g, ' ')}…`
  }
}

export function AIAssistant({
  flowId,
  platform,
  flowContext,
  existingFlow,
  selectedNode,
  onApplyFlow,
  onUpdateFlow,
  publishedFlowId,
  waAccountId,
  waPhoneNumber,
  projectName,
  triggerKeywords,
  triggerMatchType,
  flowSlug,
  isPanelOpen,
}: AIAssistantProps) {
  const queryClient = useQueryClient()
  // Resolve waAccountId → account name for trigger_flow (backend expects name, not UUID)
  const { data: accounts = [] } = useAccounts()
  const waAccountName = useMemo(() => {
    if (!waAccountId) return undefined
    const account = accounts.find((a) => a.id === waAccountId || a.name === waAccountId)
    return account?.name || waAccountId
  }, [waAccountId, accounts])

  // Collect all templates (default + user-created) for AI context
  const [userTemplates, setUserTemplates] = useState<Array<{ id: string; name: string; aiMetadata?: any }>>(() => {
    return DEFAULT_TEMPLATES.map(t => ({ id: t.id, name: t.name, aiMetadata: t.aiMetadata }))
  })
  // Full template data for the resolver (nodes/edges)
  const [userTemplateData, setUserTemplateData] = useState<Array<{ id: string; name: string; nodes: any[]; edges: any[] }>>(() => {
    return DEFAULT_TEMPLATES.map(t => ({ id: t.id, name: t.name, nodes: t.nodes, edges: t.edges }))
  })
  useEffect(() => {
    getAllTemplates().then(async (templates) => {
      const defaults = DEFAULT_TEMPLATES.map(t => ({ id: t.id, name: t.name, aiMetadata: t.aiMetadata }))
      const userCreated = templates.map(t => ({ id: t.id, name: t.name, aiMetadata: t.aiMetadata }))
      setUserTemplates([...defaults, ...userCreated])

      // Load full data for user templates (for resolver)
      const defaultData = DEFAULT_TEMPLATES.map(t => ({ id: t.id, name: t.name, nodes: t.nodes, edges: t.edges }))
      const userDataPromises = templates.map(async (t) => {
        const full = await getFlow(t.id)
        return full ? { id: t.id, name: t.name, nodes: full.nodes, edges: full.edges } : null
      })
      const userData = (await Promise.all(userDataPromises)).filter(Boolean) as Array<{ id: string; name: string; nodes: any[]; edges: any[] }>
      setUserTemplateData([...defaultData, ...userData])
    }).catch(() => {})
  }, [])

  const [messages, setMessages] = useState<Message[]>([])
  // Hydrate from localStorage after mount — keeping this in useEffect (not useState initializer)
  // avoids server/client hydration mismatch when persisted messages exist.
  useEffect(() => {
    if (!flowId) return
    try {
      const stored = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${flowId}`)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      const restored = parsed
        .map((m: any) => ({ ...m, timestamp: new Date(m.timestamp), isStreaming: false }))
        .filter((m: any) => !(m.role === "assistant" && m.id === "1" && m.content?.startsWith("Hi! I'm your Freestand AI")))
      if (restored.length > 0) setMessages(restored)
    } catch { /* ignore corrupted storage */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [appliedMessageIds, setAppliedMessageIds] = useState<Set<string>>(new Set())
  const lastFailedInputRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingMessageIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const updateStreamingMessage = useCallback((updater: (msg: Message) => Message) => {
    // Capture the id synchronously — the ref may be cleared before React flushes the setMessages callback
    const targetId = streamingMessageIdRef.current
    if (!targetId) return
    setMessages(prev => prev.map(m =>
      m.id === targetId ? updater(m) : m
    ))
  }, [])

  // Persist messages to localStorage (strip large data fields)
  useEffect(() => {
    if (!flowId || typeof window === "undefined" || messages.length <= 1) return
    // Don't persist during streaming — too many updates
    if (messages.some(m => m.isStreaming)) return
    const toStore = messages.map(({ flowData, updates, debugData, ...rest }) => rest)
    try {
      localStorage.setItem(`${CHAT_STORAGE_PREFIX}${flowId}`, JSON.stringify(toStore))
    } catch { /* storage full — ignore */ }
  }, [messages, flowId])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Auto-focus textarea when panel opens (after display:none → display:flex)
  useEffect(() => {
    if (isPanelOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isPanelOpen])

  // Abort in-flight stream on unmount (safety net)
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleSend = async (overrideInput?: string) => {
    const text = overrideInput ?? input
    if (!text.trim() || isLoading) return

    // Abort any in-progress stream
    abortControllerRef.current?.abort()

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    }

    // Eagerly create the assistant placeholder so the pending shimmer shows
    // immediately, and so the first stream event has a message to mutate.
    const msgId = (Date.now() + 1).toString()
    streamingMessageIdRef.current = msgId
    const placeholder: Message = {
      id: msgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      parts: [],
      toolSteps: [],
      isStreaming: true,
    }

    setMessages((prev) => [...prev, userMessage, placeholder])
    setInput("")
    setIsLoading(true)
    lastFailedInputRef.current = null

    try {
      abortControllerRef.current = new AbortController()

      // apiClient.raw handles 401 by refreshing the token once and
      // retrying transparently — same path as every other data fetch in
      // the app. Without this, the 15-minute access token TTL would log
      // users out of the chat the moment their session expired (every
      // other feature stays logged in because they all go through
      // apiClient and inherit the same refresh behavior).
      const response = await apiClient.raw("/api/ai/flow-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
          publishedFlowId,
          waAccountName,
          projectId: flowId,
          projectName,
          triggerKeywords,
          triggerMatchType,
          flowSlug,
          waAccountId,
          waPhoneNumber,
        }),
      })

      // Pre-stream errors return JSON (not NDJSON)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed (${response.status})`)
      }

      // Read NDJSON stream. Placeholder already exists from handleSend above.
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      // Whether we've already applied the flow to the canvas via flow_ready.
      // Guards the final result event from double-applying.
      let flowAlreadyApplied = false
      // Set true once a terminal 'result' or 'error' event is processed.
      // If the reader exits via done: true with this still false, the
      // server closed the stream without sending a terminal frame (route
      // handler killed mid-execution, controller closed without emit, etc).
      // We mark the placeholder errored so the UI doesn't sit on the
      // "Thinking…" spinner forever — same symptom as the old auth bug,
      // different cause.
      let streamCompletedNormally = false
      // Per-invocation callId counter so done events can match the exact
      // running call they belong to. A FIFO queue per tool name tracks
      // callId + startedAt for tools that are currently running; FIFO
      // because running/done events are tightly paired per invocation.
      let toolCallCounter = 0
      const runningByTool = new Map<string, Array<{ callId: number; startedAt: number }>>()
      // Capture the placeholder id once so deferred done callbacks don't
      // depend on `streamingMessageIdRef.current` — the 'result' event
      // nulls that ref before the MIN_TOOL_VISIBLE_MS delay elapses,
      // which would silently drop the late done transition via
      // `updateStreamingMessage`'s null-guard.
      const targetMsgId = msgId

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
              if (event.status === 'running') {
                // flushSync commits the React state synchronously so the
                // spinner is in state by the time the next event runs. A
                // tiny task yield lets the browser paint the running state
                // at least once — otherwise, for pure local CPU tools where
                // running + done land in the same NDJSON chunk, the reader
                // would flip running → done inside a single task and the
                // spinner would never appear. The minimum visible time is
                // enforced on the done side via MIN_TOOL_VISIBLE_MS, not
                // via a blocking sleep here — that kept the reader pinned
                // for hundreds of ms per tool call.
                const startedAt = Date.now()
                const callId = ++toolCallCounter
                let queue = runningByTool.get(event.tool)
                if (!queue) {
                  queue = []
                  runningByTool.set(event.tool, queue)
                }
                queue.push({ callId, startedAt })
                flushSync(() => {
                  updateStreamingMessage(msg => ({
                    ...msg,
                    parts: [
                      ...(msg.parts || []),
                      { type: 'tool' as const, tool: event.tool, status: 'running' as const, runningAt: startedAt, callId },
                    ],
                    toolSteps: [...(msg.toolSteps || []), { tool: event.tool, status: 'running' as const }],
                  }))
                })
                await new Promise<void>((resolve) => setTimeout(resolve, 0))
              } else {
                // event.details is part of the StreamEvent schema
                const incomingDetails = event.details as ToolStepDetails | undefined
                const toolName = event.tool
                const doneSummary = event.summary

                // publish_flow just modified versions + deleted the draft
                // on the backend. Match the normal Publish button flow:
                // clear tracker state and invalidate caches so the UI
                // reflects the published state without a page refresh.
                if (
                  toolName === 'publish_flow' &&
                  flowId &&
                  doneSummary &&
                  !doneSummary.startsWith('Error:') &&
                  !doneSummary.startsWith('Already published')
                ) {
                  changeTracker.clearChanges()
                  changeTracker.stopTracking()
                  queryClient.invalidateQueries({ queryKey: flowKeys.detail(flowId) })
                  queryClient.invalidateQueries({ queryKey: versionKeys.list(flowId) })
                  queryClient.invalidateQueries({ queryKey: versionKeys.draft(flowId) })
                }
                // FIFO-pop the oldest running call for this tool so
                // running/done events pair up in order when the same tool
                // is invoked multiple times in one turn.
                const queue = runningByTool.get(toolName)
                const record = queue?.shift()
                if (queue && queue.length === 0) runningByTool.delete(toolName)
                const startedAt = record?.startedAt ?? Date.now()
                const matchedCallId = record?.callId
                const elapsed = Date.now() - startedAt
                const remaining = Math.max(0, MIN_TOOL_VISIBLE_MS - elapsed)
                const applyDone = () => {
                  // Target the message by captured id via setMessages
                  // directly. updateStreamingMessage's null-guard would
                  // drop this update if the 'result' event already nulled
                  // streamingMessageIdRef.current.
                  setMessages(prev => prev.map(m => {
                    if (m.id !== targetMsgId) return m
                    return {
                      ...m,
                      parts: (m.parts || []).map((p) => {
                        if (p.type !== 'tool' || p.status !== 'running') return p
                        // Match by callId when available; fall back to
                        // tool-name match for safety (should never happen
                        // because the running branch always records a
                        // callId before any done arrives).
                        if (matchedCallId != null) {
                          if (p.callId !== matchedCallId) return p
                        } else if (p.tool !== toolName) {
                          return p
                        }
                        return {
                          ...p,
                          status: 'done' as const,
                          summary: doneSummary,
                          details: incomingDetails,
                        }
                      }),
                      // toolSteps has no callId — match the first running
                      // entry by tool name. Because running/done are
                      // FIFO-paired per tool, this stays in lock-step with
                      // the parts update above.
                      toolSteps: (() => {
                        let flipped = false
                        return (m.toolSteps || []).map((s) => {
                          if (flipped) return s
                          if (s.tool === toolName && s.status === 'running') {
                            flipped = true
                            return { ...s, status: 'done' as const, summary: doneSummary }
                          }
                          return s
                        })
                      })(),
                    }
                  }))
                }
                if (remaining > 0) {
                  // Defer the done transition off the reader loop so the
                  // stream keeps processing events while the spinner stays
                  // visible for the remaining delta.
                  setTimeout(applyDone, remaining)
                } else {
                  applyDone()
                }
              }
              break

            case 'text_delta':
              updateStreamingMessage(msg => {
                // Append to the last text part if there is one, otherwise
                // push a new text part so tool → text → tool → text ordering
                // is preserved.
                const parts = msg.parts ? [...msg.parts] : []
                const last = parts[parts.length - 1]
                if (last && last.type === 'text') {
                  parts[parts.length - 1] = { ...last, value: last.value + event.delta }
                } else {
                  parts.push({ type: 'text' as const, value: event.delta })
                }
                return {
                  ...msg,
                  parts,
                  content: msg.content + event.delta,
                }
              })
              break

            case 'flow_ready': {
              // Apply to canvas immediately — do not wait for the text stream
              // to finish. The final 'result' event will skip re-applying.
              const meta = {
                warnings: event.warnings,
                debugData: event.debugData,
                userPrompt: userMessage.content,
              }
              if (event.action === 'create' && event.flowData && onApplyFlow) {
                onApplyFlow(event.flowData, meta)
                flowAlreadyApplied = true
              } else if (event.action === 'edit' && event.updates && onUpdateFlow) {
                onUpdateFlow(event.updates, meta)
                flowAlreadyApplied = true
              }
              // Mark the placeholder as auto-applied so Apply Flow button
              // does not render on the final message.
              if (flowAlreadyApplied) {
                updateStreamingMessage(msg => ({ ...msg, isAutoApplied: true }))
              }
              break
            }

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
                isAutoApplied: flowAlreadyApplied || !!(isAutoApplyCreate || isAutoApplyEdit),
                warnings: data.warnings,
                debugData: data.debugData,
                templateMetadata: data.templateMetadata,
              }))
              streamingMessageIdRef.current = null
              streamCompletedNormally = true

              // Apply to canvas only if flow_ready didn't already handle it
              if (!flowAlreadyApplied) {
                if (isAutoApplyCreate) {
                  onApplyFlow!(data.flowData!, meta)
                } else if (isAutoApplyEdit) {
                  onUpdateFlow!(data.updates!, meta)
                }
              }
              break
            }

            case 'error':
              updateStreamingMessage(msg => ({
                ...msg,
                content: msg.content || event.message || "Sorry, something went wrong.",
                isStreaming: false,
                isError: true,
              }))
              lastFailedInputRef.current = userMessage.content
              streamingMessageIdRef.current = null
              streamCompletedNormally = true
              break
          }
        }
      }

      // Reader exited via done: true. If no terminal event was processed
      // the stream closed without resolving the placeholder — mark it
      // errored so the UI doesn't sit on the "Thinking…" spinner forever.
      // Partial parts (text, tool steps) stay visible so the user can see
      // what came through before the connection dropped.
      if (!streamCompletedNormally) {
        const targetMsgId = msgId
        setMessages(prev => prev.map(m => {
          if (m.id !== targetMsgId) return m
          const hasContent = !!(m.content && m.content.length > 0)
          const hasParts = !!(m.parts && m.parts.length > 0)
          return {
            ...m,
            content: hasContent || hasParts
              ? (m.content || "Connection closed before the response finished. Please try again.")
              : "The response was cut off before it arrived. Please try again.",
            isStreaming: false,
            isError: true,
          }
        }))
        lastFailedInputRef.current = userMessage.content
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
      // Safety net: ensure no message stays stuck in streaming state
      if (streamingMessageIdRef.current) {
        updateStreamingMessage(msg => msg.isStreaming ? { ...msg, isStreaming: false } : msg)
        streamingMessageIdRef.current = null
      }
    }
  }

  const handleRetry = () => {
    if (lastFailedInputRef.current) {
      const retryText = lastFailedInputRef.current
      lastFailedInputRef.current = null
      handleSend(retryText)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter inserts newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Conversation className="flex-1">
        <ConversationContent className="gap-4">
          {messages.length === 0 ? (
            <AIEmptyState
              hasRealNodes={(existingFlow?.nodes || []).some((n: any) => n.type !== "start")}
              onSelectSuggestion={(text) => handleSend(text)}
            />
          ) : (
            messages.map((msg) => {
              // Prefer chronological parts[] when present (new messages). Fall
              // back to synthesizing parts from legacy toolSteps + content so
              // previously-saved messages still render.
              const parts: MessagePart[] =
                msg.parts && msg.parts.length > 0
                  ? msg.parts
                  : [
                      ...(msg.toolSteps || []).map((s) => ({
                        type: 'tool' as const,
                        tool: s.tool,
                        status: s.status,
                        summary: s.summary,
                      })),
                      ...(msg.content ? [{ type: 'text' as const, value: msg.content }] : []),
                    ]
              const isPendingAssistant =
                msg.role === "assistant" && !!msg.isStreaming && parts.length === 0
              const showActions =
                (msg.isError && !!lastFailedInputRef.current) ||
                (!!msg.flowData && !msg.isAutoApplied && !appliedMessageIds.has(msg.id) && !!onApplyFlow)

              return (
                <Fragment key={msg.id}>
                  {/* Pending assistant — no part yet */}
                  {isPendingAssistant && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <Shimmer>Thinking…</Shimmer>
                    </div>
                  )}

                  {/* Chronological parts — text and tool blocks in the order
                      they arrived from the stream */}
                  {parts.map((part, i) => {
                    if (part.type === 'text') {
                      return (
                        <ChatMessage key={`${msg.id}-p${i}`} from={msg.role}>
                          <MessageContent
                            className={
                              msg.role === "assistant"
                                ? "bg-transparent p-0 w-full max-w-none"
                                : undefined
                            }
                          >
                            {msg.role === "assistant" ? (
                              <MessageResponse className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-2 prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-pre:my-2 prose-code:before:hidden prose-code:after:hidden">
                                {part.value}
                              </MessageResponse>
                            ) : (
                              <div className="whitespace-pre-wrap break-words text-sm">{part.value}</div>
                            )}
                          </MessageContent>
                        </ChatMessage>
                      )
                    }
                    // Tool part — running state shows a simple spinner row;
                    // done state uses Task for details (added/removed/issues)
                    // or a plain check row if there are no details to show.
                    if (part.status === 'running') {
                      return (
                        <div
                          key={`${msg.id}-p${i}`}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                          <Shimmer>{formatToolRunning(part.tool)}</Shimmer>
                        </div>
                      )
                    }

                    const headline = formatToolStep(part)
                    const hasDetails =
                      part.details &&
                      ((part.details.kind === 'edit' &&
                        (part.details.added.length > 0 ||
                          part.details.removed.length > 0 ||
                          part.details.updated.length > 0 ||
                          part.details.edgesAdded > 0 ||
                          part.details.edgesRemoved > 0)) ||
                        (part.details.kind === 'validate' &&
                          !part.details.valid &&
                          part.details.issues.length > 0))

                    if (!hasDetails) {
                      return (
                        <div
                          key={`${msg.id}-p${i}`}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                          <span className="break-words">{headline}</span>
                        </div>
                      )
                    }

                    return (
                      <Task key={`${msg.id}-p${i}`} defaultOpen>
                        <TaskTrigger title={headline} />
                        <TaskContent className="mt-1.5">
                          {part.details!.kind === 'edit' && (
                            <>
                              {part.details!.added.map((n, idx) => (
                                <TaskItem
                                  key={`a${idx}`}
                                  className="flex flex-wrap items-center gap-1.5"
                                >
                                  <span className="text-success">+</span>
                                  <span>Added</span>
                                  <TaskItemFile>{n.type}</TaskItemFile>
                                  {n.preview ? (
                                    <span className="text-foreground">
                                      &ldquo;{n.preview}&rdquo;
                                    </span>
                                  ) : n.label ? (
                                    <span className="text-foreground">{n.label}</span>
                                  ) : null}
                                </TaskItem>
                              ))}
                              {part.details!.removed.map((n, idx) => (
                                <TaskItem
                                  key={`r${idx}`}
                                  className="flex flex-wrap items-center gap-1.5"
                                >
                                  <span className="text-destructive">−</span>
                                  <span>Removed</span>
                                  <TaskItemFile>{n.type}</TaskItemFile>
                                  {n.preview ? (
                                    <span className="text-foreground">
                                      &ldquo;{n.preview}&rdquo;
                                    </span>
                                  ) : n.label ? (
                                    <span className="text-foreground">{n.label}</span>
                                  ) : null}
                                </TaskItem>
                              ))}
                              {part.details!.updated.map((n, idx) => (
                                <TaskItem
                                  key={`u${idx}`}
                                  className="flex flex-wrap items-center gap-1.5"
                                >
                                  <span className="text-info">~</span>
                                  <span>Updated</span>
                                  <TaskItemFile>{n.type}</TaskItemFile>
                                  {n.label ? (
                                    <span className="text-foreground">{n.label}</span>
                                  ) : null}
                                  {n.fields.length > 0 ? (
                                    <span className="text-muted-foreground">
                                      ({n.fields.join(", ")})
                                    </span>
                                  ) : null}
                                </TaskItem>
                              ))}
                              {(part.details!.edgesAdded > 0 || part.details!.edgesRemoved > 0) && (
                                <TaskItem className="text-muted-foreground">
                                  {part.details!.edgesAdded > 0 && (
                                    <>
                                      ↳ {part.details!.edgesAdded} edge
                                      {part.details!.edgesAdded > 1 ? "s" : ""} wired
                                    </>
                                  )}
                                  {part.details!.edgesAdded > 0 && part.details!.edgesRemoved > 0 && ", "}
                                  {part.details!.edgesRemoved > 0 && (
                                    <>
                                      {part.details!.edgesRemoved} edge
                                      {part.details!.edgesRemoved > 1 ? "s" : ""} removed
                                    </>
                                  )}
                                </TaskItem>
                              )}
                            </>
                          )}
                          {part.details!.kind === 'validate' &&
                            part.details!.issues.map((issue, idx) => (
                              <TaskItem
                                key={`i${idx}`}
                                className="flex flex-wrap items-start gap-1.5 text-destructive"
                              >
                                <span className="mt-0.5">•</span>
                                <span className="flex-1">
                                  {issue.nodeLabel ? (
                                    <>
                                      <span className="font-medium">
                                        &ldquo;{issue.nodeLabel}&rdquo;
                                      </span>
                                      {" — "}
                                    </>
                                  ) : null}
                                  {issue.detail}
                                </span>
                              </TaskItem>
                            ))}
                        </TaskContent>
                      </Task>
                    )
                  })}

                  {/* Trailing working indicator — keeps the chat alive while the
                      AI is still streaming after at least one part has already
                      rendered. Without this, a message that starts with a text
                      chunk (narration) then pauses to call a tool sits silent
                      for several seconds and feels hung. Suppressed when the
                      last part is already a running tool (it has its own
                      shimmer) or when streaming is done. */}
                  {msg.role === 'assistant' && msg.isStreaming && parts.length > 0 && (() => {
                    const last = parts[parts.length - 1]
                    if (last.type === 'tool' && last.status === 'running') return null
                    return (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <Shimmer>Working…</Shimmer>
                      </div>
                    )
                  })()}

                  {/* Inline actions row — retry / apply */}
                  {showActions && (
                    <div className="flex items-center gap-2">
                      {msg.isError && lastFailedInputRef.current && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRetry}
                          className="cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      {msg.flowData && !msg.isAutoApplied && !appliedMessageIds.has(msg.id) && onApplyFlow && (
                        <Button
                          size="sm"
                          className="cursor-pointer"
                          onClick={() => {
                            onApplyFlow(msg.flowData!, { warnings: msg.warnings })
                            setAppliedMessageIds((prev) => new Set(prev).add(msg.id))
                          }}
                        >
                          <Check className="w-3 h-3 mr-1" />
                          Apply flow
                        </Button>
                      )}
                    </div>
                  )}
                </Fragment>
              )
            })
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
}
