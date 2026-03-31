"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Send, ChevronDown, Sparkles, Loader2, RotateCcw, Check, Undo2 } from "lucide-react"
import { getAllTemplates } from "@/utils/flow-storage"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  flowData?: { nodes: any[]; edges: any[]; nodeOrder?: string[] }
  updates?: { nodes?: any[]; edges?: any[]; description?: string; removeNodeIds?: string[]; removeEdges?: any[]; positionShifts?: Array<{ nodeId: string; dx: number }> }
  isAutoApplied?: boolean
  isError?: boolean
  warnings?: string[]
  debugData?: Record<string, unknown>
}

interface AIAssistantProps {
  flowId?: string
  platform: "web" | "whatsapp" | "instagram"
  flowContext?: string
  existingFlow?: { nodes: any[]; edges: any[] }
  selectedNode?: any
  onApplyFlow?: (flowData: { nodes: any[]; edges: any[]; nodeOrder?: string[] }, meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }) => void
  onUpdateFlow?: (updates: { nodes?: any[]; edges?: any[]; description?: string; removeNodeIds?: string[]; removeEdges?: any[]; positionShifts?: Array<{ nodeId: string; dx: number }> }, meta?: { warnings?: string[]; debugData?: Record<string, unknown>; userPrompt?: string }) => void
  onUndo?: () => boolean
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

export function AIAssistant({
  flowId,
  platform,
  flowContext,
  existingFlow,
  selectedNode,
  onApplyFlow,
  onUpdateFlow,
  onUndo,
}: AIAssistantProps) {
  // Collect all templates (default + user-created) for AI context
  const [userTemplates, setUserTemplates] = useState<Array<{ id: string; name: string; aiMetadata?: any }>>(() => {
    return DEFAULT_TEMPLATES.map(t => ({ id: t.id, name: t.name, aiMetadata: t.aiMetadata }))
  })
  useEffect(() => {
    getAllTemplates().then((templates) => {
      const defaults = DEFAULT_TEMPLATES.map(t => ({ id: t.id, name: t.name, aiMetadata: t.aiMetadata }))
      const userCreated = templates.map(t => ({ id: t.id, name: t.name, aiMetadata: t.aiMetadata }))
      setUserTemplates([...defaults, ...userCreated])
    }).catch(() => {})
  }, [])

  const [isFocused, setIsFocused] = useState(false)
  const [messages, setMessages] = useState<Message[]>(() => {
    if (flowId && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${flowId}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
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
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  // Persist messages to localStorage (strip large data fields)
  useEffect(() => {
    if (flowId && typeof window !== "undefined" && messages.length > 1) {
      const toStore = messages.map(({ flowData, updates, debugData, ...rest }) => rest)
      try {
        localStorage.setItem(`${CHAT_STORAGE_PREFIX}${flowId}`, JSON.stringify(toStore))
      } catch { /* storage full — ignore */ }
    }
  }, [messages, flowId])

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [])

  // Auto-scroll on new messages or loading state change
  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading, scrollToBottom])

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
      const response = await fetch("/api/ai/flow-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Request failed (${response.status})`)
      }

      const data = await response.json()
      const meta = { warnings: data.warnings, debugData: data.debugData, userPrompt: userMessage.content }
      const isAutoApplyCreate = data.action === "create" && data.flowData && onApplyFlow
      const isAutoApplyEdit = data.updates && onUpdateFlow

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message || "I've processed your request.",
        timestamp: new Date(),
        flowData: data.flowData,
        updates: data.updates,
        isAutoApplied: !!(isAutoApplyCreate || isAutoApplyEdit),
        warnings: data.warnings,
        debugData: data.debugData,
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (isAutoApplyCreate) {
        setIsFocused(false)
        onApplyFlow(data.flowData, meta)
      } else if (isAutoApplyEdit) {
        onUpdateFlow(data.updates, meta)
      } else if (data.flowData) {
        setIsFocused(true)
      }
    } catch (error) {
      console.error("[AI Assistant] Error:", error)
      lastFailedInputRef.current = userMessage.content
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
    } finally {
      setIsLoading(false)
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
              <Sparkles className="w-4 h-4 text-[#2872F4]" />
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
              const isUndoable = message.isAutoApplied && onUndo && !appliedMessageIds.has(`undo-${message.id}`)
              const isUndone = appliedMessageIds.has(`undo-${message.id}`)
              const hasActions = message.role === "assistant" && (
                (message.flowData && onApplyFlow && !message.isAutoApplied) ||
                isUndoable || isUndone ||
                (message.isError && lastFailedInputRef.current)
              )

              return (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 overflow-hidden ${
                      message.role === "user"
                        ? "bg-gradient-to-br from-[#052762] via-[#0A49B7] to-[#2872F4] text-white shadow-md"
                        : message.isError
                          ? "bg-destructive/10 text-foreground border border-destructive/20"
                          : "bg-muted/70 text-foreground"
                    }`}
                  >
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>

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
                                : "bg-gradient-to-r from-[#052762] to-[#0A49B7] hover:from-[#0A49B7] hover:to-[#2872F4] text-white shadow-sm hover:shadow-md"
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

                        {/* Undo button for auto-applied messages */}
                        {isUndoable && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-3 rounded-lg"
                            onClick={() => {
                              onUndo()
                              setAppliedMessageIds((prev) => new Set([...prev, `undo-${message.id}`]))
                            }}
                            disabled={isLoading}
                          >
                            <Undo2 className="w-3 h-3 mr-1" /> Undo
                          </Button>
                        )}
                        {isUndone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Undo2 className="w-3 h-3" /> Undone
                          </span>
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
        <Sparkles className="w-4 h-4 text-[#2872F4] flex-shrink-0" />
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
          className="h-8 w-8 p-0 bg-gradient-to-br from-[#052762] to-[#0A49B7] hover:from-[#0A49B7] hover:to-[#2872F4] flex-shrink-0 rounded-md shadow-md hover:shadow-lg transition-all"
          aria-label="Send message"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  )
}
