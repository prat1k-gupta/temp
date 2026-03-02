"use client"

import type { Node, Edge } from "@xyflow/react"
import type { Platform, ContextMenuState } from "@/types"
import { MessageCircle, MessageSquare, List, MessageSquareText } from "lucide-react"
import { getAddNodeLabel, platformSupportsNodeType } from "@/utils/platform-labels"

interface PaneContextMenuProps {
  contextMenu: ContextMenuState
  platform: Platform
  selectedNodes: Node[]
  clipboard: { nodes: Node[]; edges: Edge[] } | null
  closeContextMenu: () => void
  addNodeAtPosition: (nodeType: string) => void
  copyNodes: () => void
  pasteNodes: (cursorPosition?: { x: number; y: number }) => void
  selectAllNodes: () => void
  screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }
}

export function PaneContextMenu({
  contextMenu,
  platform,
  selectedNodes,
  clipboard,
  closeContextMenu,
  addNodeAtPosition,
  copyNodes,
  pasteNodes,
  selectAllNodes,
  screenToFlowPosition,
}: PaneContextMenuProps) {
  if (!contextMenu.isOpen) return null

  return (
    <div
      className="fixed bg-card border border-border rounded-md shadow-lg py-2 z-50 min-w-[160px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onMouseLeave={closeContextMenu}
    >
      {selectedNodes.length > 0 && (
        <>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
            onClick={() => {
              copyNodes()
              closeContextMenu()
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy {selectedNodes.length > 1 ? `(${selectedNodes.length})` : ""}
          </button>
          <div className="border-t border-border my-1" />
        </>
      )}
      {clipboard && (
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
          onClick={() => {
            const flowPosition = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y })
            pasteNodes(flowPosition)
            closeContextMenu()
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Paste Here
        </button>
      )}
      {selectedNodes.length > 0 && (
        <>
          <div className="border-t border-border my-1" />
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
            onClick={() => {
              selectAllNodes()
              closeContextMenu()
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Select All
          </button>
          <div className="border-t border-border my-1" />
        </>
      )}
      <button
        className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
        onClick={() => addNodeAtPosition("comment")}
      >
        <MessageSquareText className="w-4 h-4" />
        Add Comment
      </button>
      <div className="border-t border-border my-1" />
      <button
        className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
        onClick={() => addNodeAtPosition("question")}
      >
        <MessageCircle className="w-4 h-4" />
        {getAddNodeLabel("question", platform)}
      </button>
      <button
        className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
        onClick={() => addNodeAtPosition("quickReply")}
      >
        <MessageSquare className="w-4 h-4" />
        {getAddNodeLabel("quickReply", platform)}
      </button>
      {platformSupportsNodeType(platform, "interactiveList") && (
        <button
          className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
          onClick={() => addNodeAtPosition("interactiveList")}
        >
          <List className="w-4 h-4" />
          {getAddNodeLabel("list", platform)}
        </button>
      )}
    </div>
  )
}
