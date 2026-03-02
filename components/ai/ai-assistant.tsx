"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Send, ChevronDown, Sparkles, Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  flowData?: { nodes: any[]; edges: any[]; nodeOrder?: string[] }
  updates?: { nodes?: any[]; edges?: any[]; description?: string; removeNodeIds?: string[]; removeEdges?: any[] }
  isAutoApplied?: boolean
}

interface AIAssistantProps {
  platform: "web" | "whatsapp" | "instagram"
  flowContext?: string
  existingFlow?: { nodes: any[]; edges: any[] }
  selectedNode?: any
  onApplyFlow?: (flowData: { nodes: any[]; edges: any[]; nodeOrder?: string[] }) => void
  onUpdateFlow?: (updates: { nodes?: any[]; edges?: any[]; description?: string; removeNodeIds?: string[]; removeEdges?: any[] }) => void
}

export function AIAssistant({
  platform,
  flowContext,
  existingFlow,
  selectedNode,
  onApplyFlow,
  onUpdateFlow,
}: AIAssistantProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: `Hi! I'm your Freestand AI Assistant. I can help you create or edit flows. What would you like to do?`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputBarRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }

  useEffect(() => {
    if (isFocused) {
      scrollToBottom()
    }
  }, [messages, isFocused])

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

  // Measure and lock width of container, apply to both chat and input
  useEffect(() => {
    if (chatContainerRef.current && !containerWidth) {
      const width = chatContainerRef.current.offsetWidth
      if (width > 0) {
        setContainerWidth(width)
      }
    }
  }, [containerWidth])

  // Update width on window resize
  useEffect(() => {
    const handleResize = () => {
      if (chatContainerRef.current) {
        const width = chatContainerRef.current.offsetWidth
        if (width > 0) {
          setContainerWidth(width)
        }
      }
    }

    // Initial measurement after a short delay to ensure layout is complete
    const timeoutId = setTimeout(() => {
      if (chatContainerRef.current) {
        const width = chatContainerRef.current.offsetWidth
        if (width > 0) {
          setContainerWidth(width)
        }
      }
    }, 100)

    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Auto-expand for new messages with updates (but not auto-applied creates)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      (lastMessage.flowData || lastMessage.updates) &&
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
      
      // Don't collapse if clicking inside the chat container
      if (chatContainerRef.current && chatContainerRef.current.contains(target)) {
        return
      }

      // Check if clicking on React Flow canvas or related elements
      const isReactFlowElement = 
        target.closest('.react-flow') ||
        target.closest('.react-flow__pane') ||
        target.closest('.react-flow__viewport') ||
        target.closest('[data-id]') // React Flow nodes have data-id
      
      // Also check for other UI elements that shouldn't close the chat
      const isUIElement = 
        target.closest('[role="dialog"]') || // Modals
        target.closest('[role="menu"]') || // Menus
        target.closest('[role="tooltip"]') // Tooltips

      // Collapse if clicking on React Flow canvas or other areas (but not UI elements)
      if (isReactFlowElement && !isUIElement) {
        setIsFocused(false)
      } else if (!isUIElement && !target.closest('button') && !target.closest('input') && !target.closest('textarea')) {
        // Collapse on other clicks (but not on interactive elements)
        setIsFocused(false)
      }
    }

    if (isFocused) {
      // Use a small delay to ensure React Flow events have processed
      setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside, true)
      }, 0)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true)
    }
  }, [isFocused])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    if (!isFocused) {
      setIsFocused(true)
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/ai/flow-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          platform,
          flowContext,
          existingFlow,
          selectedNode: selectedNode ? { id: selectedNode.id, type: selectedNode.type, data: selectedNode.data, position: selectedNode.position } : undefined,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to get AI response")
      }

      const data = await response.json()

      const isAutoApply = data.action === "create" && data.flowData && onApplyFlow

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message || "I'm processing your request...",
        timestamp: new Date(),
        flowData: data.flowData,
        updates: data.updates,
        isAutoApplied: !!isAutoApply,
      }

      setMessages((prev) => [...prev, assistantMessage])

      if (isAutoApply) {
        // Auto-apply: collapse chat and apply flow immediately
        setIsFocused(false)
        onApplyFlow(data.flowData)
      } else if (data.flowData || data.updates) {
        // Edit/suggest mode: keep chat open, show buttons
        setIsFocused(true)
      }
    } catch (error) {
      console.error("[AI Assistant] Error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleInputFocus = () => {
    setIsFocused(true)
  }

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    target.style.height = "auto"
    target.style.height = `${Math.min(target.scrollHeight, 120)}px`
  }

  return (
    <div
      ref={chatContainerRef}
      className="flex flex-col w-full max-w-2xl"
    >
      {/* Chat window - appears above input when focused */}
      {isFocused && (
        <Card 
          className="mb-2 flex flex-col rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl min-w-0 shrink-0"
          style={containerWidth ? { width: `${containerWidth}px` } : undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#2872F4]" />
              <h3 className="font-semibold text-sm text-card-foreground">Freestand AI Assistant</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsFocused(false)
                setSeenMessageIds(new Set(messages.map(m => m.id)))
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
            className="flex-1 space-y-4 overflow-y-auto p-4"
            style={{ height: "400px" }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-[#052762] via-[#0A49B7] to-[#2872F4] text-white shadow-lg shadow-blue-500/30"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                  {/* Preview of changes */}
                  {message.role === "assistant" && (message.flowData || message.updates) && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Preview:</div>
                      <div className="space-y-1.5 text-xs">
                        {message.flowData && (
                          <>
                            {message.flowData.nodes && message.flowData.nodes.length > 0 && (
                              <div className="text-foreground">
                                <span className="font-medium">Nodes:</span> {message.flowData.nodes.length}
                                <div className="mt-1 space-y-0.5 pl-2">
                                  {message.flowData.nodes.slice(0, 3).map((node: any, idx: number) => (
                                    <div key={idx} className="text-muted-foreground">
                                      • {node.data?.label || node.type || `Node ${idx + 1}`}
                                    </div>
                                  ))}
                                  {message.flowData.nodes.length > 3 && (
                                    <div className="text-muted-foreground">
                                      • +{message.flowData.nodes.length - 3} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {message.flowData.edges && message.flowData.edges.length > 0 && (
                              <div className="text-foreground">
                                <span className="font-medium">Connections:</span> {message.flowData.edges.length}
                              </div>
                            )}
                          </>
                        )}
                        {message.updates && (
                          <>
                            {message.updates.nodes && message.updates.nodes.length > 0 && (
                              <div className="text-foreground">
                                <span className="font-medium">New/Updated Nodes:</span> {message.updates.nodes.length}
                                <div className="mt-1 space-y-0.5 pl-2">
                                  {message.updates.nodes.slice(0, 3).map((node: any, idx: number) => (
                                    <div key={idx} className="text-muted-foreground">
                                      • {node.data?.label || node.type || `Node ${idx + 1}`}
                                    </div>
                                  ))}
                                  {message.updates.nodes.length > 3 && (
                                    <div className="text-muted-foreground">
                                      • +{message.updates.nodes.length - 3} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {message.updates.edges && message.updates.edges.length > 0 && (
                              <div className="text-foreground">
                                <span className="font-medium">New Connections:</span> {message.updates.edges.length}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Apply buttons */}
                  {message.role === "assistant" && (
                    <div className="mt-3 space-y-2">
                      {message.flowData && onApplyFlow && !message.isAutoApplied && (
                        <Button
                          onClick={() => onApplyFlow(message.flowData!)}
                          className="w-full bg-gradient-to-r from-[#052762] to-[#0A49B7] hover:from-[#0A49B7] hover:to-[#2872F4] text-white text-xs shadow-md hover:shadow-lg transition-all"
                          size="sm"
                        >
                          Apply Flow
                        </Button>
                      )}
                      {message.updates && onUpdateFlow && (
                        <Button
                          onClick={() => onUpdateFlow(message.updates!)}
                          className="w-full bg-gradient-to-r from-[#052762] to-[#0A49B7] hover:from-[#0A49B7] hover:to-[#2872F4] text-white text-xs shadow-md hover:shadow-lg transition-all"
                          size="sm"
                        >
                          Apply Updates
                        </Button>
                      )}
                    </div>
                  )}

                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </Card>
      )}

      {/* Input Bar - Always visible at bottom */}
      <div 
        ref={inputBarRef}
        className="flex items-center gap-2 rounded-full border border-border/50 bg-card/95 backdrop-blur-xl px-4 py-2 shadow-xl min-w-0"
        style={containerWidth ? { width: `${containerWidth}px` } : { width: '100%' }}
      >
        <Sparkles className="w-4 h-4 text-[#2872F4] flex-shrink-0" />
        <Textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          placeholder="Ask Freestand AI to create or edit your flow... (Shift+Enter to send)"
          className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
          disabled={isLoading}
          rows={1}
          onInput={handleTextareaInput}
        />
        <Button
          onClick={handleSend}
          size="sm"
          disabled={!input.trim() || isLoading}
          className="h-8 w-8 p-0 bg-gradient-to-br from-[#052762] to-[#0A49B7] hover:from-[#0A49B7] hover:to-[#2872F4] flex-shrink-0 rounded-md shadow-md hover:shadow-lg transition-all"
          aria-label="Send message"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
