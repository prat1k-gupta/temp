"use client"

import type { Node, Edge } from "@xyflow/react"

interface NodeContextMenuProps {
  nodeContextMenu: {
    isOpen: boolean
    x: number
    y: number
    nodeId: string | null
  }
  nodes: Node[]
  clipboard: { nodes: Node[]; edges: Edge[] } | null
  closeNodeContextMenu: () => void
  setSelectedNodes: (nodes: Node[]) => void
  copyNodes: () => void
  pasteNodes: (cursorPosition?: { x: number; y: number }) => void
  deleteNode: (nodeId: string) => void
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }
}

export function NodeContextMenu({
  nodeContextMenu,
  nodes,
  clipboard,
  closeNodeContextMenu,
  setSelectedNodes,
  copyNodes,
  pasteNodes,
  deleteNode,
  screenToFlowPosition,
}: NodeContextMenuProps) {
  if (!nodeContextMenu.isOpen) return null

  return (
    <div
      className="fixed bg-card border border-border rounded-md shadow-lg py-2 z-50 min-w-[160px]"
      style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
      onMouseLeave={closeNodeContextMenu}
    >
      <button
        className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
        onClick={() => {
          const node = nodes.find((n) => n.id === nodeContextMenu.nodeId)
          if (node) {
            setSelectedNodes([node])
            copyNodes()
          }
          closeNodeContextMenu()
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Copy Node
      </button>
      {clipboard && (
        <>
          <div className="border-t border-border my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
            onClick={() => {
              const flowPosition = screenToFlowPosition({ x: nodeContextMenu.x, y: nodeContextMenu.y })
              pasteNodes(flowPosition)
              closeNodeContextMenu()
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste Here
          </button>
        </>
      )}
      <div className="border-t border-border my-1" />
      <button
        className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 text-destructive"
        onClick={() => {
          if (nodeContextMenu.nodeId) {
            deleteNode(nodeContextMenu.nodeId)
          }
          closeNodeContextMenu()
        }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete Node
      </button>
    </div>
  )
}
