"use client"

import { useMemo } from "react"
import type { Node, Edge } from "@xyflow/react"
import { X, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { buildFlowGraphString } from "@/lib/ai/tools/generate-flow"

interface FlowGraphPanelProps {
  nodes: Node[]
  edges: Edge[]
  isOpen: boolean
  onClose: () => void
}

export function FlowGraphPanel({ nodes, edges, isOpen, onClose }: FlowGraphPanelProps) {
  const graphString = useMemo(() => buildFlowGraphString(nodes, edges), [nodes, edges])

  if (!isOpen) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(graphString)
    toast.success("Flow graph copied to clipboard")
  }

  return (
    <div className="border-t border-border bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Flow Graph</span>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {nodes.length} nodes
          </Badge>
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {edges.length} edges
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 w-7 p-0" title="Copy graph">
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0" title="Close">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="overflow-auto max-h-[250px] p-4">
        <pre className="text-xs font-mono whitespace-pre text-foreground/80">{graphString}</pre>
      </div>
    </div>
  )
}
