"use client"

import type React from "react"
import { useState, useCallback, useEffect, useRef } from "react"
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
  ReactFlowProvider,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// Component imports
import { StartNode } from "@/components/nodes/start-node"
import { CommentNode } from "@/components/nodes/comment-node"
import { WebQuestionNode } from "@/components/nodes/web/web-question-node"
import { WebQuickReplyNode } from "@/components/nodes/web/web-quick-reply-node"
import { WhatsAppQuestionNode } from "@/components/nodes/whatsapp/whatsapp-question-node"
import { WhatsAppQuickReplyNode } from "@/components/nodes/whatsapp/whatsapp-quick-reply-node"
import { WhatsAppListNode } from "@/components/nodes/whatsapp/whatsapp-list-node"
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
import { Badge } from "@/components/ui/badge"
import { Download, Undo2, Redo2, MessageCircle, MessageSquare, List, MessageSquareText, Camera, Eye, History, Upload, Clock, Sparkles, MoreHorizontal, RotateCcw } from "lucide-react"
import { ConnectionMenu } from "@/components/connection-menu"
import { ThemeToggle } from "@/components/theme-toggle"
import { ExportModal } from "@/components/export-modal"
import { ScreenshotModal } from "@/components/screenshot-modal"
import { VersionHistoryModal } from "@/components/version-history-modal"
import { PublishModal } from "@/components/publish-modal"
import { ChangesModal } from "@/components/changes-modal"
import { useVersionManager } from "@/hooks/use-version-manager"
import { changeTracker } from "@/utils/change-tracker"
import { toast } from "sonner"

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
import { publishVersion } from "@/utils/version-storage"

const nodeTypes = {
  start: StartNode,
  comment: CommentNode,
  // Web specific nodes
  webQuestion: WebQuestionNode,
  webQuickReply: WebQuickReplyNode,
  // WhatsApp specific nodes
  whatsappQuestion: WhatsAppQuestionNode,
  whatsappQuickReply: WhatsAppQuickReplyNode,
  whatsappList: WhatsAppListNode,
  whatsappListSpecific: WhatsAppListNode,
  whatsappMessage: WhatsAppMessageNode,
  // Backwards compatibility aliases
  question: WebQuestionNode,
  quickReply: WebQuickReplyNode,
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
    draggable: false,
    selectable: false,
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
  const [nodes, setNodes, onNodesChangeOriginal] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [platform, setPlatform] = useState<Platform>("web")
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(false)
  const [draftStateLoaded, setDraftStateLoaded] = useState(false)
  const [isLoadingVersion, setIsLoadingVersion] = useState(false)
  const [isAutoEnteringEditMode, setIsAutoEnteringEditMode] = useState(false)
  
  // Version management
  const {
    editModeState,
    toggleEditMode,
    toggleViewDraft,
    enterEditMode,
    exitEditMode,
    autoEnterEditMode,
    createNewVersion,
    createAndPublishVersion,
    publishCurrentVersion,
    loadVersion,
    getAllVersions,
    getLatestVersion,
    resetToPublished,
    updateDraftChanges,
    discardChanges,
    hasActualChanges,
    getChangesSummary,
    getChangesCount,
    loadDraftState,
    saveCurrentStateAsDraft,
    debugLocalStorageState,
    isEditMode,
    currentVersion,
    draftChanges
  } = useVersionManager()
  const flowElementRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  })
  const [nodeContextMenu, setNodeContextMenu] = useState<{
    isOpen: boolean
    x: number
    y: number
    nodeId: string | null
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    nodeId: null,
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
  const [clipboard, setClipboard] = useState<{ nodes: Node[], edges: Edge[] } | null>(null)
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([])
  const [pastePosition, setPastePosition] = useState<{ x: number, y: number } | null>(null)

  const { screenToFlowPosition, fitView, getNodes, getEdges } = useReactFlow();

  // Custom onNodesChange to prevent deletion of start nodes
  const onNodesChange = useCallback((changes: any[]) => {
    // Filter out deletion changes for start nodes
    const filteredChanges = changes.filter(change => {
      if (change.type === 'remove') {
        const nodeToRemove = nodes.find(n => n.id === change.id)
        if (nodeToRemove?.type === 'start') {
          toast.error("Start node cannot be deleted")
          return false
        }
      }
      return true
    })
    
    // Apply the filtered changes
    onNodesChangeOriginal(filteredChanges)
  }, [nodes, onNodesChangeOriginal])

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nodeToDelete = nodes.find(n => n.id === nodeId)
      
      // Prevent deletion of start nodes
      if (nodeToDelete?.type === "start") {
        toast.error("Start node cannot be deleted")
        return
      }
      
      // Track the deletion
      if (nodeToDelete) {
        if (!isEditMode) {
          autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
        }
        changeTracker.trackNodeDelete(nodeId, nodeToDelete.type, nodeToDelete.data?.label as string | undefined)
        updateDraftChanges()
      }
      
      setNodes((nds) => nds.filter((n) => n.id !== nodeId))
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null)
        setIsPropertiesPanelOpen(false)
      }
      
      // Show toast notification
      if (nodeToDelete) {
        toast.success(`"${nodeToDelete.data.label || nodeToDelete.type}" deleted`)
      }
    },
    [setNodes, setEdges, selectedNode, setIsPropertiesPanelOpen, nodes, isEditMode, updateDraftChanges, autoEnterEditMode, setPlatform, edges, platform],
  )

  const copyNodes = useCallback(() => {
    if (selectedNodes.length === 0) return
    
    // Filter out start nodes from copying
    const copyableNodes = selectedNodes.filter(node => node.type !== "start")
    
    if (copyableNodes.length === 0) {
      toast.error("Start nodes cannot be copied")
      return
    }
    
    if (copyableNodes.length !== selectedNodes.length) {
      toast.warning("Start nodes were excluded from copy operation")
    }
    
    // Get all edges that connect the copyable nodes
    const copyableNodeIds = copyableNodes.map(node => node.id)
    const connectedEdges = edges.filter(edge => 
      copyableNodeIds.includes(edge.source) && copyableNodeIds.includes(edge.target)
    )
    
    setClipboard({
      nodes: copyableNodes.map(node => ({ ...node })),
      edges: connectedEdges.map(edge => ({ ...edge }))
    })
    
    // Show toast notification for copy
    toast.success(`${copyableNodes.length} node${copyableNodes.length > 1 ? 's' : ''} copied to clipboard`)
    
    console.log("[v0] Copied nodes:", copyableNodes.length, "edges:", connectedEdges.length)
  }, [selectedNodes, edges])

  const pasteNodes = useCallback((cursorPosition?: { x: number, y: number }) => {
    if (!clipboard) return
    
    const nodeIdMap = new Map<string, string>()
    
    // Calculate the center of the original nodes for offset calculation
    const originalCenter = {
      x: clipboard.nodes.reduce((sum, node) => sum + node.position.x, 0) / clipboard.nodes.length,
      y: clipboard.nodes.reduce((sum, node) => sum + node.position.y, 0) / clipboard.nodes.length
    }
    
    // Use cursor position if provided, otherwise use stored paste position or default offset
    let targetPosition: { x: number, y: number }
    if (cursorPosition) {
      targetPosition = cursorPosition
    } else if (pastePosition) {
      targetPosition = pastePosition
    } else {
      targetPosition = { x: originalCenter.x + 50, y: originalCenter.y + 50 }
    }
    
    // Create new nodes with updated IDs and positions relative to cursor
    const newNodes = clipboard.nodes.map(node => {
      const newNodeId = `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      nodeIdMap.set(node.id, newNodeId)
      
      // Calculate offset from original center to this node
      const offsetFromCenter = {
        x: node.position.x - originalCenter.x,
        y: node.position.y - originalCenter.y
      }
      
      return {
        ...node,
        id: newNodeId,
        position: {
          x: targetPosition.x + offsetFromCenter.x,
          y: targetPosition.y + offsetFromCenter.y
        },
        data: {
          ...node.data,
          id: newNodeId
        }
      }
    })
    
    // Create new edges with updated node IDs
    const newEdges = clipboard.edges.map(edge => {
      const newSourceId = nodeIdMap.get(edge.source)
      const newTargetId = nodeIdMap.get(edge.target)
      
      if (!newSourceId || !newTargetId) return null
      
      return {
        ...edge,
        id: `e${newSourceId}-${newTargetId}-${Date.now()}`,
        source: newSourceId,
        target: newTargetId
      }
    }).filter(Boolean) as Edge[]
    
    // Add new nodes and edges
    setNodes(nds => [...nds, ...newNodes])
    setEdges(eds => [...eds, ...newEdges])
    
    // Select the newly pasted nodes
    setSelectedNodes(newNodes)
    setSelectedNode(newNodes[0] || null)
    setIsPropertiesPanelOpen(true)
    
    // Focus on the first pasted non-comment node (skip focusing comment nodes)
    if (newNodes.length > 0) {
      const firstNonComment = newNodes.find(n => n.type !== "comment")
      if (firstNonComment) {
        setNodeToFocus(firstNonComment.id)
      }
    }
    
    // No toast for paste - user requested only copy, delete, and multiple selection
    
    console.log("[v0] Pasted nodes:", newNodes.length, "edges:", newEdges.length, "at position:", targetPosition)
  }, [clipboard, setNodes, setEdges, pastePosition])

  const selectAllNodes = useCallback(() => {
    const allNodes = getNodes()
    // Filter out start nodes from selection
    const selectableNodes = allNodes.filter(node => node.type !== "start")
    setSelectedNodes(selectableNodes)
    setSelectedNode(selectableNodes[0] || null)
    setIsPropertiesPanelOpen(true)
    
    // No toast for select all - user requested only copy, delete, and multiple selection
  }, [getNodes])


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

      const newEdge = {
        ...params,
        type: "default",
        style: { stroke: "#6366f1", strokeWidth: 2 },
      }

      // Track the connection
      if (!isEditMode) {
        autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
      }
      changeTracker.trackEdgeAdd(newEdge)
      updateDraftChanges()

      console.log("[v0] Creating new connection:", params)
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges, edges, isEditMode, updateDraftChanges, autoEnterEditMode, setNodes, setPlatform, nodes, platform],
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
        if (node.type === "question" || node.type === "webQuestion" || node.type === "whatsappQuestion" || node.type === "instagramQuestion") {
          const platform = (node.data.platform as Platform) || "web"
          const newType = getPlatformSpecificNodeType("quickReply", platform)
          
          // Track the type transition
          if (!isEditMode) {
            autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
          }
          changeTracker.trackNodeUpdate(nodeId, node.data, {
            ...node.data,
            label: "Quick Reply",
            buttons: [{ text: "Option 1" }],
          }, node.type, newType)
          updateDraftChanges()
          
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    type: newType,
                    data: {
                      ...n.data,
                      label: "Quick Reply",
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
        else if (node.type === "quickReply" || node.type === "webQuickReply" || node.type === "whatsappQuickReply" || node.type === "instagramQuickReply") {
          const currentButtons: ButtonData[] = (node.data.buttons as ButtonData[]) || []
          const platform = (node.data.platform as Platform) || "web"
          
          if (!canAddMoreButtons(currentButtons, platform)) {
            // Convert to list node if at max buttons
            const newType = getPlatformSpecificNodeType("whatsappList", platform)
            const newLabel = getPlatformSpecificLabel("whatsappList", platform)
            
            // Track the type transition
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              label: newLabel,
              options: [...currentButtons, createOptionData("", currentButtons.length)] as OptionData[],
            }, node.type, newType)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      type: newType,
                      data: {
                        ...n.data,
                        label: newLabel,
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
            const newButtons = [...currentButtons, createButtonData("", currentButtons.length)] as ButtonData[]
            
            // Track button addition
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              buttons: newButtons,
            }, node.type, node.type)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        buttons: newButtons,
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
            const newOptions = [...currentOptions, createOptionData("", currentOptions.length)] as OptionData[]
            
            // Track option addition
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              options: newOptions,
            }, node.type, node.type)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        options: newOptions,
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

  const removeButtonFromNode = useCallback(
    (nodeId: string, buttonIndex: number) => {
      try {
        const node = nodes.find((n) => n.id === nodeId)
        if (!node) {
          console.warn(`[v0] Node with id ${nodeId} not found`)
          return
        }

        const platform = (node.data.platform as Platform) || "web"
        const currentButtons: ButtonData[] = (node.data.buttons as ButtonData[]) || []
        const currentOptions: OptionData[] = (node.data.options as OptionData[]) || []

        // Handle list nodes (remove option and potentially convert back to quick reply)
        if (node.type === "whatsappList" || node.type === "whatsappListSpecific" || node.type === "instagramList") {
          const newOptions = currentOptions.filter((_, i) => i !== buttonIndex)
          
          // If we have 3 or fewer options, convert back to quick reply
          if (newOptions.length <= 3) {
            const newType = getPlatformSpecificNodeType("quickReply", platform)
            const buttonsFromOptions = newOptions.map(opt => ({ text: opt.text || "" }))
            
            // Track the reverse transition
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              label: "Quick Reply",
              buttons: buttonsFromOptions,
            }, node.type, newType)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      type: newType,
                      data: {
                        ...n.data,
                        label: "Quick Reply",
                        buttons: buttonsFromOptions,
                      },
                    }
                  : n,
              ),
            )
          } else {
            // Just remove the option
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              options: newOptions,
            }, node.type, node.type)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        options: newOptions,
                      },
                    }
                  : n,
              ),
            )
          }
        }
        // Handle quick reply nodes (remove button and potentially convert back to question)
        else if (node.type === "quickReply" || node.type === "webQuickReply" || node.type === "whatsappQuickReply" || node.type === "instagramQuickReply") {
          const newButtons = currentButtons.filter((_, i) => i !== buttonIndex)
          
          // If no buttons left, convert back to question
          if (newButtons.length === 0) {
            const newType = getPlatformSpecificNodeType("question", platform)
            
            // Track the reverse transition
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              label: "Question",
            }, node.type, newType)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      type: newType,
                      data: {
                        ...n.data,
                        label: "Question",
                      },
                    }
                  : n,
              ),
            )
          } else {
            // Just remove the button
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeUpdate(nodeId, node.data, {
              ...node.data,
              buttons: newButtons,
            }, node.type, node.type)
            updateDraftChanges()
            
            setNodes((nds) =>
              nds.map((n) =>
                n.id === nodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        buttons: newButtons,
                      },
                    }
                  : n,
              ),
            )
          }
        }
      } catch (error) {
        console.error(`[v0] Error removing button from node ${nodeId}:`, error)
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

      // Track node and edge creation
      if (!isEditMode) {
        autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
      }
      changeTracker.trackNodeAdd(newNode)
      changeTracker.trackEdgeAdd(newEdge)
      updateDraftChanges()

      setNodes((nds) => [...nds, newNode])
      setEdges((eds) => [...eds, newEdge])
      // Request focus on the newly created connected node
      setNodeToFocus(newNodeId)
    },
    [nodes, setNodes, setEdges, isEditMode, updateDraftChanges, autoEnterEditMode, setPlatform, edges, platform],
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

  const importFlow = useCallback((importedNodes: Node[], importedEdges: Edge[], importedPlatform: Platform) => {
    console.log("[v0] Importing flow:", { 
      nodes: importedNodes.length, 
      edges: importedEdges.length, 
      platform: importedPlatform 
    })

    // Track flow import
    if (!isEditMode) {
      autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
    }
    changeTracker.trackFlowImport(importedNodes, importedEdges, importedPlatform)
    updateDraftChanges()

    // Clear current flow
    setNodes([])
    setEdges([])
    setSelectedNode(null)
    setSelectedNodes([])
    setIsPropertiesPanelOpen(false)

    // Set new flow data
    setNodes(importedNodes)
    setEdges(importedEdges)
    setPlatform(importedPlatform)

    toast.success(`Flow imported successfully! ${importedNodes.length} nodes, ${importedEdges.length} edges`)
  }, [setNodes, setEdges, setPlatform, setSelectedNode, setSelectedNodes, setIsPropertiesPanelOpen, isEditMode, updateDraftChanges, autoEnterEditMode, nodes, edges, platform])

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

      const position = screenToFlowPosition({ x: clientX, y: clientY })

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

        // Track node creation
        console.log('[App] Creating node in view mode:', {
          isEditMode,
          draggedNodeType,
          newNodeId,
          currentNodes: nodes.length
        })
        
        if (!isEditMode) {
          console.log('[App] Auto-entering edit mode before adding node')
          autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
        }
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        console.log('[App] Adding node to React state:', newNodeId)
        setNodes((nds) => {
          const newNodes = [...nds, newNode]
          console.log('[App] New nodes array length:', newNodes.length)
          return newNodes
        })
        setDraggedNodeType(null)
        // Request focus on the newly created node (skip for comment)
        if (draggedNodeType !== "comment") {
          setNodeToFocus(newNodeId)
        }
        
        // No toast for node creation - user requested only copy, delete, and multiple selection
      } catch (error) {
        console.error(`[v0] Error creating dragged node ${draggedNodeType}:`, error)
        setDraggedNodeType(null)
      }
    },
    [draggedNodeType, setNodes, deleteNode, platform, isEditMode, updateDraftChanges, autoEnterEditMode, setEdges, setPlatform, nodes, edges],
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
                    node.id === newNodeId ? { ...node, data: { ...node.data, ...updates }, _timestamp: Date.now() } : node,
                  ),
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
          case "whatsappList":
            newNode = createNode("whatsappList", platform, position, newNodeId)
            break
          default:
            console.warn(`[v0] Unknown node type: ${nodeType}`)
            return
        }

        // Track node creation
        if (!isEditMode) {
          autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
        }
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])
        closeContextMenu()
        if (nodeType !== "comment") {
          setNodeToFocus(newNodeId)
        }
        
        // No toast for node creation - user requested only copy, delete, and multiple selection
      } catch (error) {
        console.error(`[v0] Error creating node ${nodeType}:`, error)
      }
    },
    [contextMenu, screenToFlowPosition, setNodes, closeContextMenu, platform, deleteNode, isEditMode, updateDraftChanges, autoEnterEditMode, setEdges, setPlatform, nodes, edges],
  )

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    // Prevent selection of start nodes
    if (node.type === "start") {
      return
    }
    
    setSelectedNode(node)
    setIsPropertiesPanelOpen(true)
  }, [])

  const onSelectionChange = useCallback(({ nodes: selectedNodesFromFlow }: { nodes: Node[], edges: Edge[] }) => {
    // Filter out start nodes from selection
    const filteredNodes = selectedNodesFromFlow.filter(node => node.type !== "start")
    
    // Update our selected nodes state with filtered nodes
    setSelectedNodes(filteredNodes)
    
    // Handle node selection
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
    
    // Show toast notification for selection changes (but not for single node clicks)
    if (filteredNodes.length > 1) {
      toast.info(`${filteredNodes.length} nodes selected`)
    }
  }, [])

  const onPaneClick = useCallback(
    (event: MouseEvent | React.MouseEvent<Element, MouseEvent>) => {
      setSelectedNode(null)
      setSelectedNodes([])
      setIsPropertiesPanelOpen(false)

      const currentTime = Date.now()
      
      // Type guard to check if event has React properties
      if (!('currentTarget' in event) || !('clientX' in event) || !('clientY' in event)) {
        return
      }
      
      const reactFlowBounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const clickPosition: Coordinates = getClientCoordinates(event)

      // Double-click detected if within threshold
      if (isDoubleClick(currentTime, lastClickTime, clickPosition, lastClickPosition, 
                       INTERACTION_THRESHOLDS.doubleClick.time, 
                       INTERACTION_THRESHOLDS.doubleClick.distance)) {
        console.log("[v0] Double-click detected at:", clickPosition)

        const position = screenToFlowPosition(clickPosition)

        const newNodeId = `comment-${Date.now()}`
        const newNode = createCommentNode(
          platform,
          position,
          newNodeId,
          (updates: any) => {
            console.log("[v0] Comment inline update:", newNodeId, updates)
            
            // Track the comment update
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            
            // Find the current node to get old data for change tracking
            const currentNode = nodes.find(n => n.id === newNodeId)
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
                  : node,
              ),
            )
          },
          () => deleteNode(newNodeId)
        )
        // Track comment node creation
        if (!isEditMode) {
          autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
        }
        changeTracker.trackNodeAdd(newNode)
        updateDraftChanges()

        setNodes((nds) => [...nds, newNode])
        console.log("[v0] Added comment node at position:", position)
        
        // No toast for comment creation - user requested only copy, delete, and multiple selection
      }

      setLastClickTime(currentTime)
      setLastClickPosition(clickPosition)
    },
    [lastClickTime, lastClickPosition, setNodes, deleteNode, platform, setSelectedNodes, isEditMode, updateDraftChanges, autoEnterEditMode, setEdges, setPlatform, nodes, edges],
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

      // Track node and edge creation
      console.log('[App] Creating connected node in view mode:', {
        isEditMode,
        nodeType,
        newNodeId,
        currentNodes: nodes.length
      })
      
      if (!isEditMode) {
        console.log('[App] Auto-entering edit mode before adding connected node')
        setIsAutoEnteringEditMode(true)
        autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
      }
      changeTracker.trackNodeAdd(newNode)
      changeTracker.trackEdgeAdd(newEdge)
      updateDraftChanges()

      console.log('[App] Adding connected node to React state:', newNodeId)
      setNodes((nds) => {
        const newNodes = [...nds, newNode]
        console.log('[App] New connected nodes array length:', newNodes.length)
        return newNodes
      })
      setEdges((eds) => {
        const newEdges = [...eds, newEdge]
        console.log('[App] New connected edges array length:', newEdges.length)
        return newEdges
      })
      setConnectionMenu({ isOpen: false, x: 0, y: 0, sourceNodeId: null, sourceHandleId: null })
      // Request focus on the newly created node
      setNodeToFocus(newNodeId)
      
      // No toast for node connection - user requested only copy, delete, and multiple selection
    },
    [connectionMenu.sourceNodeId, connectionMenu.sourceHandleId, nodes, setNodes, setEdges, platform, isEditMode, updateDraftChanges, autoEnterEditMode, setPlatform, edges],
  )

  const updateNodeData = useCallback(
    (nodeId: string, updates: any, shouldFocus: boolean = false) => {
      try {
        if (!isValidNodeId(nodeId)) {
          console.error("[v0] Invalid nodeId provided to updateNodeData:", nodeId)
          return
        }
        
        console.log("[v0] Updating node data:", nodeId, updates)
        
        // Track node update
        const oldNode = nodes.find(n => n.id === nodeId)
        if (oldNode) {
          if (!isEditMode) {
            autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
          }
          const oldData = { ...oldNode.data }
          const newData = { ...oldData, ...updates }
          changeTracker.trackNodeUpdate(nodeId, oldData, newData, oldNode.type, oldNode.type)
          updateDraftChanges()
        }
        
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
    [setNodes, setSelectedNode, nodes, isEditMode, updateDraftChanges, autoEnterEditMode, setEdges, setPlatform, edges, platform],
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

  // Keyboard shortcuts for copy-paste
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input field or textarea
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey
      
      if (isCtrlOrCmd) {
        switch (event.key.toLowerCase()) {
          case 'c':
            event.preventDefault()
            copyNodes()
            break
          case 'v':
            event.preventDefault()
            // Get current mouse position for paste
            const reactFlowElement = document.querySelector('.react-flow')
            if (reactFlowElement) {
              const rect = reactFlowElement.getBoundingClientRect()
              const centerX = rect.left + rect.width / 2
              const centerY = rect.top + rect.height / 2
              const flowPosition = screenToFlowPosition({ x: centerX, y: centerY })
              pasteNodes(flowPosition)
            } else {
              pasteNodes()
            }
            break
          case 'a':
            event.preventDefault()
            selectAllNodes()
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [copyNodes, pasteNodes, selectAllNodes, screenToFlowPosition])

  // Close context menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenu.isOpen) {
        closeContextMenu()
      }
      if (nodeContextMenu.isOpen) {
        closeNodeContextMenu()
      }
    }

    if (contextMenu.isOpen || nodeContextMenu.isOpen) {
      document.addEventListener("click", handleClickOutside)
    }

    return () => {
      document.removeEventListener("click", handleClickOutside)
    }
  }, [contextMenu.isOpen, nodeContextMenu.isOpen, closeContextMenu, closeNodeContextMenu])


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
          if (node.type === "question" || node.type === "webQuestion" || node.type === "whatsappQuestion" || node.type === "instagramQuestion") {
            switch (newPlatform) {
              case "web":
                newType = "webQuestion"
                newData.label = "Web Message"
                break
              case "whatsapp":
                newType = "whatsappQuestion"
                newData.label = "WhatsApp Message"
                break
              case "instagram":
                newType = "instagramQuestion"
                newData.label = "Instagram Message"
                break
              default:
                newType = "webQuestion"
                newData.label = "Question"
            }
          }

          // Convert quick reply nodes
          if (node.type === "quickReply" || node.type === "webQuickReply" || node.type === "whatsappQuickReply" || node.type === "instagramQuickReply") {
            switch (newPlatform) {
              case "web":
                newType = "webQuickReply"
                newData.label = "Web Actions"
                break
              case "whatsapp":
                newType = "whatsappQuickReply"
                newData.label = "WhatsApp Actions"
                break
              case "instagram":
                newType = "instagramQuickReply"
                newData.label = "Instagram Actions"
                break
              default:
                newType = "webQuickReply"
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
      
      // Track platform change
      if (!isEditMode) {
        autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
      }
      changeTracker.trackPlatformChange(platform, newPlatform)
      updateDraftChanges()
      
      setPlatform(newPlatform)
      convertNodesToPlatform(newPlatform)
    },
    [convertNodesToPlatform, isEditMode, platform, updateDraftChanges, autoEnterEditMode, setNodes, setEdges, nodes, edges],
  )

  const handleModeToggle = useCallback(() => {
    const publishedVersion = getAllVersions().find(v => v.isPublished)
    if (publishedVersion) {
      // We have a published version - use view/draft toggle
      toggleViewDraft(setNodes, setEdges, setPlatform)
      setDraftStateLoaded(false) // Reset flag when toggling modes
    } else {
      // No published version - use regular edit mode toggle
      toggleEditMode(setNodes, setEdges, setPlatform)
      setDraftStateLoaded(false) // Reset flag when toggling modes
    }
  }, [getAllVersions, toggleViewDraft, toggleEditMode, setNodes, setEdges, setPlatform])

  // Reset auto-entering edit mode flag when edit mode state changes
  useEffect(() => {
    if (isAutoEnteringEditMode && editModeState.isEditMode) {
      console.log('[App] Resetting auto-entering edit mode flag')
      setIsAutoEnteringEditMode(false)
    }
  }, [editModeState.isEditMode, isAutoEnteringEditMode])

  // Update selected node when nodes change (e.g., after platform conversion)
  useEffect(() => {
    if (selectedNode) {
      const updatedNode = nodes.find(n => n.id === selectedNode.id)
      if (updatedNode && updatedNode !== selectedNode) {
        setSelectedNode(updatedNode)
      }
    }
  }, [nodes, selectedNode])

  // Load published version on startup if in view mode, or draft state if in edit mode (only run once on mount)
  useEffect(() => {
    console.log('[App] Initialization effect triggered:', {
      editModeStateReady: editModeState.isEditMode !== undefined,
      isEditMode,
      hasCurrentVersion: !!currentVersion,
      currentVersionName: currentVersion?.name
    })
    
    // Only run this effect once when the component mounts and version manager is ready
    if (editModeState.isEditMode !== undefined) {
      if (!isEditMode && currentVersion) {
        // In view mode, load the current version
        console.log('[App] Loading current version in view mode:', currentVersion.name)
        const formattedNodes = currentVersion.nodes.map(node => ({
          ...node,
          data: node.data || {}
        }))
        
        const formattedEdges = currentVersion.edges.map(edge => ({
          ...edge,
          style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
        }))
        
        console.log('[App] Setting nodes and edges in view mode:', {
          nodes: formattedNodes.length,
          edges: formattedEdges.length,
          platform: currentVersion.platform
        })
        
        setNodes(formattedNodes)
        setEdges(formattedEdges)
        setPlatform(currentVersion.platform)
      } else if (isEditMode && !isAutoEnteringEditMode) {
        // In edit mode, try to load draft state first, otherwise use current version
        console.log('[App] In edit mode, attempting to load draft state')
        const draftLoaded = loadDraftState(setNodes, setEdges, setPlatform)
        if (!draftLoaded && currentVersion) {
          console.log('[App] No draft state found, loading current version in edit mode:', currentVersion.name)
          const formattedNodes = currentVersion.nodes.map(node => ({
            ...node,
            data: node.data || {}
          }))
          
          const formattedEdges = currentVersion.edges.map(edge => ({
            ...edge,
            style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
          }))
          
          console.log('[App] Setting nodes and edges from current version in edit mode:', {
            nodes: formattedNodes.length,
            edges: formattedEdges.length,
            platform: currentVersion.platform
          })
          
          setNodes(formattedNodes)
          setEdges(formattedEdges)
          setPlatform(currentVersion.platform)
        } else if (draftLoaded) {
          console.log('[App] Successfully loaded draft state')
          setDraftStateLoaded(true)
        } else {
          console.log('[App] No draft state found and no current version')
        }
      }
    }
  }, [editModeState.isEditMode, isEditMode, currentVersion, loadDraftState]) // Include editModeState.isEditMode to ensure it's initialized

  // Load version when currentVersion changes (e.g., when loading from version history)
  // BUT only if we're not in edit mode or if we're explicitly loading a version
  useEffect(() => {
    if (currentVersion && (!isEditMode || isLoadingVersion)) {
      console.log('[App] Current version changed, loading:', currentVersion.name, 'isLoadingVersion:', isLoadingVersion, 'isEditMode:', isEditMode, 'isPublished:', currentVersion.isPublished)
      const formattedNodes = currentVersion.nodes.map(node => ({
        ...node,
        data: node.data || {}
      }))
      
      const formattedEdges = currentVersion.edges.map(edge => ({
        ...edge,
        style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
      }))
      
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(currentVersion.platform)
      setDraftStateLoaded(false) // Reset flag when loading published version
      setIsLoadingVersion(false) // Reset the loading flag
    } else if (currentVersion && isEditMode && !draftStateLoaded && !isLoadingVersion) {
      console.log('[App] Current version changed but in edit mode - skipping load to preserve draft state')
    }
  }, [currentVersion, isEditMode, draftStateLoaded, isLoadingVersion]) // Include isLoadingVersion

  // Debug: Log when currentVersion changes
  useEffect(() => {
    console.log('[App] Current version changed:', {
      name: currentVersion?.name,
      isPublished: currentVersion?.isPublished,
      nodes: currentVersion?.nodes?.length,
      edges: currentVersion?.edges?.length,
      platform: currentVersion?.platform
    })
  }, [currentVersion])

  // Debug: Log when edit mode state changes
  useEffect(() => {
    console.log('[App] Edit mode state changed:', {
      isEditMode: editModeState.isEditMode,
      hasUnsavedChanges: editModeState.hasUnsavedChanges,
      currentVersion: editModeState.currentVersion?.name,
      draftChanges: editModeState.draftChanges?.length
    })
  }, [editModeState])

  // Save draft state whenever nodes, edges, or platform change in edit mode
  useEffect(() => {
    if (isEditMode && (nodes.length > 0 || edges.length > 0)) {
      // Add a small delay to avoid saving too frequently during rapid changes
      const timeoutId = setTimeout(() => {
        console.log('[App] Saving draft state - nodes:', nodes.length, 'edges:', edges.length, 'platform:', platform)
        saveCurrentStateAsDraft(nodes, edges, platform)
      }, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [nodes, edges, platform, isEditMode, saveCurrentStateAsDraft])


  // Handle focusing on newly created nodes
  useEffect(() => {
    if (nodeToFocus) {
      const node = nodes.find(n => n.id === nodeToFocus)
      
      if (node && node.type !== "comment") {
        // Small delay to ensure the node is fully rendered
        setTimeout(() => {
          fitView({ 
            nodes: [{ id: nodeToFocus }], 
            duration: 1200,
            padding: 0.2,
            minZoom: 0.5,
            maxZoom: 2.0
          })
          setSelectedNode(node)
          setIsPropertiesPanelOpen(true)
        }, 100)
      }
      
      setNodeToFocus(null)
    }
  }, [nodes, nodeToFocus, fitView, setSelectedNode, setIsPropertiesPanelOpen])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in an input field or textarea
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return
      }

      // Delete key - delete selected nodes
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNodes.length > 0) {
          event.preventDefault()
          console.log('[Keyboard] Delete key pressed - deleting selected nodes')
          
          // Track deletions and auto-enter edit mode
          selectedNodes.forEach(node => {
            if (!isEditMode) {
              autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
            }
            changeTracker.trackNodeDelete(node.id, node.type, node.data?.label as string | undefined)
          })
          updateDraftChanges()
          
          // Delete the nodes
          const nodeIds = selectedNodes.map(n => n.id)
          setNodes((nds) => nds.filter((n) => !nodeIds.includes(n.id)))
          setEdges((eds) => eds.filter((e) => !nodeIds.includes(e.source) && !nodeIds.includes(e.target)))
          
          // Clear selection
          setSelectedNodes([])
          setSelectedNode(null)
          setIsPropertiesPanelOpen(false)
          
          // Show toast
          toast.success(`${selectedNodes.length} node(s) deleted`)
        }
      }
      
      // Copy key - copy selected nodes
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        if (selectedNodes.length > 0) {
          event.preventDefault()
          console.log('[Keyboard] Copy key pressed - copying selected nodes')
          copyNodes()
        }
      }
    }

    // Add event listener
    document.addEventListener('keydown', handleKeyDown)
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedNodes, isEditMode, autoEnterEditMode, setNodes, setEdges, setPlatform, updateDraftChanges, copyNodes, setSelectedNodes, setSelectedNode, setIsPropertiesPanelOpen, nodes, edges, platform])

  return (
    <div className="h-screen flex bg-background">
      <NodeSidebar onNodeDragStart={onNodeDragStart} platform={platform} />

      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-6 py-4">
            {/* Left Section - App Logo and Title */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Magic Flow</h1>
              </div>
              {currentVersion && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium">{currentVersion.name}</span>
                  {currentVersion.isPublished && !isEditMode ? (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">Published</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs px-2 py-0.5">Draft</Badge>
                  )}
                  {!isEditMode && !currentVersion.isPublished && (
                    <Badge variant="destructive" className="text-xs px-2 py-0.5">Previous</Badge>
                  )}
                </div>
              )}
            </div>

            {/* Center Section - Mode and Actions */}
            <div className="flex items-center gap-2">
              {/* Mode Toggle */}
              <Button 
                variant={isEditMode ? "default" : "ghost"} 
                size="sm"
                onClick={handleModeToggle}
                className="flex items-center gap-2 h-8 px-3"
              >
                <span className={`w-2 h-2 rounded-full ${isEditMode ? 'bg-white' : 'bg-muted-foreground'}`}></span>
                {isEditMode ? "Edit" : "View"}
              </Button>

              {/* Reset to Published Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm(getAllVersions().find(v => v.isPublished) 
                    ? "Reset to last published version? All unsaved changes will be lost." 
                    : "No published version exists. Clear everything?"
                  )) {
                    resetToPublished(setNodes, setEdges, setPlatform)
                    setSelectedNode(null)
                    setSelectedNodes([])
                    setIsPropertiesPanelOpen(false)
                    toast.success(getAllVersions().find(v => v.isPublished) 
                      ? "Reset to published version" 
                      : "Flow cleared"
                    )
                  }
                }}
                className="flex items-center gap-2 h-8 px-3"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </Button>
              
              {isEditMode && hasActualChanges(nodes, edges, platform) && (
                <ChangesModal changes={draftChanges}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-orange-600 border-orange-600 hover:bg-orange-50 hover:border-orange-700 transition-colors"
                  >
                    <Clock className="w-3 h-3 mr-1" />
                    {getChangesSummary()}
                  </Button>
                </ChangesModal>
              )}

              {/* Action Icons with Hover Animation */}
              <div className="flex items-center gap-1">
                <div className="relative group">
                  <ExportModal
                    flowData={{
                      nodes: nodes.map(({ data, ...node }) => ({ ...node, data })),
                      edges: edges.map(({ style, ...edge }) => edge),
                      platform,
                      timestamp: new Date().toISOString(),
                    }}
                    onImportFlow={importFlow}
                  >
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </ExportModal>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Export/Import Flow
                  </div>
                </div>

                <div className="relative group">
                  <VersionHistoryModal
                    versions={getAllVersions()}
                    currentVersion={currentVersion}
                    onLoadVersion={(version) => {
                      console.log('[App] Loading version from history:', version.name)
                      setIsLoadingVersion(true)
                      loadVersion(version, setNodes, setEdges, setPlatform)
                      setSelectedNode(null)
                      setSelectedNodes([])
                      setIsPropertiesPanelOpen(false)
                    }}
                    onDeleteVersion={(versionId) => {
                      console.log("Delete version:", versionId)
                    }}
                    onCreateVersion={async (name, description) => {
                      await createNewVersion(nodes, edges, platform, name, description)
                    }}
                    onPublishVersion={async (versionId) => {
                      await publishVersion(versionId)
                    }}
                    isEditMode={isEditMode}
                    hasChanges={hasActualChanges(nodes, edges, platform)}
                  >
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                      <History className="w-4 h-4" />
                    </Button>
                  </VersionHistoryModal>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Version History
                  </div>
                </div>

                <div className="relative group">
                  <PublishModal
                    changes={draftChanges}
                    hasUnsavedChanges={editModeState.hasUnsavedChanges}
                    onCreateVersion={async (name, description) => {
                      console.log('[App] Creating and publishing new version:', name)
                      setIsLoadingVersion(true)
                      const publishedVersion = await createAndPublishVersion(nodes, edges, platform, name, description)
                      if (publishedVersion) {
                        console.log('[App] Successfully created and published version:', publishedVersion.name)
                      }
                    }}
                    onPublishVersion={async (versionId, versionName, description) => {
                      console.log('[App] Publishing version and switching to view mode', {
                        versionId, versionName, description,
                        currentNodes: nodes.length, currentEdges: edges.length, currentPlatform: platform,
                        isEditMode, currentVersion: currentVersion?.name
                      })
                      setIsLoadingVersion(true)
                      const publishedVersion = await publishCurrentVersion(nodes, edges, platform, versionName, description)
                      if (publishedVersion) {
                        console.log('[App] Published version successfully:', publishedVersion.name, publishedVersion.isPublished)
                      } else {
                        console.log('[App] Failed to publish version')
                      }
                    }}
                    currentVersion={currentVersion}
                  >
                    <Button 
                      variant="ghost" 
                      size="sm"
                      disabled={(() => {
                        const hasChanges = hasActualChanges(nodes, edges, platform)
                        const changesCount = getChangesCount()
                        const isDisabled = !isEditMode || !hasChanges || changesCount === 0
                        return isDisabled
                      })()}
                      className="h-8 w-8 p-0 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                  </PublishModal>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Publish Changes
                  </div>
                </div>

                <div className="relative group">
                  <ScreenshotModal flowElementRef={flowElementRef}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-pointer">
                      <Camera className="w-4 h-4" />
                    </Button>
                  </ScreenshotModal>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Take Screenshot
                  </div>
                </div>
              </div>
            </div>
            {/* Right Section - Theme and Platform */}
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <div className="px-3 py-2 rounded-lg bg-muted/50">
                <PlatformSelector platform={platform} onPlatformChange={handlePlatformChange} />
              </div>
            </div>
          </div>
        </div>

        <div className="h-full pt-20">
          <ReactFlow
            ref={flowElementRef}
            key={`flow-${currentVersion?.id || 'default'}`}
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
                style: {
                  ...edge.style,
                  strokeWidth: 2,
                  stroke: "#6366f1",
                },
              }))}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onSelectionChange={onSelectionChange}
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
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode={["Control", "Meta"]}
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
                  Copy {selectedNodes.length > 1 ? `(${selectedNodes.length})` : ''}
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
              Add Question
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => addNodeAtPosition("quickReply")}
            >
              <MessageSquare className="w-4 h-4" />
              Add Quick Reply
            </button>
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => addNodeAtPosition("whatsappList")}
            >
              <List className="w-4 h-4" />
              Add WhatsApp List
            </button>
          </div>
        )}

        {nodeContextMenu.isOpen && (
          <div
            className="fixed bg-card border border-border rounded-md shadow-lg py-2 z-50 min-w-[160px]"
            style={{ left: nodeContextMenu.x, top: nodeContextMenu.y }}
            onMouseLeave={closeNodeContextMenu}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => {
                const node = nodes.find(n => n.id === nodeContextMenu.nodeId)
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
          isPropertiesPanelOpen ? "w-80" : "w-0"
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
        {!selectedNode && isPropertiesPanelOpen && (
          <div className="w-80">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Multiple Selection</h2>
              <Button variant="ghost" size="sm" onClick={() => setIsPropertiesPanelOpen(false)} className="h-8 w-8 p-0">
                <span className="sr-only">Close properties panel</span>×
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
                    const reactFlowElement = document.querySelector('.react-flow')
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
    </div>
  )
}
