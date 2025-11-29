"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Send, ChevronUp, ChevronDown, Sparkles, Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  flowData?: { nodes: any[]; edges: any[] }
  updates?: { nodes?: any[]; edges?: any[]; description?: string }
}

interface AIAssistantProps {
  platform: "web" | "whatsapp" | "instagram"
  flowContext?: string
  existingFlow?: { nodes: any[]; edges: any[] }
  onApplyFlow?: (flowData: { nodes: any[]; edges: any[] }) => void
  onUpdateFlow?: (updates: { nodes?: any[]; edges?: any[]; description?: string }) => void
}

export function AIAssistant({
  platform,
  flowContext,
  existingFlow,
  onApplyFlow,
  onUpdateFlow,
}: AIAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: `Hi! I'm your AI Flow Assistant. I can help you create or edit flows. What would you like to do?`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [seenMessageIds, setSeenMessageIds] = useState<Set<string>>(new Set())
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isExpanded && scrollAreaRef.current) {
      // Scroll to bottom when new messages arrive
      setTimeout(() => {
        const viewport = scrollAreaRef.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight
        }
      }, 100)
    }
  }, [messages, isExpanded])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
  }, [input])

  // Auto-expand only for NEW messages with updates (not already seen)
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      (lastMessage.flowData || lastMessage.updates) &&
      !seenMessageIds.has(lastMessage.id) &&
      !isExpanded
    ) {
      setIsExpanded(true)
      setSeenMessageIds((prev) => new Set([...prev, lastMessage.id]))
    }
  }, [messages, isExpanded, seenMessageIds])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    // Auto-expand when user sends a message
    if (!isExpanded) {
      setIsExpanded(true)
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

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message || "I'm processing your request...",
        timestamp: new Date(),
        flowData: data.flowData,
        updates: data.updates,
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Auto-expand if flow data or updates are available
      if (data.flowData || data.updates) {
        setIsExpanded(true)
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
    // Send message on Shift+Enter or Cmd+Enter, allow Enter for new line
    if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
    // Allow Enter to create new line (default behavior)
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4">
      <Card className="shadow-xl border-2 border-purple-200 dark:border-purple-800 bg-card flex flex-col h-auto max-h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-sm text-foreground">AI Flow Assistant</h3>
            {/* Badge indicator for unapplied updates */}
            {!isExpanded && messages.some(
              (msg) => msg.role === "assistant" && (msg.flowData || msg.updates)
            ) && (
              <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const newExpandedState = !isExpanded
              setIsExpanded(newExpandedState)
              // When user manually closes, mark all current messages as seen
              if (!newExpandedState) {
                setSeenMessageIds(new Set(messages.map(m => m.id)))
              }
            }}
            className="h-7 w-7 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Messages Area (when expanded) */}
        {isExpanded && (
          <div className="h-[400px] overflow-hidden" ref={scrollAreaRef}>
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4 pb-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-purple-600 text-white"
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
                    
                    {/* Apply buttons for flow data or updates */}
                    {message.role === "assistant" && (
                      <div className="mt-3 space-y-2">
                        {message.flowData && onApplyFlow && (
                          <Button
                            onClick={() => onApplyFlow(message.flowData!)}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs"
                            size="sm"
                          >
                            Apply Flow
                          </Button>
                        )}
                        {message.updates && onUpdateFlow && (
                          <Button
                            onClick={() => onUpdateFlow(message.updates!)}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs"
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
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Input Bar - Always visible, inside the card, fixed at bottom */}
        <div className="flex items-end gap-2 p-3 border-t border-border flex-shrink-0 bg-card relative z-10">
          <div className="flex-1 flex items-end gap-2 bg-muted rounded-lg px-4 py-2 border border-border">
            <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mb-1" />
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to create or edit your flow... (Shift+Enter to send)"
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 resize-none min-h-[40px] max-h-[120px] overflow-y-auto"
              disabled={isLoading}
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = "auto"
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="h-8 w-8 p-0 bg-purple-600 hover:bg-purple-700 flex-shrink-0 mb-1"
              size="sm"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
