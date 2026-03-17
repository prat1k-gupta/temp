import { useState, useCallback, useEffect } from "react"
import type { Node, Edge, Connection } from "@xyflow/react"
import { addEdge, useReactFlow } from "@xyflow/react"
import type { Platform, ContextMenuState, ConnectionMenuState, Coordinates } from "@/types"
import {
  getClientCoordinates,
  isDoubleClick,
  createCommentNode,
  createNode,
  createFlowTemplateNode,
} from "@/utils"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"
import { getFlow } from "@/utils/flow-storage"
import { INTERACTION_THRESHOLDS } from "@/constants"
import { changeTracker } from "@/utils/change-tracker"
import { toast } from "sonner"

interface UseFlowInteractionsParams {
  nodes: Node[]
  edges: Edge[]
  platform: Platform
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
  setPlatform: (platform: Platform) => void
  selectedNode: Node | null
  setSelectedNode: (node: Node | null | ((prev: Node | null) => Node | null)) => void
  selectedNodes: Node[]
  setSelectedNodes: (nodes: Node[]) => void
  setIsPropertiesPanelOpen: (open: boolean) => void
  setNodeToFocus: (nodeId: string | null) => void
  deleteNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, updates: any, shouldFocus?: boolean) => void
  convertNode: (nodeId: string, newNodeType: string, updatedData: any) => void
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
  copyNodes: () => void
  pasteNodes: (cursorPosition?: { x: number; y: number }) => void
  selectAllNodes: () => void
}

export function useFlowInteractions({
  nodes,
  edges,
  platform,
  setNodes,
  setEdges,
  setPlatform,
  selectedNode,
  setSelectedNode,
  selectedNodes,
  setSelectedNodes,
  setIsPropertiesPanelOpen,
  setNodeToFocus,
  deleteNode,
  updateNodeData,
  convertNode,
  isEditMode,
  autoEnterEditMode,
  updateDraftChanges,
  copyNodes,
  pasteNodes,
  selectAllNodes,
}: UseFlowInteractionsParams) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 })
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    isOpen: boolean
    x: number
    y: number
    nodeId: string | null
  }>({ isOpen: false, x: 0, y: 0, nodeId: null })
  const [draggedNodeType, setDraggedNodeType] = useState<string | null>(null)
  const [draggedNodeMeta, setDraggedNodeMeta] = useState<{ templateId?: string } | null>(null)
  const [connectionMenu, setConnectionMenu] = useState<ConnectionMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    sourceNodeId: null,
    sourceHandleId: null,
  })
  const [lastClickTime, setLastClickTime] = useState<number>(0)
  const [lastClickPosition, setLastClickPosition] = useState<Coordinates>({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)

  const { screenToFlowPosition } = useReactFlow()

  /** Helper: auto-enter edit mode if not already in it */
  const withEditTracking = useCallback(() => {
    if (!isEditMode) {
      autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
    }
  }, [isEditMode, autoEnterEditMode, setNodes, setEdges, setPlatform, nodes, edges, platform])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) {
        console.warn("[v0] Invalid connection params:", params)
        return
      }

      const existingConnection = edges.find(
        (edge) => edge.source === params.source && edge.sourceHandle === params.sourceHandle
      )

      if (existingConnection) {
        console.log("[v0] Connection blocked - source handle already connected:", {
          source: params.source,
          sourceHandle: params.sourceHandle,
          existingTarget: existingConnection.target,
        })
        return
      }

      const newEdge = {
        ...params,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      }

      withEditTracking()
      changeTracker.trackEdgeAdd(newEdge)
      updateDraftChanges()

      console.log("[v0] Creating new connection:", params)
      setEdges((eds) => addEdge(newEdge, eds))

      // Update condition node connectedNode data
      setNodes((nds) => {
        const targetNode = nds.find((n) => n.id === params.target)
        const sourceNode = nds.find((n) => n.id === params.source)

        if (targetNode?.type === "condition" && sourceNode && !params.targetHandle) {
          const updatedNodes = nds.map((node) =>
            node.id === params.target
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    connectedNode: {
                      id: sourceNode.id,
                      type: sourceNode.type,
                      label: sourceNode.data?.label || sourceNode.type,
                    },
                  },
                }
              : node
          )

          setSelectedNode((currentSelected: Node | null) => {
            if (currentSelected?.id === params.target) {
              return updatedNodes.find((n) => n.id === params.target) || currentSelected
            }
            return currentSelected
          })

          return updatedNodes
        }

        return nds
      })
    },
    [setEdges, edges, withEditTracking, updateDraftChanges, setNodes, setSelectedNode]
  )

  const onNodeDragStart = useCallback((event: React.DragEvent, nodeType: string, meta?: { templateId?: string }) => {
    setDraggedNodeType(nodeType)
    setDraggedNodeMeta(meta || null)
    event.dataTransfer.effectAllowed = "move"
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!draggedNodeType) return

      const { x: clientX, y: clientY } = getClientCoordinates(event)
      const position = screenToFlowPosition({ x: clientX, y: clientY })

      const newNodeId = `${draggedNodeType}-${Date.now()}`
      let newNode: Node

      try {
        if (draggedNodeType === "flowTemplate" && draggedNodeMeta?.templateId) {
          // Resolve template data from default templates or user templates (localStorage)
          const defaultTpl = DEFAULT_TEMPLATES.find((t) => t.id === draggedNodeMeta.templateId)
          let templateNodes: Node[] = []
          let templateEdges: import("@xyflow/react").Edge[] = []
          let templateName = "Template"
          let templateDescription: string | undefined
          let templateAiMetadata: any | undefined

          if (defaultTpl) {
            templateNodes = defaultTpl.nodes
            templateEdges = defaultTpl.edges
            templateName = defaultTpl.name
            templateDescription = defaultTpl.description
            templateAiMetadata = defaultTpl.aiMetadata
          } else {
            const userTpl = getFlow(draggedNodeMeta.templateId!)
            if (userTpl) {
              templateNodes = userTpl.nodes.filter((n) => n.type !== "start")
              templateEdges = userTpl.edges
              templateName = userTpl.name
              templateDescription = userTpl.description
              templateAiMetadata = userTpl.aiMetadata
            }
          }

          newNode = createFlowTemplateNode(
            platform,
            position,
            {
              sourceTemplateId: draggedNodeMeta.templateId,
              templateName,
              internalNodes: templateNodes,
              internalEdges: templateEdges,
              ...(templateDescription ? { description: templateDescription } : {}),
              ...(templateAiMetadata ? { aiMetadata: templateAiMetadata } : {}),
            },
            newNodeId
          )
        } else if (draggedNodeType === "comment") {
          newNode = createCommentNode(
            platform,
            position,
            newNodeId,
            (updates: any) => {
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === newNodeId
                    ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                    : node
                )
              )
            },
            () => deleteNode(newNodeId)
          )
        } else {
          newNode = createNode(draggedNodeType, platform, position, newNodeId)
        }

        withEditTracking()
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])
        setDraggedNodeType(null)
        setDraggedNodeMeta(null)
        if (draggedNodeType !== "comment") {
          setNodeToFocus(newNodeId)
        }
      } catch (error) {
        console.error(`[v0] Error creating dragged node ${draggedNodeType}:`, error)
        setDraggedNodeType(null)
        setDraggedNodeMeta(null)
      }
    },
    [draggedNodeType, draggedNodeMeta, setNodes, deleteNode, platform, withEditTracking, updateDraftChanges, screenToFlowPosition, setNodeToFocus]
  )

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
    event.preventDefault()
    if (!("clientX" in event) || !("clientY" in event)) return

    setContextMenu({
      isOpen: true,
      x: (event as any).clientX,
      y: (event as any).clientY,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, x: 0, y: 0 })
  }, [])

  const closeNodeContextMenu = useCallback(() => {
    setNodeContextMenu({ isOpen: false, x: 0, y: 0, nodeId: null })
  }, [])

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    event.stopPropagation()
    setNodeContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    })
  }, [])

  const addNodeAtPosition = useCallback(
    (nodeType: string) => {
      const { x: flowX, y: flowY } = screenToFlowPosition({
        x: contextMenu.x,
        y: contextMenu.y,
      })

      const position = { x: flowX, y: flowY }
      const newNodeId = `${nodeType}-${Date.now()}`
      let newNode: Node

      try {
        switch (nodeType) {
          case "comment":
            newNode = createCommentNode(
              platform,
              position,
              newNodeId,
              (updates: any) => {
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === newNodeId
                      ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                      : node
                  )
                )
              },
              () => deleteNode(newNodeId)
            )
            break
          case "question":
            newNode = createNode("question", platform, position, newNodeId)
            break
          case "quickReply":
            newNode = createNode("quickReply", platform, position, newNodeId)
            break
          case "interactiveList":
            newNode = createNode("interactiveList", platform, position, newNodeId)
            break
          default:
            console.warn(`[v0] Unknown node type: ${nodeType}`)
            return
        }

        withEditTracking()
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])
        closeContextMenu()
        if (nodeType !== "comment") {
          setNodeToFocus(newNodeId)
        }
      } catch (error) {
        console.error(`[v0] Error creating node ${nodeType}:`, error)
      }
    },
    [contextMenu, screenToFlowPosition, setNodes, closeContextMenu, platform, deleteNode, withEditTracking, updateDraftChanges, setNodeToFocus]
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === "start") return
      setSelectedNode(node)
      setIsPropertiesPanelOpen(true)
    },
    [setSelectedNode, setIsPropertiesPanelOpen]
  )

  const onNodeDoubleClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === "flowTemplate") {
      // Open template editor modal — handled via state in page.tsx
      if (typeof (window as any).__openTemplateEditor === "function") {
        (window as any).__openTemplateEditor(node.id)
      }
      return
    }
    const superNodeTypes = ["name", "email", "address", "dob"]
    if (superNodeTypes.includes(node.type || "")) {
      toast.info(`Configure ${node.data?.label || node.type} validation rules`, {
        description: "Configuration modal coming soon...",
        duration: 3000,
      })
    }
  }, [])

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodesFromFlow }: { nodes: Node[]; edges: Edge[] }) => {
      const filteredNodes = selectedNodesFromFlow.filter((node) => node.type !== "start")

      setSelectedNodes(filteredNodes)

      if (filteredNodes.length === 1) {
        setSelectedNode(filteredNodes[0])
        setIsPropertiesPanelOpen(true)
      } else if (filteredNodes.length > 1) {
        setSelectedNode(null)
        setIsPropertiesPanelOpen(true)
      } else {
        setSelectedNode(null)
        setIsPropertiesPanelOpen(false)
      }

      if (filteredNodes.length > 1) {
        toast.info(`${filteredNodes.length} nodes selected`)
      }
    },
    [setSelectedNodes, setSelectedNode, setIsPropertiesPanelOpen]
  )

  const onPaneClick = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      setSelectedNode(null)
      setSelectedNodes([])
      setIsPropertiesPanelOpen(false)

      const currentTime = Date.now()

      if (!("currentTarget" in event) || !("clientX" in event) || !("clientY" in event)) return

      const clickPosition: Coordinates = getClientCoordinates(event)

      if (
        isDoubleClick(
          currentTime,
          lastClickTime,
          clickPosition,
          lastClickPosition,
          INTERACTION_THRESHOLDS.doubleClick.time,
          INTERACTION_THRESHOLDS.doubleClick.distance
        )
      ) {
        console.log("[v0] Double-click detected at:", clickPosition)

        const position = screenToFlowPosition(clickPosition)

        const newNodeId = `comment-${Date.now()}`
        const newNode = createCommentNode(
          platform,
          position,
          newNodeId,
          (updates: any) => {
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }

            const currentNode = nodes.find((n) => n.id === newNodeId)
            if (currentNode) {
              const oldData = { ...currentNode.data }
              const newData = { ...oldData, ...updates }
              changeTracker.trackNodeUpdate(newNodeId, oldData, newData, currentNode.type, currentNode.type)
              updateDraftChanges()
            }

            setNodes((nds) =>
              nds.map((node) =>
                node.id === newNodeId
                  ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                  : node
              )
            )
          },
          () => deleteNode(newNodeId)
        )

        withEditTracking()
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])
      }

      setLastClickTime(currentTime)
      setLastClickPosition(clickPosition)
    },
    [
      lastClickTime,
      lastClickPosition,
      setNodes,
      deleteNode,
      platform,
      setSelectedNodes,
      setSelectedNode,
      setIsPropertiesPanelOpen,
      isEditMode,
      autoEnterEditMode,
      setEdges,
      setPlatform,
      nodes,
      edges,
      withEditTracking,
      updateDraftChanges,
      screenToFlowPosition,
    ]
  )

  const handleNodeTypeSelection = useCallback(
    (nodeType: string) => {
      if (!connectionMenu.sourceNodeId) {
        setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
        return
      }

      const newNodeId = `${nodeType}-${Date.now()}`
      const sourceNode = nodes.find((n) => n.id === connectionMenu.sourceNodeId)
      if (!sourceNode) {
        setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
        return
      }

      let nodePosition = screenToFlowPosition({
        x: connectionMenu.x,
        y: connectionMenu.y,
      })

      let newNode: Node

      if (nodeType === "comment") {
        newNode = createCommentNode(
          platform,
          nodePosition,
          newNodeId,
          (updates: any) => updateNodeData(newNodeId, updates),
          () => deleteNode(newNodeId)
        )
      } else {
        try {
          newNode = createNode(nodeType, platform, nodePosition, newNodeId)

          if (nodeType === "condition") {
            newNode.data = {
              ...newNode.data,
              connectedNode: {
                id: sourceNode.id,
                type: sourceNode.type,
                label: sourceNode.data?.label || sourceNode.type,
              },
            }
          }
        } catch (error) {
          console.error(`[v0] Error creating node type ${nodeType}:`, error)
          return
        }
      }

      const newEdge: Edge = {
        id: `e${connectionMenu.sourceNodeId}-${newNodeId}`,
        source: connectionMenu.sourceNodeId,
        sourceHandle: connectionMenu.sourceHandleId,
        target: newNodeId,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      }

      withEditTracking()
      changeTracker.trackNodeAdd(newNode)
      changeTracker.trackEdgeAdd(newEdge)
      updateDraftChanges()

      setNodes((nds) => [...nds, newNode])
      setEdges((eds) => [...eds, newEdge])
      setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
      setNodeToFocus(newNodeId)
    },
    [connectionMenu, nodes, setNodes, setEdges, platform, withEditTracking, updateDraftChanges, screenToFlowPosition, deleteNode, updateNodeData, setNodeToFocus]
  )

  const closeConnectionMenu = useCallback(() => {
    setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
  }, [])

  const onConnectStart = useCallback((event: MouseEvent | TouchEvent | React.MouseEvent, params: any) => {
    setIsConnecting(true)
    setConnectingFrom(params.nodeId)
  }, [])

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent | React.MouseEvent, connectionState: any) => {
      setIsConnecting(false)
      setConnectingFrom(null)

      if (connectionState && connectionState.fromNode) {
        const target = event.target as Element
        const isOnNode = target.closest(".react-flow__node")
        const isOnHandle = target.closest(".react-flow__handle")
        const isOnEdge = target.closest(".react-flow__edge")

        const { x: clientX, y: clientY } = getClientCoordinates(event)

        if (!isOnNode && !isOnHandle && !isOnEdge) {
          setConnectionMenu({
            isOpen: true,
            x: clientX,
            y: clientY,
            sourceNodeId: connectionState.fromNode.id,
            sourceHandleId: connectionState.fromHandle?.id || null,
          })
        }
      }
    },
    []
  )

  // Suppress ResizeObserver errors
  useEffect(() => {
    const handleResizeObserverError = (e: ErrorEvent) => {
      if (e.message === "ResizeObserver loop completed with undelivered notifications.") {
        e.preventDefault()
        e.stopPropagation()
        return false
      }
    }

    window.addEventListener("error", handleResizeObserverError)
    return () => {
      window.removeEventListener("error", handleResizeObserverError)
    }
  }, [])

  // Close context menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) closeContextMenu()
      if (nodeContextMenu.isOpen) closeNodeContextMenu()
    }

    if (contextMenu.isOpen || nodeContextMenu.isOpen) {
      document.addEventListener("click", handleClickOutside)
    }

    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  }, [contextMenu.isOpen, nodeContextMenu.isOpen, closeContextMenu, closeNodeContextMenu])

  return {
    contextMenu,
    nodeContextMenu,
    draggedNodeType,
    connectionMenu,
    isConnecting,
    connectingFrom,
    onConnect,
    onNodeDragStart,
    onDragOver,
    onDrop,
    onPaneContextMenu,
    closeContextMenu,
    closeNodeContextMenu,
    onNodeContextMenu,
    addNodeAtPosition,
    onNodeClick,
    onNodeDoubleClick,
    onSelectionChange,
    onPaneClick,
    handleNodeTypeSelection,
    closeConnectionMenu,
    onConnectStart,
    onConnectEnd,
  }
}
