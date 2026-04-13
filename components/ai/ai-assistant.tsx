"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Send, ChevronDown, Sparkles, Loader2, RotateCcw, Check } from "lucide-react"
import { getAllTemplates, getFlow } from "@/utils/flow-storage"
import { getAccessToken } from "@/lib/auth"
import { useAccounts } from "@/hooks/queries"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import { toast } from "sonner"
import type { TemplateAIMetadata } from "@/types"
import type { StreamEvent } from "@/lib/ai/tools/generate-flow"

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
}

const CHAT_STORAGE_PREFIX = "magic-flow-chat-"
const GREETING_MESSAGE: Message = {
  id: "1",
  role: "assistant",
  content: "Hi! I'm your Freestand AI Assistant. I can help you create or edit flows. What would you like to do?",
  timestamp: new Date(),
}

function renderNodePreview(
  nodes: any[] | undefined,
  edges: any[] | undefined,
  nodeLabel: string,
  edgeLabel: string
) {
  if (!nodes?.length && !edges?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {nodes && nodes.length > 0 && (
        <span>
          <span className="font-medium text-foreground/70">{nodes.length}</span> {nodeLabel.toLowerCase()}
        </span>
      )}
      {edges && edges.length > 0 && (
        <span>
          <span className="font-medium text-foreground/70">{edges.length}</span> {edgeLabel.toLowerCase()}
        </span>
      )}
    </div>
  )
}

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
}: AIAssistantProps) {
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

  const [isFocused, setIsFocused] = useState(false)
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
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [appliedMessageIds, setAppliedMessageIds] = useState<Set<string>>(new Set())
  const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set())
  const lastFailedInputRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputBarRef = useRef<HTMLDivElement>(null)
  const streamingMessageIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const scrollThrottleRef = useRef<number | null>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

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

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [])

  // Auto-scroll on new messages or loading state change (throttled to rAF)
  useEffect(() => {
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = requestAnimationFrame(() => {
      scrollToBottom()
      scrollThrottleRef.current = null
    })
  }, [messages, isLoading, scrollToBottom])

  useEffect(() => {
    return () => {
      if (scrollThrottleRef.current) {
        cancelAnimationFrame(scrollThrottleRef.current)
      }
    }
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Auto-focus input when chat expands
  useEffect(() => {
    if (isFocused) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isFocused])

  // Measure and lock width of container
  useEffect(() => {
    if (chatContainerRef.current && !containerWidth) {
      const width = chatContainerRef.current.offsetWidth
      if (width > 0) setContainerWidth(width)
    }
  }, [containerWidth])

  // Update width on window resize
  useEffect(() => {
    const handleResize = () => {
      if (chatContainerRef.current) {
        const width = chatContainerRef.current.offsetWidth
        if (width > 0) setContainerWidth(width)
      }
    }

    const timeoutId = setTimeout(handleResize, 100)
    window.addEventListener("resize", handleResize)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  // Auto-expand for new messages with non-auto-applied flow data
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.flowData &&
      !lastMessage.isAutoApplied &&
      !seenMessageIds.has(lastMessage.id) &&
      !isFocused
    ) {
      setIsFocused(true)
      setSeenMessageIds((prev) => new Set([...prev, lastMessage.id]))
    }
  }, [messages, isFocused, seenMessageIds])

  // Click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      if (chatContainerRef.current && chatContainerRef.current.contains(target)) return

      const isReactFlowElement =
        target.closest(".react-flow") ||
        target.closest(".react-flow__pane") ||
        target.closest(".react-flow__viewport") ||
        target.closest("[data-id]")

      const isUIElement =
        target.closest('[role="dialog"]') ||
        target.closest('[role="menu"]') ||
        target.closest('[role="tooltip"]')

      if (isReactFlowElement && !isUIElement) {
        setIsFocused(false)
      } else if (!isUIElement && !target.closest("button") && !target.closest("input") && !target.closest("textarea")) {
        setIsFocused(false)
      }
    }

    if (isFocused) {
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside, true)
      }, 0)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true)
    }
  }, [isFocused])

  const handleSend = async (overrideInput?: string) => {
    const text = overrideInput ?? input
    if (!text.trim() || isLoading) return

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

      const token = getAccessToken()
      const response = await fetch("/api/ai/flow-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
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
        }),
      })

      // Pre-stream errors return JSON (not NDJSON)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed (${response.status})`)
      }

      // Read NDJSON stream
      // Placeholder is created lazily on first streaming event (tool_step or text_delta).
      // If the first event is `result` (create mode), the final message is added directly.
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const msgId = (Date.now() + 1).toString()

      // Ensure the streaming placeholder exists (creates it on first call)
      const ensurePlaceholder = () => {
        if (streamingMessageIdRef.current) return // already created
        streamingMessageIdRef.current = msgId
        setMessages(prev => [...prev, {
          id: msgId,
          role: "assistant" as const,
          content: "",
          timestamp: new Date(),
          toolSteps: [],
          isStreaming: true,
        }])
        setIsLoading(false) // remove thinking dots
      }

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
              ensurePlaceholder()
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
              ensurePlaceholder()
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

              if (streamingMessageIdRef.current) {
                // Edit mode: placeholder exists with streamed content — finalize it
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
              } else {
                // Create mode: no placeholder — add final message directly (old behavior)
                setIsLoading(false)
                const finalMessage: Message = {
                  id: msgId,
                  role: "assistant",
                  content: data.message || "I've processed your request.",
                  timestamp: new Date(),
                  flowData: data.flowData,
                  updates: data.updates,
                  isAutoApplied: !!(isAutoApplyCreate || isAutoApplyEdit),
                  warnings: data.warnings,
                  debugData: data.debugData,
                  templateMetadata: data.templateMetadata,
                }
                setMessages(prev => [...prev, finalMessage])
              }
              streamingMessageIdRef.current = null

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
              if (streamingMessageIdRef.current) {
                updateStreamingMessage(msg => ({
                  ...msg,
                  content: msg.content || event.message || "Sorry, something went wrong.",
                  isStreaming: false,
                  isError: true,
                }))
              } else {
                setIsLoading(false)
                setMessages(prev => [...prev, {
                  id: msgId,
                  role: "assistant" as const,
                  content: event.message || "Sorry, something went wrong.",
                  timestamp: new Date(),
                  isError: true,
                }])
              }
              lastFailedInputRef.current = userMessage.content
              streamingMessageIdRef.current = null
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

  const handleApplyClick = (messageId: string, fn: () => void) => {
    if (appliedMessageIds.has(messageId) || isLoading) return
    setAppliedMessageIds((prev) => new Set([...prev, messageId]))
    fn()
  }

  return (
    <div ref={chatContainerRef} className="flex flex-col w-full max-w-3xl">
      {/* Chat window */}
      {isFocused && (
        <Card
          className="mb-2 flex flex-col rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl min-w-0 shrink-0"
          style={containerWidth ? { width: `${containerWidth}px` } : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm text-card-foreground">Freestand AI</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsFocused(false)
                setSeenMessageIds(new Set(messages.map((m) => m.id)))
              }}
              className="h-8 w-8 p-0"
              aria-label="Collapse chat"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages Area */}
          <div
            ref={scrollContainerRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3 max-h-[50vh] min-h-[200px]"
            role="log"
            aria-live="polite"
          >
            {messages.map((message) => {
              const isApplied = appliedMessageIds.has(message.id)
              const msgIdx = messages.indexOf(message)
              const precedingUserMsg = messages.slice(0, msgIdx).reverse().find((m) => m.role === "user")
              const buttonMeta = { warnings: message.warnings, debugData: message.debugData, userPrompt: precedingUserMsg?.content }
              const hasActions = message.role === "assistant" && (
                (message.flowData && onApplyFlow && !message.isAutoApplied) ||
                (message.isError && lastFailedInputRef.current)
              )

              return (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 overflow-hidden ${
                      message.role === "user"
                        ? "bg-primary text-white shadow-md"
                        : message.isError
                          ? "bg-destructive/10 text-foreground border border-destructive/20"
                          : "bg-muted/70 text-foreground"
                    }`}
                  >
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
                    {(message.content || !message.isStreaming) && (
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {message.content}
                        {message.isStreaming && message.content && (
                          <span className="inline-block w-1.5 h-3.5 bg-foreground/50 ml-0.5 animate-pulse rounded-sm" />
                        )}
                      </p>
                    )}

                    {/* Compact preview of changes */}
                    {message.role === "assistant" && (message.flowData || message.updates) && (
                      <div className="mt-2 pt-2 border-t border-border/30">
                        {message.flowData && renderNodePreview(message.flowData.nodes, message.flowData.edges, "Nodes", "Connections")}
                        {message.updates && renderNodePreview(message.updates.nodes, message.updates.edges, "New/Updated Nodes", "New Connections")}
                      </div>
                    )}

                    {/* Action buttons */}
                    {hasActions && (
                      <div className="mt-2.5 flex items-center gap-2">
                        {/* Manual Apply Flow button (only for non-auto-applied creates) */}
                        {message.flowData && onApplyFlow && !message.isAutoApplied && (
                          <Button
                            onClick={() => handleApplyClick(message.id, () => onApplyFlow(message.flowData!, buttonMeta))}
                            disabled={isApplied || isLoading}
                            className={`h-7 text-xs px-3 rounded-lg transition-all ${
                              isApplied
                                ? "bg-green-600/90 hover:bg-green-600/90 text-white cursor-default"
                                : "bg-primary hover:bg-primary/90 text-white shadow-sm hover:shadow-md"
                            }`}
                            size="sm"
                          >
                            {isApplied ? (
                              <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Applied</span>
                            ) : (
                              "Apply Flow"
                            )}
                          </Button>
                        )}

                        {message.isError && lastFailedInputRef.current && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-3 rounded-lg"
                            onClick={handleRetry}
                            disabled={isLoading}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Retry
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Save as Template buttons */}
                    {message.templateMetadata && !message.isTemplateSaved && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          className="cursor-pointer"
                          onClick={async () => {
                            try {
                              const meta = message.templateMetadata!
                              const { createTemplate } = await import("@/utils/flow-storage")
                              await createTemplate(
                                meta.suggestedName,
                                meta.description,
                                platform,
                                existingFlow?.nodes ?? [],
                                existingFlow?.edges ?? [],
                                meta.aiMetadata,
                              )
                              toast.success("Template created successfully")
                              setMessages(prev => prev.map(m =>
                                m.id === message.id ? { ...m, isTemplateSaved: true } : m
                              ))
                            } catch {
                              toast.error("Failed to create template")
                            }
                          }}
                        >
                          Save as Template
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => setInput("Change the template name to ")}
                        >
                          Edit Details
                        </Button>
                      </div>
                    )}

                    <p className={`text-[10px] mt-1.5 ${message.role === "user" ? "text-white/40" : "text-muted-foreground/50"}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              )
            })}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted/70 rounded-2xl px-3.5 py-2 flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Thinking</span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </Card>
      )}

      {/* Input Bar */}
      <div
        ref={inputBarRef}
        onClick={() => { if (!isFocused) setIsFocused(true) }}
        className="flex items-center gap-2 rounded-full border border-border/50 bg-card/95 backdrop-blur-xl px-4 py-2 shadow-xl min-w-0 cursor-text"
        style={containerWidth ? { width: `${containerWidth}px` } : { width: "100%" }}
      >
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => { if (!isLoading) setInput(e.target.value) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          placeholder={isLoading ? "AI is thinking..." : "Ask AI to create or edit your flow..."}
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
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
          className="h-8 w-8 p-0 bg-primary hover:bg-primary/90 flex-shrink-0 rounded-md shadow-md hover:shadow-lg transition-all"
          aria-label="Send message"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}
