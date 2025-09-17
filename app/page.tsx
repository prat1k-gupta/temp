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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { StartNode } from "@/components/nodes/start-node"
import { QuestionNode } from "@/components/nodes/question-node"
import { QuickReplyNode } from "@/components/nodes/quick-reply-node"
import { WhatsAppListNode } from "@/components/nodes/whatsapp-list-node"
import { CommentNode } from "@/components/nodes/comment-node"
import { WhatsAppQuestionNode } from "@/components/nodes/whatsapp/whatsapp-question-node"
import { WhatsAppQuickReplyNode } from "@/components/nodes/whatsapp/whatsapp-quick-reply-node"
import { InstagramQuestionNode } from "@/components/nodes/instagram/instagram-question-node"
import { InstagramQuickReplyNode } from "@/components/nodes/instagram/instagram-quick-reply-node"
import { NodeSidebar } from "@/components/node-sidebar"
import { PropertiesPanel } from "@/components/properties-panel"
import { PlatformSelector } from "@/components/platform-selector"
import { Button } from "@/components/ui/button"
import { Download, Save, Undo2, Redo2, MessageCircle, MessageSquare, List, MessageSquareText } from "lucide-react"
import { ConnectionMenu } from "@/components/connection-menu"
import { ThemeToggle } from "@/components/theme-toggle"

const nodeTypes = {
  start: StartNode,
  question: QuestionNode,
  quickReply: QuickReplyNode,
  whatsappList: WhatsAppListNode,
  comment: CommentNode,
  // WhatsApp specific nodes
  whatsappQuestion: WhatsAppQuestionNode,
  whatsappQuickReply: WhatsAppQuickReplyNode,
  // Instagram specific nodes
  instagramQuestion: InstagramQuestionNode,
  instagramQuickReply: InstagramQuickReplyNode,
}

const initialNodes: Node[] = [
  {
    id: "1",
    type: "start",
    position: { x: 250, y: 25 },
    data: { label: "Start" },
  },
  {
    id: "2",
    type: "question",
    position: { x: 250, y: 150 },
    data: {
      label: "Welcome Question",
      question: "Hello! How can I help you today?",
      characterLimit: 160,
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
  const [platform, setPlatform] = useState<"web" | "whatsapp" | "instagram">("web")
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean
    x: number
    y: number
  }>({
    isOpen: false,
    x: 0,
    y: 0,
  })
  const [draggedNodeType, setDraggedNodeType] = useState<string | null>(null)
  const [connectionMenu, setConnectionMenu] = useState<{
    isOpen: boolean
    x: number
    y: number
    sourceNodeId: string | null
    sourceHandleId: string | null
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    sourceNodeId: null,
    sourceHandleId: null,
  })
  const [lastClickTime, setLastClickTime] = useState<number>(0)
  const [lastClickPosition, setLastClickPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)

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
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return

      if (node.type === "question") {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  type: "quickReply",
                  data: {
                    ...n.data,
                    buttons: [{ text: "Option 1" }],
                  },
                }
              : n,
          ),
        )
      } else if (node.type === "quickReply") {
        const currentButtons = node.data.buttons || []
        if (currentButtons.length >= 3) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    type: "whatsappList",
                    data: {
                      ...n.data,
                      options: [...currentButtons, { text: `Option ${currentButtons.length + 1}` }],
                    },
                  }
                : n,
            ),
          )
        } else {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      buttons: [...currentButtons, { text: `Option ${currentButtons.length + 1}` }],
                    },
                  }
                : n,
            ),
          )
        }
      } else if (node.type === "whatsappList") {
        const currentOptions = node.data.options || []
        if (currentOptions.length < 10) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      options: [...currentOptions, { text: `Option ${currentOptions.length + 1}` }],
                    },
                  }
                : n,
            ),
          )
        }
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

      if (!draggedNodeType) return

      const reactFlowBounds = event.currentTarget.getBoundingClientRect()
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      }

      const newNodeId = `${draggedNodeType}-${Date.now()}`
      let newNode: Node

      switch (draggedNodeType) {
        case "question":
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuestion"
                : platform === "instagram"
                  ? "instagramQuestion"
                  : "question",
            position,
            data: {
              label:
                platform === "whatsapp"
                  ? "WhatsApp Message"
                  : platform === "instagram"
                    ? "Instagram Message"
                    : "Question",
              question:
                platform === "whatsapp"
                  ? "Send a WhatsApp message"
                  : platform === "instagram"
                    ? "Send an Instagram message"
                    : "What would you like to know?",
            },
          }
          break
        case "quickReply":
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuickReply"
                : platform === "instagram"
                  ? "instagramQuickReply"
                  : "quickReply",
            position,
            data: {
              label:
                platform === "whatsapp"
                  ? "WhatsApp Actions"
                  : platform === "instagram"
                    ? "Instagram Actions"
                    : "Quick Reply",
              question: "Choose an action:",
              buttons: [{ text: "Action 1" }],
            },
          }
          break
        case "whatsappList":
          newNode = {
            id: newNodeId,
            type: "whatsappList",
            position,
            data: {
              label: "WhatsApp List",
              question: "Select from the list:",
              options: [{ text: "Option 1" }],
            },
          }
          break
        case "comment":
          newNode = {
            id: newNodeId,
            type: "comment",
            position,
            data: {
              comment: "Add your comment here...",
              createdBy: "You",
              createdAt: new Date().toISOString(),
              onUpdate: (updates: any) => {
                console.log("[v0] Comment inline update:", newNodeId, updates)
                setNodes((nds) =>
                  nds.map((node) =>
                    node.id === newNodeId
                      ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                      : node,
                  ),
                )
              },
              onDelete: () => deleteNode(newNodeId),
            },
          }
          break
        default:
          return
      }

      setNodes((nds) => [...nds, newNode])
      setDraggedNodeType(null)
    },
    [draggedNodeType, setNodes, deleteNode, platform],
  )

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, x: 0, y: 0 })
  }, [])

  const addComment = useCallback(
    (x: number, y: number) => {
      const newNodeId = `comment-${Date.now()}`
      const newNode: Node = {
        id: newNodeId,
        type: "comment",
        position: { x: x - 100, y: y - 50 },
        data: {
          comment: "Add your comment here...",
          createdBy: "You",
          createdAt: new Date().toISOString(),
          onUpdate: (updates: any) => {
            console.log("[v0] Comment inline update:", newNodeId, updates)
            setNodes((nds) =>
              nds.map((node) =>
                node.id === newNodeId ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() } : node,
              ),
            )
          },
          onDelete: () => deleteNode(newNodeId),
        },
      }
      setNodes((nds) => [...nds, newNode])
      closeContextMenu()
    },
    [setNodes, closeContextMenu, deleteNode],
  )

  const addNodeFromMenu = useCallback(
    (nodeType: string, x: number, y: number) => {
      const newNodeId = `${nodeType}-${Date.now()}`
      let newNode: Node

      switch (nodeType) {
        case "question":
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuestion"
                : platform === "instagram"
                  ? "instagramQuestion"
                  : "question",
            position: { x: x - 100, y: y - 50 },
            data: {
              label:
                platform === "whatsapp"
                  ? "WhatsApp Message"
                  : platform === "instagram"
                    ? "Instagram Message"
                    : "Question",
              question:
                platform === "whatsapp"
                  ? "Send a WhatsApp message"
                  : platform === "instagram"
                    ? "Send an Instagram message"
                    : "What would you like to know?",
            },
          }
          break
        case "quickReply":
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuickReply"
                : platform === "instagram"
                  ? "instagramQuickReply"
                  : "quickReply",
            position: { x: x - 100, y: y - 50 },
            data: {
              label:
                platform === "whatsapp"
                  ? "WhatsApp Actions"
                  : platform === "instagram"
                    ? "Instagram Actions"
                    : "Quick Reply",
              question: "Choose an action:",
              buttons: [{ text: "Action 1" }],
            },
          }
          break
        case "whatsappList":
          newNode = {
            id: newNodeId,
            type: "whatsappList",
            position: { x: x - 100, y: y - 50 },
            data: {
              label: "WhatsApp List",
              question: "Select from the list:",
              options: [{ text: "Option 1" }],
            },
          }
          break
        default:
          return
      }

      setNodes((nds) => [...nds, newNode])
      closeContextMenu()
    },
    [setNodes, closeContextMenu, platform],
  )

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setIsPropertiesPanelOpen(true)
  }, [])

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      setSelectedNode(null)
      setSelectedEdge(null)
      setIsPropertiesPanelOpen(false)

      const currentTime = Date.now()
      const reactFlowBounds = event.currentTarget.getBoundingClientRect()
      const clickPosition = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      }

      const timeDiff = currentTime - lastClickTime
      const positionDiff =
        Math.abs(clickPosition.x - lastClickPosition.x) + Math.abs(clickPosition.y - lastClickPosition.y)

      // Double-click detected if within 300ms and within 5px of last click
      if (timeDiff < 300 && positionDiff < 5) {
        console.log("[v0] Double-click detected at:", clickPosition)

        const position = {
          x: clickPosition.x - 100, // Center the node
          y: clickPosition.y - 50, // Center the node
        }

        const newNodeId = `comment-${Date.now()}`
        const newNode: Node = {
          id: newNodeId,
          type: "comment",
          position,
          data: {
            comment: "Add your comment here...",
            createdBy: "You",
            createdAt: new Date().toISOString(),
            onUpdate: (updates: any) => {
              console.log("[v0] Comment inline update:", newNodeId, updates)
              setNodes((nds) =>
                nds.map((node) =>
                  node.id === newNodeId
                    ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() }
                    : node,
                ),
              )
            },
            onDelete: () => deleteNode(newNodeId),
          },
        }
        setNodes((nds) => [...nds, newNode])
        console.log("[v0] Added comment node at position:", position)
      }

      setLastClickTime(currentTime)
      setLastClickPosition(clickPosition)
    },
    [lastClickTime, lastClickPosition, setNodes, deleteNode],
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

      let nodePosition
      if (reactFlowBounds) {
        nodePosition = {
          x: connectionMenu.x - reactFlowBounds.left - 100,
          y: connectionMenu.y - reactFlowBounds.top - 50,
        }
      } else {
        // Fallback to relative positioning if bounds can't be determined
        nodePosition = {
          x: sourceNode.position.x + 300,
          y: sourceNode.position.y,
        }
      }

      let newNode: Node

      switch (nodeType) {
        case "question":
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuestion"
                : platform === "instagram"
                  ? "instagramQuestion"
                  : "question",
            position: nodePosition,
            data: {
              label:
                platform === "whatsapp"
                  ? "WhatsApp Message"
                  : platform === "instagram"
                    ? "Instagram Message"
                    : "Question",
              question:
                platform === "whatsapp"
                  ? "Send a WhatsApp message"
                  : platform === "instagram"
                    ? "Send an Instagram message"
                    : "What would you like to know?",
            },
          }
          break
        case "quickReply":
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuickReply"
                : platform === "instagram"
                  ? "instagramQuickReply"
                  : "quickReply",
            position: nodePosition,
            data: {
              label:
                platform === "whatsapp"
                  ? "WhatsApp Actions"
                  : platform === "instagram"
                    ? "Instagram Actions"
                    : "Quick Reply",
              question: "Choose an action:",
              buttons: [{ text: "Action 1" }],
            },
          }
          break
        default:
          newNode = {
            id: newNodeId,
            type:
              platform === "whatsapp"
                ? "whatsappQuestion"
                : platform === "instagram"
                  ? "instagramQuestion"
                  : "question",
            position: nodePosition,
            data: {
              label: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
              question: `${nodeType} step`,
            },
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

      setNodes((nds) => [...nds, newNode])
      setEdges((eds) => [...eds, newEdge])
      setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
    },
    [connectionMenu.sourceNodeId, connectionMenu.sourceHandleId, nodes, setNodes, setEdges, platform],
  )

  const updateNodeData = useCallback(
    (nodeId: string, updates: any) => {
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
    },
    [setNodes, setSelectedNode],
  )

  const closeConnectionMenu = useCallback(() => {
    setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
  }, [])

  const onConnectStart = useCallback((event: React.MouseEvent, params: any) => {
    console.log("[v0] Connection start:", params)
    setIsConnecting(true)
    setConnectingFrom(params.nodeId)
    console.log("[v0] Connection state set - isConnecting: true, connectingFrom:", params.nodeId)
  }, [])

  const onConnectEnd = useCallback(
    (event: React.MouseEvent, connectionState: any) => {
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
          clientX: event.clientX,
          clientY: event.clientY,
          fromNode: connectionState.fromNode.id,
        })

        // Show menu only when dropping in empty space (not on nodes, handles, or edges)
        if (!isOnNode && !isOnHandle && !isOnEdge) {
          console.log("[v0] Showing connection menu at:", event.clientX, event.clientY)
          setConnectionMenu({
            isOpen: true,
            x: event.clientX,
            y: event.clientY,
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
    (newPlatform: "web" | "whatsapp" | "instagram") => {
      console.log("[v0] Converting nodes to platform:", newPlatform)

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          // Skip start and comment nodes as they don't need platform conversion
          if (node.type === "start" || node.type === "comment") {
            return node
          }

          let newType = node.type
          const newData = { ...node.data }

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
    (newPlatform: "web" | "whatsapp" | "instagram") => {
      console.log("[v0] Platform changed to:", newPlatform)
      setPlatform(newPlatform)
      convertNodesToPlatform(newPlatform)
    },
    [convertNodesToPlatform],
  )

  return (
    <div className="h-screen flex bg-background">
      <NodeSidebar onNodeDragStart={onNodeDragStart} />

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
              onClick={() => addComment(contextMenu.x, contextMenu.y)}
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
