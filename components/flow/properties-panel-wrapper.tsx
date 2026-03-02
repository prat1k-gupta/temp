"use client"

import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import { useReactFlow } from "@xyflow/react"
import { PropertiesPanel } from "@/components/properties-panel"
import { Button } from "@/components/ui/button"

interface PropertiesPanelWrapperProps {
  selectedNode: Node | null
  selectedNodes: Node[]
  isOpen: boolean
  platform: Platform
  nodes: Node[]
  clipboard: { nodes: Node[]; edges: Edge[] } | null
  onClose: () => void
  onNodeUpdate: (nodeId: string, updates: any, shouldFocus?: boolean) => void
  copyNodes: () => void
  pasteNodes: (cursorPosition?: { x: number; y: number }) => void
  selectAllNodes: () => void
}

export function PropertiesPanelWrapper({
  selectedNode,
  selectedNodes,
  isOpen,
  platform,
  nodes,
  clipboard,
  onClose,
  onNodeUpdate,
  copyNodes,
  pasteNodes,
  selectAllNodes,
}: PropertiesPanelWrapperProps) {
  const { screenToFlowPosition } = useReactFlow()

  return (
    <div
      className={`transition-all duration-300 ease-in-out ${isOpen ? "w-80" : "w-0"} overflow-hidden bg-background border-l border-border`}
    >
      {selectedNode && (
        <div className="w-80 flex flex-col h-full">
          <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-semibold text-foreground">Properties</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <span className="sr-only">Close properties panel</span>&times;
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <PropertiesPanel
              selectedNode={selectedNode}
              platform={platform}
              onNodeUpdate={onNodeUpdate}
              allNodes={nodes}
            />
          </div>
        </div>
      )}
      {!selectedNode && isOpen && (
        <div className="w-80">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Multiple Selection</h2>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <span className="sr-only">Close properties panel</span>&times;
            </Button>
          </div>
          <div className="p-4 space-y-4">
            <div className="text-sm text-muted-foreground">
              {selectedNodes.length} nodes selected
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyNodes}
                className="w-full justify-start"
                disabled={selectedNodes.length === 0}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Selected
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const reactFlowElement = document.querySelector(".react-flow")
                  if (reactFlowElement) {
                    const rect = reactFlowElement.getBoundingClientRect()
                    const centerX = rect.left + rect.width / 2
                    const centerY = rect.top + rect.height / 2
                    const flowPosition = screenToFlowPosition({ x: centerX, y: centerY })
                    pasteNodes(flowPosition)
                  } else {
                    pasteNodes()
                  }
                }}
                className="w-full justify-start"
                disabled={!clipboard}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Paste at Center
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={selectAllNodes}
                className="w-full justify-start"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Select All
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <div>Keyboard shortcuts:</div>
              <div><kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+C</kbd> Copy</div>
              <div><kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+V</kbd> Paste</div>
              <div><kbd className="px-1 py-0.5 bg-muted rounded text-xs">Ctrl+A</kbd> Select All</div>
              <div><kbd className="px-1 py-0.5 bg-muted rounded text-xs">Delete</kbd> Delete Selected</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
