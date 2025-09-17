"use client"

import type React from "react"
import { useState, useCallback, useEffect } from "react"
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// Component imports
import { StartNode } from "@/components/nodes/start-node"
import { QuestionNode } from "@/components/nodes/question-node"
import { QuickReplyNode } from "@/components/nodes/quick-reply-node"
import { WhatsAppListNode } from "@/components/nodes/whatsapp-list-node"
import { CommentNode } from "@/components/nodes/comment-node"
import { WhatsAppQuestionNode } from "@/components/nodes/whatsapp/whatsapp-question-node"
import { WhatsAppQuickReplyNode } from "@/components/nodes/whatsapp/whatsapp-quick-reply-node"
import { WhatsAppListNode as WhatsAppListNodeSpecific } from "@/components/nodes/whatsapp/whatsapp-list-node"
import { WhatsAppMessageNode } from "@/components/nodes/whatsapp/whatsapp-message-node"
import { InstagramQuestionNode } from "@/components/nodes/instagram/instagram-question-node"
import { InstagramQuickReplyNode } from "@/components/nodes/instagram/instagram-quick-reply-node"
import { InstagramListNode } from "@/components/nodes/instagram/instagram-list-node"
import { InstagramDMNode } from "@/components/nodes/instagram/instagram-dm-node"
import { InstagramStoryNode } from "@/components/nodes/instagram/instagram-story-node"
import { NodeSidebar } from "@/components/node-sidebar"
import { PropertiesPanel } from "@/components/properties-panel"
import { PlatformSelector } from "@/components/platform-selector"
import { Button } from "@/components/ui/button"
import { Download, Save, Undo2, Redo2, MessageCircle, MessageSquare, List, MessageSquareText } from "lucide-react"
import { ConnectionMenu } from "@/components/connection-menu"
import { ThemeToggle } from "@/components/theme-toggle"

// Modular imports
import type { 
  Platform, 
  NodeData, 
  ButtonData, 
  OptionData, 
  ContextMenuState, 
  ConnectionMenuState, 
  Coordinates 
} from "@/types"
import { 
  BUTTON_LIMITS, 
  OPTION_LIMITS, 
  INTERACTION_THRESHOLDS 
} from "@/constants"
import { 
  getClientCoordinates,
  isDoubleClick,
  getPlatformSpecificNodeType,
  getPlatformSpecificLabel,
  getPlatformSpecificContent,
  isValidNodeId,
  isValidPlatform,
  createButtonData,
  createOptionData,
  canAddMoreButtons,
  createNode,
  createCommentNode
} from "@/utils"

const nodeTypes = {
  start: StartNode,
  question: QuestionNode,
  quickReply: QuickReplyNode,
  whatsappList: WhatsAppListNode,
  comment: CommentNode,
  // WhatsApp specific nodes
  whatsappQuestion: WhatsAppQuestionNode,
  whatsappQuickReply: WhatsAppQuickReplyNode,
  whatsappListSpecific: WhatsAppListNodeSpecific,
  whatsappMessage: WhatsAppMessageNode,
  // Instagram specific nodes
  instagramQuestion: InstagramQuestionNode,
  instagramQuickReply: InstagramQuickReplyNode,
  instagramList: InstagramListNode,
  instagramDM: InstagramDMNode,
  instagramStory: InstagramStoryNode,
}

const initialNodes: Node[] = [
  {
    id: "1",
    type: "start",
    position: { x: 250, y: 25 },
    data: { label: "Start", platform: "web" },
  },
  {
    id: "2",
    type: "question",
    position: { x: 250, y: 150 },
    data: {
      label: "Welcome Question",
      question: "Hello! How can I help you today?",
      characterLimit: 160,
      platform: "web",
    },
  },
]

const initialEdges: Edge[] = [
  {
    id: "e1-2",
    source: "1",
    target: "2",
    type: "default",
    style: { stroke: "#6366f1", strokeWidth: 2 },
  },
]

export default function MagicFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null)
  const [platform, setPlatform] = useState<Platform>("web")
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  })
  const [draggedNodeType, setDraggedNodeType] = useState<string | null>(null)
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
  const [nodeToFocus, setNodeToFocus] = useState<string | null>(null)

  const { screenToFlowPosition, fitView, setCenter, getViewport, getNode } = useReactFlow();

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        // Use fitView to optimally show the specific node
        fitView({ 
          nodes: [{ id: nodeId }], 
          duration: 1200,
          padding: 0.2,
          minZoom: 0.5,
          maxZoom: 2.0
        });
        // Also select the node to highlight it
        setSelectedNode(node);
        setIsPropertiesPanelOpen(true);
      }
    },
    [nodes, fitView, setSelectedNode, setIsPropertiesPanelOpen]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null)
        setIsPropertiesPanelOpen(false)
      }
    },
    [setNodes, setEdges, selectedNode, setIsPropertiesPanelOpen],
  )

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
      setSelectedEdge(null)
    },
    [setEdges],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) {
        console.warn("[v0] Invalid connection params:", params)
        return
      }

      const existingConnection = edges.find(
        (edge) => edge.source === params.source && edge.sourceHandle === params.sourceHandle,
      )

      if (existingConnection) {
        console.log("[v0] Connection blocked - source handle already connected:", {
          source: params.source,
          sourceHandle: params.sourceHandle,
          existingTarget: existingConnection.target,
        })
        return
      }

      console.log("[v0] Creating new connection:", params)
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "default",
            style: { stroke: "#6366f1", strokeWidth: 2 },
          },
          eds,
        ),
      )
    },
    [setEdges, edges],
  )

  const addButtonToNode = useCallback(
    (nodeId: string) => {
      try {
        const node = nodes.find((n) => n.id === nodeId)
        if (!node) {
          console.warn(`[v0] Node with id ${nodeId} not found`)
          return
        }

        // Handle question nodes (convert to quick reply)
        if (node.type === "question" || node.type === "whatsappQuestion" || node.type === "instagramQuestion") {
          const platform = (node.data.platform as Platform) || "web"
          const newType = getPlatformSpecificNodeType("quickReply", platform)
          
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    type: newType,
                    data: {
                      ...n.data,
                      buttons: [{ text: "Option 1" }],
                    },
                  }
                : n,
            ),
          )
          // Request focus on the converted node
          setNodeToFocus(nodeId)
        } 
        // Handle quick reply nodes (add button or convert to list)
        else if (node.type === "quickReply" || node.type === "whatsappQuickReply" || node.type === "instagramQuickReply") {
          const currentButtons: ButtonData[] = (node.data.buttons as ButtonData[]) || []
          const platform = (node.data.platform as Platform) || "web"
          
          if (!canAddMoreButtons(currentButtons, platform)) {
            // Convert to list node if at max buttons
            const newType = getPlatformSpecificNodeType("whatsappList", platform)
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      type: newType,
                      data: {
                        ...n.data,
                        options: [...currentButtons, createOptionData("", currentButtons.length)] as OptionData[],
                      },
                    }
                  : n,
              ),
            )
            // Request focus on the converted node
            setNodeToFocus(nodeId)
          } else {
            // Add button
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        buttons: [...currentButtons, createButtonData("", currentButtons.length)] as ButtonData[],
                      },
                    }
                  : n,
              ),
            )
          }
        } 
        // Handle list nodes (add option)
        else if (node.type === "whatsappList" || node.type === "whatsappListSpecific" || node.type === "instagramList") {
          const currentOptions: OptionData[] = (node.data.options as OptionData[]) || []
          if (currentOptions.length < OPTION_LIMITS.all) {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        options: [...currentOptions, createOptionData("", currentOptions.length)] as OptionData[],
                      },
                    }
                  : n,
              ),
            )
          }
        }
      } catch (error) {
        console.error(`[v0] Error adding button to node ${nodeId}:`, error)
      }
    },
    [nodes, setNodes],
  )

  const addConnectedNode = useCallback(
    (sourceNodeId: string) => {
      const newNodeId = `${Date.now()}`
      const sourceNode = nodes.find((n) => n.id === sourceNodeId)
      if (!sourceNode) return

      const newNode: Node = {
        id: newNodeId,
        type: "question",
        position: {
          x: sourceNode.position.x + 300,
          y: sourceNode.position.y,
        },
        data: {
          label: "New Question",
          question: "What would you like to know?",
        },
      }

      const newEdge: Edge = {
        id: `e${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      }

      setNodes((nds) => [...nds, newNode])
      setEdges((eds) => [...eds, newEdge])
      // Request focus on the newly created connected node
      setNodeToFocus(newNodeId)
    },
    [nodes, setNodes, setEdges],
  )

  const exportFlow = useCallback(() => {
    const flowData = {
      nodes: nodes.map(({ data, ...node }) => ({ ...node, data })),
      edges: edges.map(({ style, ...edge }) => edge),
      platform,
      timestamp: new Date().toISOString(),
    }

    const dataStr = JSON.stringify(flowData, null, 2)
    const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr)

    const exportFileDefaultName = `magic-flow-${platform}-${Date.now()}.json`

    const linkElement = document.createElement("a")
    linkElement.setAttribute("href", dataUri)
    linkElement.setAttribute("download", exportFileDefaultName)
    linkElement.click()
  }, [nodes, edges, platform])

  const onNodeDragStart = useCallback((event: React.DragEvent, nodeType: string) => {
    setDraggedNodeType(nodeType)
    event.dataTransfer.effectAllowed = "move"
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      console.log("[v0] Dropping node at position:", getClientCoordinates(event))

      if (!draggedNodeType) return

      const reactFlowBounds = event.currentTarget.getBoundingClientRect()
      const { x: clientX, y: clientY } = getClientCoordinates(event)
      console.log("[v0] React flow bounds:", reactFlowBounds)

      const position = {
        x: clientX ,
        y: clientY,
      }

      console.log("[v0] Dragging node at position:", position)

      const newNodeId = `${draggedNodeType}-${Date.now()}`
      let newNode: Node

      try {
        switch (draggedNodeType) {
          case "question":
            newNode = createNode("question", platform, position, newNodeId)
            break
          case "quickReply":
            newNode = createNode("quickReply", platform, position, newNodeId)
            break
          case "whatsappList":
            newNode = createNode("whatsappList", platform, position, newNodeId)
            break
          case "comment":
            newNode = createCommentNode(
              platform,
              position,
              newNodeId,
              (updates: any) => {
                console.log("[v0] Comment inline update:", newNodeId, updates)
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === newNodeId
                      ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                      : node,
                  ),
                )
              },
              () => deleteNode(newNodeId)
            )
            break
          default:
            console.warn(`[v0] Unknown dragged node type: ${draggedNodeType}`)
            return
        }

        setNodes((nds) => [...nds, newNode])
        setDraggedNodeType(null)
        // Request focus on the newly created node
        setNodeToFocus(newNodeId)
      } catch (error) {
        console.error(`[v0] Error creating dragged node ${draggedNodeType}:`, error)
        setDraggedNodeType(null)
      }
    },
    [draggedNodeType, setNodes, deleteNode, platform],
  )

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
    event.preventDefault()
    
    // Type guard to check if event has React properties
    if (!('clientX' in event) || !('clientY' in event)) {
      return
    }
    
    setContextMenu({
      isOpen: true,
      x: (event as any).clientX,
      y: (event as any).clientY,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, x: 0, y: 0 })
  }, [])

  const addComment = useCallback(
    (x: number, y: number) => {
      const newNodeId = `comment-${Date.now()}`
      const position = { x: x - 100, y: y - 50 }
      
      const newNode = createCommentNode(
        platform,
        position,
        newNodeId,
        (updates: any) => {
          console.log("[v0] Comment inline update:", newNodeId, updates)
          setNodes((nds) =>
            nds.map((node) =>
              node.id === newNodeId ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() } : node,
            ),
          )
        },
        () => deleteNode(newNodeId)
      )
      
      setNodes((nds) => [...nds, newNode])
      closeContextMenu()
      // Request focus on the newly created comment node
      setNodeToFocus(newNodeId)
    },
    [setNodes, closeContextMenu, deleteNode, platform],
  )

  const addNodeFromMenu = useCallback(
    (nodeType: string, x: number, y: number) => {
      const position = { x: x - 100, y: y - 50 }
      const newNodeId = `${nodeType}-${Date.now()}`
      let newNode: Node

      try {
        switch (nodeType) {
          case "question":
            newNode = createNode("question", platform, position, newNodeId)
            break
          case "quickReply":
            newNode = createNode("quickReply", platform, position, newNodeId)
            break
          case "whatsappList":
            newNode = createNode("whatsappList", platform, position, newNodeId)
            break
          default:
            console.warn(`[v0] Unknown node type: ${nodeType}`)
            return
        }

        setNodes((nds) => [...nds, newNode])
        closeContextMenu()
        // Request focus on the newly created node
        setNodeToFocus(newNodeId)
      } catch (error) {
        console.error(`[v0] Error creating node ${nodeType}:`, error)
      }
    },
    [setNodes, closeContextMenu, platform],
  )

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setIsPropertiesPanelOpen(true)
  }, [])

  const onPaneClick = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      setSelectedNode(null)
      setSelectedEdge(null)
      setIsPropertiesPanelOpen(false)

      const currentTime = Date.now()
      
      // Type guard to check if event has React properties
      if (!('currentTarget' in event) || !('clientX' in event) || !('clientY' in event)) {
        return
      }
      
      const reactFlowBounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const clickPosition: Coordinates = {
        x: (event as any).clientX - reactFlowBounds.left,
        y: (event as any).clientY - reactFlowBounds.top,
      }

      // Double-click detected if within threshold
      if (isDoubleClick(currentTime, lastClickTime, clickPosition, lastClickPosition, 
                       INTERACTION_THRESHOLDS.doubleClick.time, 
                       INTERACTION_THRESHOLDS.doubleClick.distance)) {
        console.log("[v0] Double-click detected at:", clickPosition)

        const position = {
          x: clickPosition.x - 100, // Center the node
          y: clickPosition.y - 50, // Center the node
        }

        const newNodeId = `comment-${Date.now()}`
        const newNode = createCommentNode(
          platform,
          position,
          newNodeId,
          (updates: any) => {
            console.log("[v0] Comment inline update:", newNodeId, updates)
            setNodes((nds) =>
              nds.map((node) =>
                node.id === newNodeId
                  ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                  : node,
              ),
            )
          },
          () => deleteNode(newNodeId)
        )
        setNodes((nds) => [...nds, newNode])
        console.log("[v0] Added comment node at position:", position)
        // Request focus on the newly created comment node
        setNodeToFocus(newNodeId)
      }

      setLastClickTime(currentTime)
      setLastClickPosition(clickPosition)
    },
    [lastClickTime, lastClickPosition, setNodes, deleteNode, platform],
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

      const reactFlowElement = document.querySelector(".react-flow")
      const reactFlowBounds = reactFlowElement?.getBoundingClientRect()

      let nodePosition = screenToFlowPosition({
        x: connectionMenu.x,
        y: connectionMenu.y,
      })

      console.log("[v0] creating node", {
        nodeType,
        nodePosition,
        newNodeId,
        sourceNode,
        connectionMenu,
      })

      let newNode: Node

      switch (nodeType) {
        case "question":
          newNode = createNode("question", platform, nodePosition, newNodeId)
          break
        case "quickReply":
          newNode = createNode("quickReply", platform, nodePosition, newNodeId)
          break
        case "whatsappList":
          newNode = createNode("whatsappList", platform, nodePosition, newNodeId)
          break
        default:
          // Default to question node for unknown types
          newNode = createNode("question", platform, nodePosition, newNodeId, {
            label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
            question: `${nodeType} step`,
          })
      }

      const newEdge: Edge = {
        id: `e${connectionMenu.sourceNodeId}-${newNodeId}`,
        source: connectionMenu.sourceNodeId,
        sourceHandle: connectionMenu.sourceHandleId,
        target: newNodeId,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      }

      setNodes((nds) => [...nds, newNode])
      setEdges((eds) => [...eds, newEdge])
      setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
      // Request focus on the newly created node
      setNodeToFocus(newNodeId)
    },
    [connectionMenu.sourceNodeId, connectionMenu.sourceHandleId, nodes, setNodes, setEdges, platform],
  )

  const updateNodeData = useCallback(
    (nodeId: string, updates: any, shouldFocus: boolean = false) => {
      try {
        if (!isValidNodeId(nodeId)) {
          console.error("[v0] Invalid nodeId provided to updateNodeData:", nodeId)
          return
        }
        
        console.log("[v0] Updating node data:", nodeId, updates)
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              const updatedNode = {
                ...node,
                data: { ...node.data, ...updates },
                _timestamp: Date.now(),
              }
              console.log("[v0] Updated node:", updatedNode)
              return updatedNode
            }
            return node
          }),
        )
        setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...updates } } : prev))
        
        // Request focus on the node if requested (for significant updates)
        if (shouldFocus) {
          setNodeToFocus(nodeId)
        }
      } catch (error) {
        console.error(`[v0] Error updating node data for ${nodeId}:`, error)
      }
    },
    [setNodes, setSelectedNode],
  )

  const closeConnectionMenu = useCallback(() => {
    setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
  }, [])

  const onConnectStart = useCallback((event: MouseEvent | TouchEvent | React.MouseEvent, params: any) => {
    console.log("[v0] Connection start:", params)
    setIsConnecting(true)
    setConnectingFrom(params.nodeId)
    console.log("[v0] Connection state set - isConnecting: true, connectingFrom:", params.nodeId)
  }, [])

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent | React.MouseEvent, connectionState: any) => {
      console.log("[v0] Connection end - event:", event.type, "connectionState:", connectionState)
      console.log(
        "[v0] Connection end - current state - isConnecting:",
        isConnecting,
        "connectingFrom:",
        connectingFrom,
      )

      // Reset connection state first
      setIsConnecting(false)
      setConnectingFrom(null)

      // Check if we have a valid connection attempt
      if (connectionState && connectionState.fromNode) {
        const target = event.target as Element
        const isOnNode = target.closest(".react-flow__node")
        const isOnHandle = target.closest(".react-flow__handle")
        const isOnEdge = target.closest(".react-flow__edge")

        console.log("[v0] Connection end - target analysis:", {
          isOnNode: !!isOnNode,
          isOnHandle: !!isOnHandle,
          isOnEdge: !!isOnEdge,
          targetElement: target.className,
          ...getClientCoordinates(event),
          fromNode: connectionState.fromNode.id,
        })

        const { x: clientX, y: clientY } = getClientCoordinates(event)

        // Show menu only when dropping in empty space (not on nodes, handles, or edges)
        if (!isOnNode && !isOnHandle && !isOnEdge) {
          console.log("[v0] Showing connection menu at:", clientX, clientY)
          setConnectionMenu({
            isOpen: true,
            x: clientX,
            y: clientY,
            sourceNodeId: connectionState.fromNode.id,
            sourceHandleId: connectionState.fromHandle?.id || null,
          })
        } else {
          console.log("[v0] Not showing menu - dropped on:", {
            node: !!isOnNode,
            handle: !!isOnHandle,
            edge: !!isOnEdge,
          })
        }
      } else {
        console.log("[v0] Not showing menu - no connection state or fromNode")
      }
    },
    [isConnecting, connectingFrom],
  )

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation()
    setSelectedEdge(edge)
    setSelectedNode(null)
    setIsPropertiesPanelOpen(false)
  }, [])

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedEdge) {
          event.preventDefault()
          deleteEdge(selectedEdge.id)
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedEdge, deleteEdge])

  const convertNodesToPlatform = useCallback(
    (newPlatform: Platform) => {
      console.log("[v0] Converting nodes to platform:", newPlatform)

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          // Skip start and comment nodes as they don't need platform conversion
          if (node.type === "start" || node.type === "comment") {
            return {
              ...node,
              data: { ...node.data, platform: newPlatform } as NodeData
            }
          }

          let newType = node.type
          const newData: any = { ...node.data, platform: newPlatform }

          // Convert question nodes
          if (node.type === "question" || node.type === "whatsappQuestion" || node.type === "instagramQuestion") {
            switch (newPlatform) {
              case "whatsapp":
                newType = "whatsappQuestion"
                newData.label = "WhatsApp Message"
                break
              case "instagram":
                newType = "instagramQuestion"
                newData.label = "Instagram Message"
                break
              default:
                newType = "question"
                newData.label = "Question"
            }
          }

          // Convert quick reply nodes
          if (node.type === "quickReply" || node.type === "whatsappQuickReply" || node.type === "instagramQuickReply") {
            switch (newPlatform) {
              case "whatsapp":
                newType = "whatsappQuickReply"
                newData.label = "WhatsApp Actions"
                break
              case "instagram":
                newType = "instagramQuickReply"
                newData.label = "Instagram Actions"
                break
              default:
                newType = "quickReply"
                newData.label = "Quick Reply"
            }
          }

          // Convert list nodes
          if (node.type === "whatsappList" || node.type === "whatsappListSpecific" || node.type === "instagramList") {
            switch (newPlatform) {
              case "whatsapp":
                newType = "whatsappListSpecific"
                newData.label = "WhatsApp List"
                break
              case "instagram":
                newType = "instagramList"
                newData.label = "Instagram List"
                break
              default:
                newType = "whatsappList"
                newData.label = "WhatsApp List"
            }
          }

          // Convert message/DM/story nodes
          if (node.type === "whatsappMessage" || node.type === "instagramDM" || node.type === "instagramStory") {
            switch (newPlatform) {
              case "whatsapp":
                newType = "whatsappMessage"
                newData.label = "WhatsApp Message"
                // Ensure text field exists for BaseNode components
                if (!newData.text && newData.question) {
                  newData.text = newData.question
                }
                break
              case "instagram":
                // Convert to Instagram DM by default
                newType = "instagramDM"
                newData.label = "Instagram DM"
                // Ensure text field exists for BaseNode components
                if (!newData.text && newData.question) {
                  newData.text = newData.question
                }
                break
              default:
                // Convert to question node for web platform
                newType = "question"
                newData.label = "Question"
                // Ensure question field exists for custom nodes
                if (!newData.question && newData.text) {
                  newData.question = newData.text
                }
            }
          }

          return {
            ...node,
            type: newType,
            data: newData,
          }
        }),
      )
    },
    [setNodes],
  )

  const handlePlatformChange = useCallback(
    (newPlatform: Platform) => {
      console.log("[v0] Platform changed to:", newPlatform)
      setPlatform(newPlatform)
      convertNodesToPlatform(newPlatform)
    },
    [convertNodesToPlatform],
  )

  // Update selected node when nodes change (e.g., after platform conversion)
  useEffect(() => {
    if (selectedNode) {
      const updatedNode = nodes.find(n => n.id === selectedNode.id)
      if (updatedNode && updatedNode !== selectedNode) {
        setSelectedNode(updatedNode)
      }
    }
  }, [nodes, selectedNode])

  // Handle focusing on newly created nodes
  useEffect(() => {
    if (nodeToFocus) {
      // Try to get the node from ReactFlow's internal state first
      const reactFlowNode = getNode(nodeToFocus)
      const stateNode = nodes.find(n => n.id === nodeToFocus)
      const node = reactFlowNode || stateNode
      
      if (node) {
        // Use a small delay to ensure the node is fully rendered
        setTimeout(() => {
          // Use fitView to optimally show the specific node
          fitView({ 
            nodes: [{ id: nodeToFocus }], 
            duration: 1200,
            padding: 0.2, // 20% padding around the node
            minZoom: 0.5,  // Minimum zoom level
            maxZoom: 2.0   // Maximum zoom level
          })
          setSelectedNode(node)
          setIsPropertiesPanelOpen(true)
        }, 100)
        setNodeToFocus(null) // Reset the focus request
      } else {
        // If node not found, try again after a short delay
        setTimeout(() => {
          const retryReactFlowNode = getNode(nodeToFocus)
          const retryStateNode = nodes.find(n => n.id === nodeToFocus)
          const retryNode = retryReactFlowNode || retryStateNode
          
          if (retryNode) {
            fitView({ 
              nodes: [{ id: nodeToFocus }], 
              duration: 1200,
              padding: 0.2,
              minZoom: 0.5,
              maxZoom: 2.0
            })
            setSelectedNode(retryNode)
            setIsPropertiesPanelOpen(true)
            setNodeToFocus(null)
          } else {
            setNodeToFocus(null) // Clear the focus request to prevent infinite retries
          }
        }, 200)
      }
    }
  }, [nodes, nodeToFocus, setCenter, setSelectedNode, setIsPropertiesPanelOpen, getNode])

  return (
    <div className="h-screen flex bg-background">
      <NodeSidebar onNodeDragStart={onNodeDragStart} platform={platform} />

      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-foreground">Magic Flow</h1>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" disabled>
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled>
                  <Redo2 className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={exportFlow}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <PlatformSelector platform={platform} onPlatformChange={handlePlatformChange} />
            </div>
          </div>
        </div>

        <div className="h-full pt-20">
          <ReactFlow
            key={`flow-${nodes.length}-${edges.length}`}
            nodes={nodes
              .filter((node) => {
                if (!node || !node.id || !node.type || !node.position || !node.data) {
                  console.warn("[v0] Invalid node filtered out:", node)
                  return false
                }
                return true
              })
              .map((node) => {
                return {
                  ...node,
                  selected: selectedNode?.id === node.id,
                  data: {
                    ...node.data,
                    id: node.id,
                    onNodeUpdate: updateNodeData,
                    onAddButton: () => addButtonToNode(node.id),
                    onAddOption: () => addButtonToNode(node.id),
                    onAddConnection: () => addConnectedNode(node.id),
                    onDelete: () => deleteNode(node.id),
                  },
                }
              })}
            edges={edges
              .filter((edge) => {
                if (!edge || !edge.id || !edge.source || !edge.target) {
                  console.warn("[v0] Invalid edge filtered out:", edge)
                  return false
                }
                return true
              })
              .map((edge) => ({
                ...edge,
                selected: selectedEdge?.id === edge.id,
                style: {
                  ...edge.style,
                  strokeWidth: selectedEdge?.id === edge.id ? 3 : 2,
                  stroke: selectedEdge?.id === edge.id ? "#ef4444" : "#6366f1",
                },
              }))}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            className="bg-background"
            connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}
            defaultEdgeOptions={{
              type: "default",
              style: { stroke: "#6366f1", strokeWidth: 2 },
            }}
            onError={(error) => {
              console.error("[v0] React Flow error:", error)
            }}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
          >
            <Controls className="bg-card border-border shadow-lg" />
            <MiniMap
              className="bg-card border-border shadow-lg"
              nodeColor={(node) => {
                switch (node.type) {
                  case "start":
                    return "hsl(var(--chart-2))"
                  case "question":
                    return "hsl(var(--accent))"
                  case "quickReply":
                    return "hsl(var(--chart-1))"
                  case "whatsappList":
                    return "hsl(var(--chart-4))"
                  case "comment":
                    return "#fbbf24"
                  default:
                    return "hsl(var(--muted))"
                }
              }}
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
          </ReactFlow>
        </div>

        {contextMenu.isOpen && (
          <div
            className="fixed bg-card border border-border rounded-md shadow-lg py-2 z-50 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={closeContextMenu}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => {
                const { x: flowX, y: flowY } = screenToFlowPosition({
                  x: contextMenu.x,
                  y: contextMenu.y,
                })
                addComment(flowX, flowY)
              }}
            >
              <MessageSquareText className="w-4 h-4" />
              Add Comment
            </button>
            <div className="border-t border-border my-1" />
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => addNodeFromMenu("question", contextMenu.x, contextMenu.y)}
            >
              <MessageCircle className="w-4 h-4" />
              Add Question
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => addNodeFromMenu("quickReply", contextMenu.x, contextMenu.y)}
            >
              <MessageSquare className="w-4 h-4" />
              Add Quick Reply
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => addNodeFromMenu("whatsappList", contextMenu.x, contextMenu.y)}
            >
              <List className="w-4 h-4" />
              Add WhatsApp List
            </button>
          </div>
        )}

        {connectionMenu.isOpen && (
          <ConnectionMenu
            isOpen={connectionMenu.isOpen}
            position={{ x: connectionMenu.x, y: connectionMenu.y }}
            onClose={closeConnectionMenu}
            onSelectNodeType={handleNodeTypeSelection}
            platform={platform}
          />
        )}
      </div>

      <div
        className={`transition-all duration-300 ease-in-out ${
          isPropertiesPanelOpen && selectedNode ? "w-80" : selectedEdge ? "w-80" : "w-0"
        } overflow-hidden bg-background border-l border-border`}
      >
        {selectedNode && (
          <div className="w-80">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Properties</h2>
              <Button variant="ghost" size="sm" onClick={() => setIsPropertiesPanelOpen(false)} className="h-8 w-8 p-0">
                <span className="sr-only">Close properties panel</span>×
              </Button>
            </div>
            <PropertiesPanel selectedNode={selectedNode} platform={platform} onNodeUpdate={updateNodeData} />
          </div>
        )}
        {selectedEdge && !selectedNode && (
          <div className="w-80">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Edge Selected</h2>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEdge(null)} className="h-8 w-8 p-0">
                <span className="sr-only">Close edge panel</span>×
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="text-sm text-muted-foreground">
                Connection selected. Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Delete</kbd> or{" "}
                <kbd className="px-2 py-1 bg-muted rounded text-xs">Backspace</kbd> to remove this connection.
              </div>
              <Button variant="destructive" size="sm" onClick={() => deleteEdge(selectedEdge.id)} className="w-full">
                Delete Connection
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
