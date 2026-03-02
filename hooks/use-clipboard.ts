import { useState, useCallback, useEffect } from "react"
import type { Node, Edge } from "@xyflow/react"
import { useReactFlow } from "@xyflow/react"
import type { Platform } from "@/types"
import { changeTracker } from "@/utils/change-tracker"
import { toast } from "sonner"

interface UseClipboardParams {
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setPlatform: (platform: Platform) => void
  deleteNode: (nodeId: string) => void
  setSelectedNode: (node: Node | null) => void
  setIsPropertiesPanelOpen: (open: boolean) => void
  setNodeToFocus: (nodeId: string | null) => void
  isEditMode: boolean
  autoEnterEditMode: (
    setNodes: any,
    setEdges: any,
    setPlatform: any,
    nodes: Node[],
    edges: Edge[],
    platform: Platform
  ) => void
  updateDraftChanges: () => void
}

export function useClipboard({
  nodes,
  edges,
  platform,
  setNodes,
  setEdges,
  setPlatform,
  deleteNode,
  setSelectedNode,
  setIsPropertiesPanelOpen,
  setNodeToFocus,
  isEditMode,
  autoEnterEditMode,
  updateDraftChanges,
}: UseClipboardParams) {
  const [clipboard, setClipboard] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([])
  const [pastePosition, setPastePosition] = useState<{ x: number; y: number } | null>(null)

  const { screenToFlowPosition, getNodes } = useReactFlow()

  const copyNodes = useCallback(() => {
    if (selectedNodes.length === 0) return

    const copyableNodes = selectedNodes.filter((node) => node.type !== "start")

    if (copyableNodes.length === 0) {
      toast.error("Start nodes cannot be copied")
      return
    }

    if (copyableNodes.length !== selectedNodes.length) {
      toast.warning("Start nodes were excluded from copy operation")
    }

    const copyableNodeIds = copyableNodes.map((node) => node.id)
    const connectedEdges = edges.filter(
      (edge) => copyableNodeIds.includes(edge.source) && copyableNodeIds.includes(edge.target)
    )

    setClipboard({
      nodes: copyableNodes.map((node) => ({ ...node })),
      edges: connectedEdges.map((edge) => ({ ...edge })),
    })

    toast.success(`${copyableNodes.length} node${copyableNodes.length > 1 ? "s" : ""} copied to clipboard`)
    console.log("[v0] Copied nodes:", copyableNodes.length, "edges:", connectedEdges.length)
  }, [selectedNodes, edges])

  const pasteNodes = useCallback(
    (cursorPosition?: { x: number; y: number }) => {
      if (!clipboard) return

      const nodeIdMap = new Map<string, string>()

      const originalCenter = {
        x: clipboard.nodes.reduce((sum, node) => sum + node.position.x, 0) / clipboard.nodes.length,
        y: clipboard.nodes.reduce((sum, node) => sum + node.position.y, 0) / clipboard.nodes.length,
      }

      let targetPosition: { x: number; y: number }
      if (cursorPosition) {
        targetPosition = cursorPosition
      } else if (pastePosition) {
        targetPosition = pastePosition
      } else {
        targetPosition = { x: originalCenter.x + 50, y: originalCenter.y + 50 }
      }

      const newNodes = clipboard.nodes.map((node) => {
        const newNodeId = `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        nodeIdMap.set(node.id, newNodeId)

        const offsetFromCenter = {
          x: node.position.x - originalCenter.x,
          y: node.position.y - originalCenter.y,
        }

        return {
          ...node,
          id: newNodeId,
          position: {
            x: targetPosition.x + offsetFromCenter.x,
            y: targetPosition.y + offsetFromCenter.y,
          },
          data: { ...node.data, id: newNodeId },
        }
      })

      const newEdges = clipboard.edges
        .map((edge) => {
          const newSourceId = nodeIdMap.get(edge.source)
          const newTargetId = nodeIdMap.get(edge.target)

          if (!newSourceId || !newTargetId) return null

          return {
            ...edge,
            id: `e${newSourceId}-${newTargetId}-${Date.now()}`,
            source: newSourceId,
            target: newTargetId,
          }
        })
        .filter(Boolean) as Edge[]

      setNodes((nds) => [...nds, ...newNodes])
      setEdges((eds) => [...eds, ...newEdges])

      setSelectedNodes(newNodes)
      setSelectedNode(newNodes[0] || null)
      setIsPropertiesPanelOpen(true)

      if (newNodes.length > 0) {
        const firstNonComment = newNodes.find((n) => n.type !== "comment")
        if (firstNonComment) {
          setNodeToFocus(firstNonComment.id)
        }
      }

      console.log("[v0] Pasted nodes:", newNodes.length, "edges:", newEdges.length, "at position:", targetPosition)
    },
    [clipboard, setNodes, setEdges, pastePosition, setSelectedNode, setIsPropertiesPanelOpen, setNodeToFocus]
  )

  const selectAllNodes = useCallback(() => {
    const allNodes = getNodes()
    const selectableNodes = allNodes.filter((node) => node.type !== "start")
    setSelectedNodes(selectableNodes)
    setSelectedNode(selectableNodes[0] || null)
    setIsPropertiesPanelOpen(true)
  }, [getNodes, setSelectedNode, setIsPropertiesPanelOpen])

  // Single merged keyboard shortcuts effect (Ctrl+C, Ctrl+V, Ctrl+A, Delete/Backspace)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.contentEditable === "true") {
        return
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      // Delete key - delete selected nodes
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedNodes.length > 0) {
          event.preventDefault()
          console.log("[Keyboard] Delete key pressed - deleting selected nodes")

          selectedNodes.forEach((node) => {
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeDelete(node.id, node.type, node.data?.label as string | undefined)
          })
          updateDraftChanges()

          const nodeIds = selectedNodes.map((n) => n.id)
          setNodes((nds) => nds.filter((n) => !nodeIds.includes(n.id)))
          setEdges((eds) => eds.filter((e) => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)))

          setSelectedNodes([])
          setSelectedNode(null)
          setIsPropertiesPanelOpen(false)

          toast.success(`${selectedNodes.length} node(s) deleted`)
        }
      }

      if (isCtrlOrCmd) {
        switch (event.key.toLowerCase()) {
          case "c":
            if (selectedNodes.length > 0) {
              event.preventDefault()
              copyNodes()
            }
            break
          case "v":
            event.preventDefault()
            {
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
            }
            break
          case "a":
            event.preventDefault()
            selectAllNodes()
            break
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    copyNodes,
    pasteNodes,
    selectAllNodes,
    screenToFlowPosition,
    selectedNodes,
    isEditMode,
    autoEnterEditMode,
    setNodes,
    setEdges,
    setPlatform,
    updateDraftChanges,
    setSelectedNode,
    setIsPropertiesPanelOpen,
    nodes,
    edges,
    platform,
  ])

  return {
    clipboard,
    selectedNodes,
    setSelectedNodes,
    pastePosition,
    setPastePosition,
    copyNodes,
    pasteNodes,
    selectAllNodes,
  }
}
