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
  waPhoneNumber?: string
  projectName?: string
  triggerKeywords?: string[]
  triggerMatchType?: string
  flowSlug?: string
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
  waPhoneNumber,
  projectName,
  triggerKeywords,
  triggerMatchType,
  flowSlug,
}: AIChatPanelWrapperProps) {
  const [panelWidth, setPanelWidth] = useState<number>(DEFAULT_WIDTH)
  // Hydrate width from localStorage post-mount (avoids SSR mismatch on width style)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WIDTH)
      if (!stored) return
      const n = parseInt(stored, 10)
      if (Number.isFinite(n)) {
        setPanelWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n)))
      }
    } catch { /* ignore */ }
  }, [])
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
            waPhoneNumber={waPhoneNumber}
            projectName={projectName}
            triggerKeywords={triggerKeywords}
            triggerMatchType={triggerMatchType}
            flowSlug={flowSlug}
            isPanelOpen={isOpen}
          />
        </div>
      </div>
    </div>
  )
}
